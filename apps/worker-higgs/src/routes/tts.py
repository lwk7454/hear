import os
import uuid
import torch
import traceback
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException

from ..config import IS_PROD
from ..database import supabase
from ..models import SynthesizeRequest
from ..utils import compress_audio
from ..services import ensure_voice_cache
from .. import engine

router = APIRouter()

@router.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    """
    Direct Text-to-Speech Generation.
    1. Loads Voice Cache (.pt).
    2. Generates Audio.
    3. Uploads to Supabase (Ephemeral/TTS).
    """
    # Check Engine
    if not engine.serve_engine:
        detail = "Model not loaded"
        if engine.startup_error:
             detail += f". Startup Error: {engine.startup_error}"
        raise HTTPException(503, detail)
    
    # 1. Load Cache
    try:
        cache_path = ensure_voice_cache(req.creator_id, engine.serve_engine)
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error ensuring cache: {e}")
        detail = "Voice Cache unavailable"
        if not IS_PROD:
             detail = f"{detail}\n{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
    
    cached_tokens = torch.load(str(cache_path), weights_only=True)
    
    # 2. Prepare Prompt
    # Strict TTS: Just say the text.
    # System prompt: "Read the following text aloud."
    system_prompt = "Read the text exactly as written."
    messages = [
        engine.Message(role="system", content=system_prompt),
        engine.Message(role="user", content=req.text)
    ]
    
    out_wav = None
    try:
        # 3. Generate
        audio_numpy, sr = engine.serve_engine.generate_with_cache(
            chat_ml_sample=engine.ChatMLSample(messages=messages),
            cached_audio_ids=cached_tokens,
            max_new_tokens=2048
        )
        
        if audio_numpy is None:
             raise HTTPException(500, "Generation produced no audio")
             
        # 4. Process Output
        tf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tf.close() # Close immediately to avoid file lock on Windows
        out_wav = Path(tf.name)
        out_id = uuid.uuid4().hex
        
        # Save WAV
        import soundfile as sf
        sf.write(str(out_wav), audio_numpy, sr)
        
        # 5. Persistence (Ephemeral TTS bucket folder)
        mp3_buffer = compress_audio(str(out_wav), bitrate="128k")
        storage_path = f"tts/{req.creator_id}/{out_id}.mp3"
        
        # Check if fallback (WAV) happened by peeking header
        content_type = "audio/mpeg"
        sample = mp3_buffer.getvalue()[:4]
        if sample.startswith(b'RIFF'):
             content_type = "audio/wav"
             storage_path = storage_path.replace(".mp3", ".wav")
        
        supabase.storage.from_("creator-assets").upload(
            storage_path, mp3_buffer.read(),
            file_options={"content-type": content_type}
        )
        
        # Private bucket requires signed URL
        signed_res = supabase.storage.from_("creator-assets").create_signed_url(storage_path, 3600)
        
        # Debug print
        print(f"DEBUG: Signed Res Type: {type(signed_res)}")
        print(f"DEBUG: Signed Res: {signed_res}")

        # Check if it returns dict (some versions) or string
        if isinstance(signed_res, dict) and "signedURL" in signed_res:
            public_url = signed_res["signedURL"]
        elif isinstance(signed_res, str):
             public_url = signed_res
        else:
             # Fallback if structure is unexpected
             print("WARNING: Unexpected signed_url format. Falling back to public URL construction.")
             public_url = supabase.storage.from_("creator-assets").get_public_url(storage_path)

        # Ensure we don't return a localhost URL that is unreachable from the browser if we can avoid it.
        # But for now, let's trust the signer.
        public_url = str(public_url)

        
        # Cleanup
        if out_wav.exists():
            os.remove(out_wav)
            
        return {
            "status": "success",
            "audio_url": public_url
        }

    except Exception as e:
        print(f"TTS Error: {e}")
        print(traceback.format_exc())
        if out_wav and out_wav.exists():
            os.remove(out_wav)
        detail = "Internal Server Error" if IS_PROD else f"{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
