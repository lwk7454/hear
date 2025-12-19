import torch
from dataclasses import dataclass, field, asdict
from .config import KV_CACHE_SIZE

# Import Boson AI Higgs
try:
    from boson_multimodal.serve.serve_engine import HiggsAudioServeEngine, HiggsAudioResponse
    from boson_multimodal.data_types import ChatMLSample, Message
    from dataclasses import asdict
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
    class HiggsAudioResponse: pass

# --- Cached Engine Subclass ---
if HIGGS_AVAILABLE:
    class CachedHiggsEngine(HiggsAudioServeEngine):
        """
        Extended Engine that supports passing pre-computed audio tensors (audio_ids)
        to skip re-tokenization of large reference files.
        """
        def generate_with_cache(
            self,
            chat_ml_sample: ChatMLSample,
            cached_audio_ids: torch.Tensor,
            max_new_tokens: int = 2048,
            temperature: float = 0.7,
            top_p: float = 0.95
        ):
            """
            """
            with open("debug_log.txt", "a") as f:
                f.write("DEBUG: generate_with_cache called\n")
            with torch.no_grad():
                # Get standard inputs (text tokens etc)
                # We assume the chat_ml_sample has NO audio, or we overwrite it.
                inputs = self._prepare_inputs(chat_ml_sample, force_audio_gen=True)
                
                # Calculate Input Lengths
                input_len = inputs["input_ids"].shape[1]
                audio_len = cached_audio_ids.shape[1] if cached_audio_ids is not None else 0
                
                # Trim Audio if needed to fit Cache
                # We reserve space for input text + some generation buffer
                reserved_gen = 128 # Minimum tokens to generate
                max_allowed_audio = KV_CACHE_SIZE - input_len - reserved_gen
                
                if audio_len > max_allowed_audio:
                    new_len = max(0, max_allowed_audio)
                    print(f"--> Trimming audio cache from {audio_len} to {new_len} to fit KV_CACHE_SIZE ({KV_CACHE_SIZE})")
                    if new_len > 0:
                        cached_audio_ids = cached_audio_ids[:, -new_len:]
                    else:
                        cached_audio_ids = torch.empty((1, 0), dtype=cached_audio_ids.dtype)
                    audio_len = cached_audio_ids.shape[1]

                # INJECT CACHE
                # inputs is a dict of tensors on device
                # cached_audio_ids shape: [1, seq_len] -> needs to be injected in 'audio_ids_concat'
                
                # Verify key names based on source inspection
                # FORCE INJECTION - The base engine might not prep this key if no audio provided initially
                # but we want to force it for cloning.
                # Ensure cached_audio_ids has shape [8, T] (flattened batch for audio_out_ids)
                if cached_audio_ids.dim() == 3:
                    cached_audio_ids = cached_audio_ids.squeeze(0)
                
                print(f"--> Injected Cache IDs: {cached_audio_ids.shape}")
                inputs["audio_out_ids"] = cached_audio_ids.to(self.device)
                inputs["audio_out_ids_start"] = torch.tensor([0], dtype=torch.long, device=self.device)
                
                # FIX: Append audio_out_token_idx to input_ids to create a placeholder for the injected audio
                # The model expects a placeholder token where the audio embeddings should be merged.
                if hasattr(self.model.config, "audio_out_token_idx"):
                    audio_out_token_id = self.model.config.audio_out_token_idx
                    # input_ids is [1, seq_len]
                    
                    # We need one placeholder for EACH audio token in the cache
                    # cached_audio_ids shape is [1, 8, T] or [1, T] depending on codebook?
                    # Actually cached_audio_ids is [1, num_codebooks, seq_len] usually?
                    # Let's check the shape printed in logs: [1, 8, 1849]
                    # The model likely flattens this or expects seq_len placeholders.
                    # Based on utils.py merge function:
                    # It seems to expect one placeholder per time step (seq_len).
                    
                    # We need exactly ONE placeholder token for the entire audio sequence.
                    # The merge_input_ids_with_audio_features function will expand this single token
                    # to the length of the audio_out_embed.
                    
                    with open("debug_log.txt", "a") as f:
                        f.write(f"DEBUG: cached_audio_ids shape: {cached_audio_ids.shape}\n")
                        f.write(f"DEBUG: input_ids before: {inputs['input_ids'].shape}\n")
                        count = (inputs["input_ids"] == audio_out_token_id).sum()
                        f.write(f"DEBUG: placeholders before: {count}\n")
                        f.write(f"DEBUG: model.config.use_delay_pattern: {getattr(self.model.config, 'use_delay_pattern', 'N/A')}\n")
                        f.write(f"DEBUG: model.config.audio_num_codebooks: {getattr(self.model.config, 'audio_num_codebooks', 'N/A')}\n")
                        f.write(f"DEBUG: model.config.audio_stream_bos_id: {getattr(self.model.config, 'audio_stream_bos_id', 'N/A')}\n")
                        f.write(f"DEBUG: cached_audio_ids first 10 tokens (cb0): {cached_audio_ids[0, :10].tolist()}\n")

                    placeholder = torch.full(
                        (1, 1), 
                        audio_out_token_id, 
                        device=self.device, 
                        dtype=inputs["input_ids"].dtype
                    )
                    inputs["input_ids"] = torch.cat([inputs["input_ids"], placeholder], dim=1)
                    
                    with open("debug_log.txt", "a") as f:
                        f.write(f"DEBUG: input_ids after: {inputs['input_ids'].shape}\n")
                    
                    # Also update attention_mask if present
                    if "attention_mask" in inputs:
                        mask_placeholder = torch.ones(
                            (1, 1), 
                            device=self.device, 
                            dtype=inputs["attention_mask"].dtype
                        )
                        inputs["attention_mask"] = torch.cat([inputs["attention_mask"], mask_placeholder], dim=1)
                
                self._prepare_kv_caches()
                
                # Calculate Safe Max New Tokens
                # Total Length = Input Text Tokens + Audio Tokens + New Tokens
                input_len = inputs["input_ids"].shape[1]
                audio_len = cached_audio_ids.shape[1] if cached_audio_ids is not None else 0
                
                # Get max cache size from buckets
                max_cache_len = max(self.kv_caches.keys())
                
                # Reserve space for input
                # input_len is small (text + 1 placeholder), so we MUST add audio_len to account for expansion.
                available_tokens = max_cache_len - (input_len + audio_len)
                
                if available_tokens <= 0:
                    raise ValueError(f"Input length ({input_len} + {audio_len} = {input_len + audio_len}) exceeds cache size ({max_cache_len}).")
                
                # Clamp max_new_tokens
                safe_max_new_tokens = min(max_new_tokens, available_tokens - 1) # -1 buffer
                
                print(f"--> Gen Limit: {safe_max_new_tokens} (Input: {input_len}, Cache: {max_cache_len})")

                outputs = self.model.generate(
                    **inputs,
                    max_new_tokens=safe_max_new_tokens,
                    use_cache=True,
                    tokenizer=self.tokenizer,
                    do_sample=True,
                    temperature=temperature,
                    top_p=top_p,
                    past_key_values_buckets=self.kv_caches
                )
                
                # Decoding Response (Same as original)
                if len(outputs[1]) > 0:
                    wv_list = []
                    from boson_multimodal.model.higgs_audio.utils import revert_delay_pattern
                    import numpy as np
                    
                    for output_audio in outputs[1]:
                        vq_code = revert_delay_pattern(output_audio).clip(0, self.audio_codebook_size - 1)[:, 1:-1]
                        wv_numpy = self.audio_tokenizer.decode(vq_code.unsqueeze(0))[0, 0]
                        wv_list.append(wv_numpy)
                    wv_numpy = np.concatenate(wv_list)
                else:
                    wv_numpy = None
                    
                return wv_numpy, self.audio_tokenizer.sampling_rate

else:
    CachedHiggsEngine = None

# Global Engine Instance
serve_engine = None
startup_error = None
