import torch
import numpy as np
from dataclasses import dataclass, field
from .config import KV_CACHE_SIZE

# Import Boson AI Higgs
try:
    from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine
    from boson_multimodal.data_types import ChatMLSample, Message, AudioContent, TextContent
    from boson_multimodal.dataset.chatml_dataset import ChatMLDatasetSample
    from boson_multimodal.data_collator.higgs_audio_collator import HiggsAudioSampleCollator
    from boson_multimodal.model.higgs_audio.utils import revert_delay_pattern
    HIGGS_AVAILABLE = True
except ImportError as e:
    HIGGS_AVAILABLE = False
    print(f"WARNING: boson_multimodal not found: {e}")
    @dataclass
    class Message:
        role: str
        content: str
    @dataclass
    class ChatMLSample:
        messages: list = field(default_factory=list)
        meta_info: dict = field(default_factory=dict)
    
    class HiggsAudioServeEngine: pass

class CachedHiggsEngine(HiggsAudioServeEngine):
    """
    Extended Engine that matches the reference generation.py implementation
    and supports in-context voice cloning.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def generate_with_voice(
        self,
        text_prompt: str,
        voice_audio_ids: torch.Tensor,
        voice_transcript: str,
        max_new_tokens: int = 2048,
        temperature: float = 0.7,
        top_p: float = 0.95
    ):
        """
        Generate audio using a reference voice (in-context cloning).
        Matches the logic in higgs-audio/examples/generation.py
        """
        if not HIGGS_AVAILABLE:
            return None, 24000

        with torch.no_grad():
            # 1. Build ChatML Sample with Reference Audio (Few-shot style)
            messages = [
                Message(role="system", content="Generate audio following instruction."),
                Message(role="user", content=voice_transcript),
                Message(role="assistant", content=[AudioContent(audio_url="placeholder")]),
                Message(role="user", content=text_prompt)
            ]
            chat_ml_sample = ChatMLSample(messages=messages)

            # 2. Prepare Dataset Sample
            # We need to convert ChatMLSample to ChatMLDatasetSample
            from boson_multimodal.dataset.chatml_dataset import prepare_chatml_sample
            input_tokens, label_tokens, audio_contents, speaker_id = prepare_chatml_sample(
                chat_ml_sample, self.tokenizer
            )
            
            # Add Assistant Header (Crucial for model to start generating)
            postfix = self.tokenizer.encode(
                "<|start_header_id|>assistant<|end_header_id|>\n\n", add_special_tokens=False
            )
            input_tokens.extend(postfix)

            # 3. Inject Cached Audio IDs
            # prepare_chatml_sample returns audio_contents which are just the AudioContent objects.
            # We need to build the ChatMLDatasetSample and inject the voice_audio_ids.
            
            # voice_audio_ids should be [num_codebooks, seq_len]
            if voice_audio_ids.dim() == 3:
                voice_audio_ids = voice_audio_ids.squeeze(0)
            
            # Create the dataset sample
            dataset_sample = ChatMLDatasetSample(
                input_ids=torch.tensor(input_tokens, dtype=torch.long),
                label_ids=None,
                audio_ids_concat=voice_audio_ids.cpu(),
                audio_ids_start=torch.tensor([0], dtype=torch.long),
                audio_waveforms_concat=None,
                audio_waveforms_start=None,
                audio_sample_rate=None,
                audio_speaker_indices=None,
            )

            # 4. Collate and Prepare Model Inputs
            # This handles the late merging and placeholder expansion correctly.
            batch = self.collator([dataset_sample])
            
            # Move to device
            from dataclasses import asdict
            inputs = {k: v.to(self.device) if isinstance(v, torch.Tensor) else v for k, v in asdict(batch).items()}
            
            # 5. Handle KV Cache
            self._prepare_kv_caches()
            
            # 6. Calculate Safe Max New Tokens
            input_len = inputs["input_ids"].shape[1]
            max_cache_len = max(self.kv_caches.keys())
            available_tokens = max_cache_len - input_len
            
            if available_tokens <= 0:
                print(f"WARNING: Input length {input_len} exceeds cache size {max_cache_len}. Trimming...")
                # In a real scenario, we might want to trim the input_ids or audio_ids
                safe_max_new_tokens = 64 # Emergency minimum
            else:
                safe_max_new_tokens = min(max_new_tokens, available_tokens - 1)

            # 7. Generate
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=safe_max_new_tokens,
                use_cache=True,
                tokenizer=self.tokenizer,
                do_sample=True,
                temperature=temperature,
                top_p=top_p,
                past_key_values_buckets=self.kv_caches,
                ras_win_len=7,
                ras_win_max_num_repeat=2,
                stop_strings=["<|end_of_text|>", "<|eot_id|>"],
            )

            # 8. Decode Response
            if len(outputs[1]) > 0:
                audio_out_ids_list = []
                for output_audio in outputs[1]:
                    audio_out_ids = output_audio
                    if self.model.config.use_delay_pattern:
                        audio_out_ids = revert_delay_pattern(audio_out_ids)
                    vq_code = audio_out_ids.clip(0, self.audio_codebook_size - 1)[:, 1:-1]
                    audio_out_ids_list.append(vq_code)
                
                concat_audio_out_ids = torch.cat(audio_out_ids_list, dim=1)
                wv_numpy = self.audio_tokenizer.decode(concat_audio_out_ids.unsqueeze(0))[0, 0]
            else:
                wv_numpy = None
                
            return wv_numpy, self.audio_tokenizer.sampling_rate

# Global Engine Instance
serve_engine = None
startup_error = None
