import os
import re
import json
import torch
import soundfile as sf
import copy
from typing import List, Optional
from dataclasses import asdict
from loguru import logger

# Higgs Audio Imports
try:
    from boson_multimodal.model.higgs_audio import HiggsAudioConfig, HiggsAudioModel
    from boson_multimodal.data_collator.higgs_audio_collator import HiggsAudioSampleCollator
    from boson_multimodal.audio_processing.higgs_audio_tokenizer import load_higgs_audio_tokenizer
    from boson_multimodal.data_types import Message, ChatMLSample, AudioContent, TextContent
    from boson_multimodal.dataset.chatml_dataset import ChatMLDatasetSample, prepare_chatml_sample
    from boson_multimodal.model.higgs_audio.utils import revert_delay_pattern
    from transformers import AutoConfig, AutoTokenizer
    from transformers.cache_utils import StaticCache
except ImportError:
    print("WARNING: boson_multimodal not found or torch missing. HiggsGenerator will fail to init.")

from .reference_manager import DynamicReferenceManager

AUDIO_PLACEHOLDER_TOKEN = "<|__AUDIO_PLACEHOLDER__|>"

def normalize_chinese_punctuation(text):
    """
    Convert Chinese (full-width) punctuation marks to English (half-width) equivalents.
    Copied from higgs-audio/examples/generation.py
    """
    chinese_to_english_punct = {
        "，": ", ", "。": ".", "：": ":", "；": ";", "？": "?", "！": "!",
        "（": "(", "）": ")", "【": "[", "】": "]", "《": "<", "》": ">",
        """: '"', """: '"', "'": "'", "'": "'", "、": ",", "—": "-",
        "…": "...", "·": ".", "「": '"', "」": '"', "『": '"', "』": '"',
    }
    for zh_punct, en_punct in chinese_to_english_punct.items():
        text = text.replace(zh_punct, en_punct)
    return text

def strip_emotion_tags(text):
    """
    Strips emotion tags like [Happy], [Sad], [Excited] from text.
    These tags are used for reference audio selection but should not be spoken.
    Returns tuple: (cleaned_text, detected_emotion_tag or None)
    """
    # Pattern matches [Tag] at the start of text, capturing the tag name
    emotion_pattern = re.compile(r'^\s*\[([A-Za-z\u4e00-\u9fff]+)\]\s*')
    match = emotion_pattern.match(text)
    if match:
        emotion_tag = match.group(1)
        cleaned_text = text[match.end():]
        return cleaned_text, emotion_tag
    return text, None


def normalize_text_for_generation(text):
    """
    Full text normalization pipeline matching the official generation.py example.
    - Normalizes Chinese punctuation
    - Removes parentheses
    - Normalizes whitespace
    - Replaces sound effect tags with model-specific tokens
    - Ensures text ends with valid punctuation
    """
    # Step 1: Normalize Chinese punctuation
    text = normalize_chinese_punctuation(text)
    
    # Step 2: Remove parentheses (they can confuse the model)
    text = text.replace("(", " ")
    text = text.replace(")", " ")
    text = text.replace("（", " ")
    text = text.replace("）", " ")
    
    # Step 3: Normalize whitespace - collapse multiple spaces, clean up lines
    lines = text.split("\n")
    text = "\n".join([" ".join(line.split()) for line in lines if line.strip()])
    text = text.strip()
    
    # Step 4: Sound Effect Tag Mapping
    # Based on higgs-audio/examples/generation.py
    tag_mapping = [
        ("[laugh]", "<SE>[Laughter]</SE>"),
        ("[humming start]", "<SE_s>[Humming]</SE_s>"),
        ("[humming end]", "<SE_e>[Humming]</SE_e>"),
        ("[music start]", "<SE_s>[Music]</SE_s>"),
        ("[music end]", "<SE_e>[Music]</SE_e>"),
        ("[music]", "<SE>[Music]</SE>"),
        ("[sing start]", "<SE_s>[Singing]</SE_s>"),
        ("[sing end]", "<SE_e>[Singing]</SE_e>"),
        ("[applause]", "<SE>[Applause]</SE>"),
        ("[cheering]", "<SE>[Cheering]</SE>"),
        ("[cough]", "<SE>[Cough]</SE>"),
    ]
    
    for tag, replacement in tag_mapping:
        text = text.replace(tag, replacement)
    
    # Step 5: Ensure text ends with valid punctuation (CRITICAL for model to stop)
    valid_endings = [".", "!", "?", ",", ";", '"', "'", "</SE_e>", "</SE>"]
    if not any([text.endswith(c) for c in valid_endings]):
        text += "."
    
    return text

class HiggsGenerator:
    def __init__(
        self,
        model_path,
        audio_tokenizer_path,
        device="cuda",
        max_new_tokens=5120,
        use_static_kv_cache=True,
        kv_cache_lengths=[2048, 4196, 8192, 16384]
    ):
        self.device = device
        self.model_path = model_path
        self.audio_tokenizer_path = audio_tokenizer_path
        self.max_new_tokens = max_new_tokens
        self._kv_cache_lengths = kv_cache_lengths
        self._use_static_kv_cache = use_static_kv_cache

        logger.info(f"Loading Higgs Model from {model_path} to {device}")
        
        # Load Components
        self.model = HiggsAudioModel.from_pretrained(
            model_path, 
            device_map=device, 
            torch_dtype=torch.bfloat16
        )
        self.model.eval()
        
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.config = AutoConfig.from_pretrained(model_path)
        
        # Load Audio Tokenizer
        tokenizer_device = "cpu" if device == "mps" else device
        self.audio_tokenizer = load_higgs_audio_tokenizer(audio_tokenizer_path, device=tokenizer_device)
        
        # Setup Collator
        self.collator = HiggsAudioSampleCollator(
            whisper_processor=None,
            audio_in_token_id=self.config.audio_in_token_idx,
            audio_out_token_id=self.config.audio_out_token_idx,
            audio_stream_bos_id=self.config.audio_stream_bos_id,
            audio_stream_eos_id=self.config.audio_stream_eos_id,
            encode_whisper_embed=self.config.encode_whisper_embed,
            pad_token_id=self.config.pad_token_id,
            return_audio_in_tokens=self.config.encode_audio_in_tokens,
            use_delay_pattern=self.config.use_delay_pattern,
            round_to=1,
            audio_num_codebooks=self.config.audio_num_codebooks,
        )
        
        self.kv_caches = None
        if use_static_kv_cache:
            self._init_static_kv_cache()

    def _init_static_kv_cache(self):
        logger.info("Initializing Static KV Cache...")
        cache_config = copy.deepcopy(self.model.config.text_config)
        cache_config.num_hidden_layers = self.model.config.text_config.num_hidden_layers
        if self.model.config.audio_dual_ffn_layers:
            cache_config.num_hidden_layers += len(self.model.config.audio_dual_ffn_layers)
        
        self.kv_caches = {
            length: StaticCache(
                config=cache_config,
                max_batch_size=1,
                max_cache_len=length,
                device=self.model.device,
                dtype=self.model.dtype,
            )
            for length in sorted(self._kv_cache_lengths)
        }
        
        # Compile CUDA graphs if using CUDA
        if "cuda" in self.device:
            logger.info("Capturing CUDA graphs...")
            self.model.capture_model(self.kv_caches.values())

    def _prepare_kv_caches(self):
        for kv_cache in self.kv_caches.values():
            kv_cache.reset()

    @torch.inference_mode()
    def generate_streamed(
        self,
        chunks: List[str],
        ref_audio_path: Optional[str] = None,
        output_dir: str = "/tmp",
        job_id: str = "default_job",
        ref_text: Optional[str] = None,
        temperature=0.9,
        top_k=50,
        top_p=0.95,
        reference_manager: Optional[DynamicReferenceManager] = None,
        ref_audio_user_id: str = "user_1",
        generation_chunk_buffer_size: int = 3
    ) -> List[str]:
        """
        Generates audio for each chunk, saves to disk, and returns the list of file paths.
        Maintains a rolling buffer of audio history context.
        """
        generated_files = []
        
        if not ref_audio_path:
            if reference_manager and chunks:
                ref_audio_path, ref_text = reference_manager.get_reference(chunks[0], user_id=ref_audio_user_id)
                logger.info(f"Resolved initial reference from manager: {ref_audio_path}")

            if not ref_audio_path:
                 # Fallback for mock mode or failure
                 logger.warning("No reference audio provided and ReferenceManager could not resolve one.")
                 # If we are really stuck, maybe we shouldn't crash until we try to use it, 
                 # but encode() below will crash if path is None.
                 # Let's assume the caller ensures this won't happen or we have a fail-safe.
                 raise ValueError("Reference audio is missing and cannot be resolved.")

        # Ref Audio Preparation
        ref_audio_tokens = self.audio_tokenizer.encode(ref_audio_path)
        
        # Smart Truncation: Ensure ref_audio fits in context
        # Max context is max(kv_cache_lengths). We need to reserve space for system prompt, text, and generation.
        # MAX_REF_TOKENS = 6144 (approx 120s).
        # Budget Split (16384 bucket): Ref(6144) + Gen(5120) + History(5120).
        MAX_REF_TOKENS = 6144 
        if ref_audio_tokens.shape[1] > MAX_REF_TOKENS:
            logger.warning(f"Reference audio length ({ref_audio_tokens.shape[1]} tokens) exceeds limit. Truncating to last {MAX_REF_TOKENS} tokens.")
            ref_audio_tokens = ref_audio_tokens[:, -MAX_REF_TOKENS:]
        
        # Context State
        audio_ids = [ref_audio_tokens] # Start with ref audio
        generated_audio_ids_history = [] # Rolling buffer of generated chunks
        generation_messages_history = [] # Rolling buffer of text messages
        
        # System Prompt aligned with official example format
        # Using scene description tags for consistency
        system_prompt = (
            "Generate audio following instruction.\n\n"
            "<|scene_desc_start|>\n"
            "你是一个专业的讲故事的人。请以充满情感和表现力的声音朗读文本。\n"
            "<|scene_desc_end|>"
        )
        
        # Base Messages (System + Reference)
        ref_user_content = ref_text if ref_text else "Here is a reference voice."
        
        # Helper to update context when reference changes
        def update_reference_context(new_ref_path, new_ref_text):
            nonlocal audio_ids, ref_audio_tokens
            
            # Encode new reference
            new_tokens = self.audio_tokenizer.encode(new_ref_path)
            
            # Truncate if needed
            if new_tokens.shape[1] > MAX_REF_TOKENS:
                logger.warning(f"Reference audio {os.path.basename(new_ref_path)} exceeds limit. Truncating.")
                new_tokens = new_tokens[:, -MAX_REF_TOKENS:]
            
            ref_audio_tokens = new_tokens
            audio_ids = [ref_audio_tokens]
            
            # Rebuild base messages
            new_base_messages = [
                Message(role="system", content=system_prompt),
                Message(role="user", content=new_ref_text if new_ref_text else "Here is a reference voice."),
                Message(role="assistant", content=AudioContent(audio_url=new_ref_path)),
            ]
            return new_base_messages

        base_messages = update_reference_context(ref_audio_path, ref_user_content)

        current_ref_path = ref_audio_path
        current_ref_text = ref_user_content

        for i, chunk_text in enumerate(chunks):
            logger.info(f"Processing Chunk {i+1}/{len(chunks)}...")
            
            # Dynamic Reference Switching
            if reference_manager:
                new_ref_path, new_ref_text = reference_manager.get_reference(chunk_text, user_id=ref_audio_user_id)
                if new_ref_path and new_ref_path != current_ref_path:
                    logger.info(f"Switching reference audio to: {os.path.basename(new_ref_path)}")
                    try:
                        base_messages = update_reference_context(new_ref_path, new_ref_text)
                        current_ref_path = new_ref_path
                        current_ref_text = new_ref_text
                        
                        # Clear history when reference changes to avoid style contamination
                        # Old generated audio was in a different voice/style
                        generated_audio_ids_history = []
                        generation_messages_history = []
                        logger.info("Cleared audio history after reference change.")
                    except Exception as e:
                        logger.error(f"Failed to switch reference audio: {e}")
                        # Fallback to existing reference
            
            # Strip emotion tag (used for ref selection) and normalize text
            text_for_generation, detected_emotion = strip_emotion_tags(chunk_text)
            processed_text = normalize_text_for_generation(text_for_generation)
            logger.debug(f"Chunk {i+1}: Emotion={detected_emotion}, Text={processed_text}")
            
            # Construct Current Message
            current_message = Message(role="user", content=processed_text)
            
            # Combine history with current
            chat_messages = base_messages + generation_messages_history + [current_message]
            
            chatml_sample = ChatMLSample(messages=chat_messages)
            input_tokens, _, _, _ = prepare_chatml_sample(chatml_sample, self.tokenizer)
            
            # Add assistant trigger
            postfix = self.tokenizer.encode(
                "<|start_header_id|>assistant<|end_header_id|>\n\n", add_special_tokens=False
            )
            input_tokens.extend(postfix)
            
            # Context Audio (Ref + Recent History)
            context_audio_ids = audio_ids + generated_audio_ids_history
            
            # Build Dataset Sample
            curr_sample = ChatMLDatasetSample(
                input_ids=torch.LongTensor(input_tokens),
                label_ids=None,
                audio_ids_concat=torch.concat([ele.cpu() for ele in context_audio_ids], dim=1) if context_audio_ids else None,
                audio_ids_start=torch.cumsum(
                    torch.tensor([0] + [ele.shape[1] for ele in context_audio_ids], dtype=torch.long), dim=0
                ) if context_audio_ids else None,
                audio_waveforms_concat=None,
                audio_waveforms_start=None,
                audio_sample_rate=None,
                audio_speaker_indices=None,
            )
            
            # Collate
            batch_data = self.collator([curr_sample])
            batch = asdict(batch_data)
            for k, v in batch.items():
                if isinstance(v, torch.Tensor):
                    batch[k] = v.contiguous().to(self.device)

            # --- BUDGET ENFORCEMENT ---
            # Max bucket size
            max_bucket = max(self._kv_cache_lengths) if self._use_static_kv_cache else 8192
            
            # Current input length
            current_input_len = input_tokens.shape[0] if isinstance(input_tokens, torch.Tensor) else len(input_tokens)
            # Audio IDs length (Ref + History)
            current_audio_len = sum([ele.shape[1] for ele in context_audio_ids]) if context_audio_ids else 0
            
            # Total context occupied before generation
            total_context = current_input_len + current_audio_len
            
            # Remaining budget for generation
            remaining_budget = max_bucket - total_context
            
            # If we don't have enough room for requested max_new_tokens
            if remaining_budget < self.max_new_tokens:
                logger.warning(f"Context ({total_context}) too large for max_new_tokens ({self.max_new_tokens}) in {max_bucket} bucket. Trimming...")
                
                # Strategy 1: Trim History
                while generated_audio_ids_history and (max_bucket - (current_input_len + sum([ele.shape[1] for ele in context_audio_ids]))) < self.max_new_tokens:
                    logger.info("Dropping oldest history chunk to fit context.")
                    generated_audio_ids_history.pop(0)
                    generation_messages_history.pop(0) # Remove corresponding user msg
                    generation_messages_history.pop(0) # Remove corresponding assistant msg
                    
                    # Recompute context
                    context_audio_ids = audio_ids + generated_audio_ids_history
                    
                    # Rebuild messages for consistency (though audio_ids is the main driver for size)
                    chat_messages = base_messages + generation_messages_history + [current_message]
                    # Note: We technically should re-tokenize text if we drop messages, but the audio tokens are the bulk.
                    # The text tokens for dropped messages (user prompts) are small. 
                    # Let's just focus on audio_ids for the heavy lifting.
                
                # Recalculate audio len
                current_audio_len = sum([ele.shape[1] for ele in context_audio_ids]) if context_audio_ids else 0
                total_context = current_input_len + current_audio_len
                remaining_budget = max_bucket - total_context

                # Strategy 2: If still too big, truncate Reference (Desperate measure)
                if remaining_budget < self.max_new_tokens:
                     overhead = self.max_new_tokens - remaining_budget
                     # audio_ids[0] is the ref audio
                     if audio_ids and audio_ids[0].shape[1] > overhead + 200: # Ensure we don't kill it entirely
                         logger.warning(f"Still too big. Truncating reference audio by {overhead} tokens.")
                         audio_ids[0] = audio_ids[0][:, :-overhead]
                         context_audio_ids = audio_ids + generated_audio_ids_history

                # Final Re-Build of Sample with trimmed context
                curr_sample = ChatMLDatasetSample(
                    input_ids=torch.LongTensor(input_tokens),
                    label_ids=None,
                    audio_ids_concat=torch.concat([ele.cpu() for ele in context_audio_ids], dim=1) if context_audio_ids else None,
                    audio_ids_start=torch.cumsum(
                        torch.tensor([0] + [ele.shape[1] for ele in context_audio_ids], dtype=torch.long), dim=0
                    ) if context_audio_ids else None,
                    audio_waveforms_concat=None,
                    audio_waveforms_start=None,
                    audio_sample_rate=None,
                    audio_speaker_indices=None,
                )
                
                # Re-Collate
                batch_data = self.collator([curr_sample])
                batch = asdict(batch_data)
                for k, v in batch.items():
                    if isinstance(v, torch.Tensor):
                        batch[k] = v.contiguous().to(self.device)

            if self._use_static_kv_cache:
                self._prepare_kv_caches()

            # --- GENERATION ---
            outputs = self.model.generate(
                **batch,
                max_new_tokens=self.max_new_tokens,
                use_cache=True,
                do_sample=True,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                past_key_values_buckets=self.kv_caches,
                ras_win_len=7,
                ras_win_max_num_repeat=2,
                stop_strings=["<|end_of_text|>", "<|eot_id|>"],
                tokenizer=self.tokenizer
            )
            
            # Process Output Audio Tokens
            step_audio_out_ids_l = []
            for ele in outputs[1]:
                audio_out_ids = ele
                if self.config.use_delay_pattern:
                    audio_out_ids = revert_delay_pattern(audio_out_ids)
                step_audio_out_ids_l.append(audio_out_ids.clip(0, self.audio_tokenizer.codebook_size - 1)[:, 1:-1])
            
            new_audio_tokens = torch.concat(step_audio_out_ids_l, dim=1)
            
            # Save Audio File
            # Decode just this chunk
            if new_audio_tokens.device.type == "mps":
                tokens_for_decode = new_audio_tokens.detach().cpu()
            else:
                tokens_for_decode = new_audio_tokens
                
            chunk_wav = self.audio_tokenizer.decode(tokens_for_decode.unsqueeze(0))[0, 0]
            if isinstance(chunk_wav, torch.Tensor):
                chunk_wav = chunk_wav.float().cpu().numpy()
            
            chunk_filename = os.path.join(output_dir, f"chunk_{job_id}_{i:03d}.wav")
            sf.write(chunk_filename, chunk_wav, 24000)
            generated_files.append(chunk_filename)
            
            # Update History
            generated_audio_ids_history.append(new_audio_tokens)
            generation_messages_history.append(current_message)
            generation_messages_history.append(
                Message(role="assistant", content=AudioContent(audio_url="")) # Placeholder
            )
            
            # Trim Buffer
            if len(generated_audio_ids_history) > generation_chunk_buffer_size:
                generated_audio_ids_history = generated_audio_ids_history[-generation_chunk_buffer_size:]
                # Each round adds 2 messages (User + Assistant), so remove 2
                generation_messages_history = generation_messages_history[-(2 * generation_chunk_buffer_size):]
            
            # Clear Cache
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        return generated_files

def merge_audio_files(file_paths, output_path):
    """
    Merges multiple WAV files into one using ffmpeg.
    """
    if not file_paths:
        return
    import subprocess
        
    list_file = output_path + ".txt"
    try:
        with open(list_file, 'w') as f:
            for path in file_paths:
                f.write(f"file '{path}'\n")
        
        cmd = [
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', list_file, '-c', 'copy', output_path
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        print(f"Merge failed: {e}")
        raise e
    finally:
        if os.path.exists(list_file):
            os.remove(list_file)
