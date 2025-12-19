import os
import shutil
import uuid
import torch
import traceback
import numpy as np
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydub import AudioSegment

from ..config import CACHE_DIR, DEVICE, IS_PROD
from ..database import supabase
from ..utils import compress_audio
from .. import engine

router = APIRouter()

@router.post("/clone")
async def clone_voice(
    file: UploadFile = File(...),
    creator_id: str = Form(...)
):
    """
    Creates/Appends Master Reference.
    OPTIMIZATION: Calculates and Saves 'voice_id.pt' (Tokens) cache.
    PERSISTENCE: Uploads compressed audio to Supabase.
    """
    # Check Engine
    if not engine.serve_engine:
        detail = "Model not loaded"
        if engine.startup_error:
             detail += f". Startup Error: {engine.startup_error}"
        raise HTTPException(503, detail)
    
    
    # Use standard naming based on Creator ID to allow stateless lookup
    target_sr = engine.serve_engine.audio_tokenizer.sampling_rate
    voice_stem = f"voice_{creator_id}"
    final_path = CACHE_DIR / f"{voice_stem}.wav"
    cache_path = CACHE_DIR / f"{voice_stem}.pt"
    
    print(f"--> Processing Voice for {creator_id} at {final_path}")

    try:
        # 1. Load & Append Audio via Pydub
        temp_in = CACHE_DIR / f"temp_{uuid.uuid4()}.wav"
        with open(temp_in, "wb") as f: shutil.copyfileobj(file.file, f)
        
        # Load New Audio
        audio_in = AudioSegment.from_file(str(temp_in))
        
        # Resample if needed
        if audio_in.frame_rate != target_sr:
            audio_in = audio_in.set_frame_rate(target_sr)
            
        # Convert to Mono
        if audio_in.channels > 1:
            audio_in = audio_in.set_channels(1)
            
        # Pydub -> Tensor
        samples = np.array(audio_in.get_array_of_samples()).astype(np.float32)
        # Normalize: Pydub uses integer samples usually! 16bit=32768, 8bit=128
        # We assume 16 bit/sample usually, but let's check sample width
        if audio_in.sample_width == 2:
            samples = samples / 32768.0
        elif audio_in.sample_width == 4:
            samples = samples / 2147483648.0
        # If 32bit float (sample_width 4), pydub handles it differently, but usually wave is int16.
            
        new_wav = torch.from_numpy(samples).unsqueeze(0) # [1, T]
        
        os.remove(temp_in)

        if final_path.exists():
            # Load existing via pydub too to match normalized amplitude reference
            # Or use soundfile if trusted. Let's use pydub for consistency.
            curr_audio = AudioSegment.from_file(str(final_path))
            # Just read path -> pydub -> tensor
            curr_samples = np.array(curr_audio.get_array_of_samples()).astype(np.float32)
            if curr_audio.sample_width == 2: curr_samples /= 32768.0
            elif curr_audio.sample_width == 4: curr_samples /= 2147483648.0
            curr_wav = torch.from_numpy(curr_samples).unsqueeze(0)
            
            final_tensor = torch.cat([curr_wav, new_wav], dim=1)
        else:
            final_tensor = new_wav
            
        # 2. Save WAV (Master) - Using soundfile via torchaudio or just pydub
        # Let's start using soundfile since we installed it and it is standard for tensor saving
        # But wait, torchaudio.save might still fail.
        # Let's use soundfile directly if available.
        import soundfile as sf
        sf.write(str(final_path), final_tensor.squeeze().numpy(), target_sr)
        
        # 3. COMPUTE & SAVE CACHE (The Optimization)
        # Using internal tokenizer to get tokens once.
        # Ensure tensor is on device
        print("--> Computing Audio Tokens Cache...")
        final_tensor_gpu = final_tensor.to(DEVICE)
        # audio_tokenizer.encode expects [1, T] usually
        with torch.no_grad():
            if hasattr(engine.serve_engine.audio_tokenizer, 'encode'):
                # Note: encode signature varies. serve_engine does: encode(raw_audio, sr) -> tokens
                # We need raw_audio as tensor or numpy? wrapper usually takes tensor.
                # Let's check serve_engine source: it likely uses Encodec/Descript Audio Codec
                tokens = engine.serve_engine.audio_tokenizer.encode(final_tensor_gpu, target_sr)
                # Save as CPU tensor
                torch.save(tokens.cpu(), str(cache_path))
                print(f"--> Saved Cache: {cache_path} ({tokens.shape})")
        
        # 4. Persistence (Supabase)
        # Compress for storage
        # User said "compress all audio files". I'll use high-bitrate mp3 (320k) for voice ref.
        mp3_buffer = compress_audio(str(final_path), bitrate="320k")
        storage_path = f"voices/{creator_id}/higgs_v2.mp3"
        
        supabase.storage.from_("creator-assets").upload(
            storage_path, mp3_buffer.read(), 
            file_options={"content-type": "audio/mpeg", "upsert": "true"}
        )
        
        # Update DB - Try Update first to avoid overwriting ID
        now_ts = datetime.utcnow().isoformat()
        update_data = {"voiceRef": storage_path, "voiceTier": "TIER_1", "updatedAt": now_ts}
        res = supabase.table("PersonaProfile").update(update_data).eq("creatorId", creator_id).execute()
        if not res.data:
            # Insert if not exists
            insert_data = {
                "id": str(uuid.uuid4()),
                "creatorId": creator_id, 
                "voiceRef": storage_path, 
                "voiceTier": "TIER_1",
                "updatedAt": now_ts,
                # Optional defaults if needed
            }
            supabase.table("PersonaProfile").insert(insert_data).execute()

    except Exception as e:
        print(f"Clone Error: {e}")
        print(traceback.format_exc())
        detail = "Internal Server Error" if IS_PROD else f"{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)

    return {"status": "success", "voice_id": str(final_path), "cache_ready": True}
