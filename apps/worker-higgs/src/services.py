import torch
import numpy as np
import traceback
from pathlib import Path
from fastapi import HTTPException
from pydub import AudioSegment
from .config import CACHE_DIR, DEVICE, IS_PROD
from .database import supabase

def ensure_voice_cache(creator_id: str, serve_engine) -> tuple[Path, str]:
    """
    Ensures the voice cache (.pt) exists locally and returns the transcript.
    If missing, attempts to download from Supabase.
    """
    voice_stem = f"voice_{creator_id}"
    cache_pt = CACHE_DIR / f"{voice_stem}.pt"
    local_wav = CACHE_DIR / f"{voice_stem}.wav"
    
    # Fetch Creator Metadata (Transcript)
    try:
        res = supabase.table("Creator").select("voiceTranscript", "voiceSample").eq("id", creator_id).execute()
        if not res.data:
            raise HTTPException(404, f"Creator {creator_id} not found")
        
        creator_data = res.data[0]
        transcript = creator_data.get("voiceTranscript") or ""
        voice_sample_url = creator_data.get("voiceSample")
        
        if not voice_sample_url:
            raise HTTPException(404, f"No voice sample found for creator {creator_id}")

    except Exception as e:
        print(f"--> Metadata fetch failed for {creator_id}: {e}")
        raise HTTPException(500, f"Database error: {e}")

    if cache_pt.exists():
        return cache_pt, transcript
        
    print(f"--> Cache miss for {creator_id}. Attempting hydration from Supabase...")
    
    # 1. Download
    # We use the URL from DB instead of hardcoded path
    try:
        # Extract path from URL (e.g. .../storage/v1/object/public/audio/voice_samples/...)
        # Actually storage.download expects the path within the bucket
        if "voice_samples/" in voice_sample_url:
            storage_path = voice_sample_url.split("voice_samples/")[1]
            storage_path = f"voice_samples/{storage_path}"
        else:
            # Fallback to old path if URL is weird
            storage_path = f"voices/{creator_id}/higgs_v2.mp3"

        data = supabase.storage.from_("audio").download(storage_path)
        with open(local_wav, "wb") as f:
            f.write(data)
    except Exception as e:
        print(f"    Hydration failed: {e}")
        raise HTTPException(404, f"Voice file not found for creator {creator_id} at {storage_path}")

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
                torch.save(torch.zeros((1,100)), str(cache_pt))
            
        return cache_pt, transcript
        
    except Exception as e:
        print(f"    Re-cache error: {e}")
        print(traceback.format_exc())
        detail = "Failed to process downloaded voice."
        if not IS_PROD:
            detail = f"{detail}\n{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
