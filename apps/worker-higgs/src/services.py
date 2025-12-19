import torch
import numpy as np
import traceback
from pathlib import Path
from fastapi import HTTPException
from pydub import AudioSegment
from .config import CACHE_DIR, DEVICE, IS_PROD
from .database import supabase

def ensure_voice_cache(creator_id: str, serve_engine) -> Path:
    """
    Ensures the voice cache (.pt) exists locally.
    If missing, attempts to download from Supabase.
    """
    voice_stem = f"voice_{creator_id}"
    cache_pt = CACHE_DIR / f"{voice_stem}.pt"
    local_wav = CACHE_DIR / f"{voice_stem}.wav"
    
    if cache_pt.exists():
        return cache_pt
        
    print(f"--> Cache miss for {creator_id}. Attempting hydration from Supabase...")
    
    if not supabase:
        raise HTTPException(404, "Voice not found locally and Supabase not configured.")
        
    # 1. Download
    storage_path = f"voices/{creator_id}/higgs_v2.mp3" 
    try:
        data = supabase.storage.from_("creator-assets").download(storage_path)
        with open(local_wav, "wb") as f:
            f.write(data)
    except Exception as e:
        print(f"    Hydration failed: {e}")
        raise HTTPException(404, f"Voice not found for creator {creator_id}")

    # 2. Re-Compute Cache
    try:
        audio_in = AudioSegment.from_file(str(local_wav))
        target_sr = serve_engine.audio_tokenizer.sampling_rate
        if audio_in.frame_rate != target_sr: audio_in = audio_in.set_frame_rate(target_sr)
        if audio_in.channels > 1: audio_in = audio_in.set_channels(1)
        
        samples = np.array(audio_in.get_array_of_samples()).astype(np.float32)
        if audio_in.sample_width == 2: samples /= 32768.0
        elif audio_in.sample_width == 4: samples /= 2147483648.0
        
        tensor = torch.from_numpy(samples).unsqueeze(0).to(DEVICE)
        
        with torch.no_grad():
            if hasattr(serve_engine.audio_tokenizer, 'encode'):
                tokens = serve_engine.audio_tokenizer.encode(tensor, target_sr)
                torch.save(tokens.cpu(), str(cache_pt))
                print(f"--> Re-Cached: {cache_pt}")
            else:
                # Mock fallback
                import torch
                torch.save(torch.zeros((1,100)), str(cache_pt))
            
        return cache_pt
        
    except Exception as e:
        print(f"    Re-cache error: {e}")
        print(traceback.format_exc())
        detail = "Failed to process downloaded voice."
        if not IS_PROD:
            detail = f"{detail}\n{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
