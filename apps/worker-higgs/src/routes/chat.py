import os
import uuid
import time
import torch
import traceback
import tempfile
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException

from ..config import IS_PROD
from ..database import supabase
from ..models import ChatGenerateRequest
from ..utils import compress_audio
from ..services import ensure_voice_cache
from .. import engine

router = APIRouter()

@router.post("/generate")
async def chat_generate(req: ChatGenerateRequest):
    """
    Full Context Chat Generation.
    1. Loads Voice Cache (.pt) and Transcript.
    2. Generates Audio using in-context cloning.
    3. Saves Context to Supabase (Fan, Session, Messages).
    4. Uploads Compressed Output.
    """
    # Check Engine
    if not engine.serve_engine:
        detail = "Model not loaded"
        if engine.startup_error:
             detail += f". Startup Error: {engine.startup_error}"
        raise HTTPException(503, detail)

    print(f"--> Chat Gen for {req.creator_id} (Fan: {req.fan_id})")
    
    # 1. Load Cache & Transcript
    try:
        cache_path, transcript = ensure_voice_cache(req.creator_id, engine.serve_engine)
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error ensuring cache: {e}")
        detail = "Voice Cache unavailable"
        if not IS_PROD:
             detail = f"{detail}\n{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
    
    cached_tokens = torch.load(str(cache_path), weights_only=True)
    
    out_wav = None
    try:
        # 2. Generate (In-Context Cloning)
        audio_numpy, sr = engine.serve_engine.generate_with_voice(
            text_prompt=req.text,
            voice_audio_ids=cached_tokens,
            voice_transcript=transcript,
            max_new_tokens=2048
        )
        
        if audio_numpy is None:
             raise HTTPException(500, "Generation produced no audio")
             
        # 3. Process Output (Temp File)
        tf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tf.close() 
        out_wav = Path(tf.name)
        out_id = uuid.uuid4().hex 
        
        import soundfile as sf
        sf.write(str(out_wav), audio_numpy, sr)
        
        # 4. Persistence & Compression
        public_url = ""
        # 4a. Ensure Fan & Session
        sess_res = supabase.table("ChatSession").select("id").eq("fanId", req.fan_id).eq("creatorId", req.creator_id).execute()
        if sess_res.data:
            session_id = sess_res.data[0]['id']
        else:
            new_sess = supabase.table("ChatSession").insert({
                "id": str(uuid.uuid4()),
                "fanId": req.fan_id, 
                "creatorId": req.creator_id,
                "updatedAt": datetime.utcnow().isoformat()
            }).execute()
            session_id = new_sess.data[0]['id']

        # 4b. Save User Message
        supabase.table("Message").insert({
            "id": str(uuid.uuid4()),
            "chatSessionId": session_id,
            "role": "USER",
            "content": req.text,
            "createdAt": datetime.utcnow().isoformat()
        }).execute()
        
        # 4c. Compress & Upload Audio (Assistant)
        mp3_buffer = compress_audio(str(out_wav), bitrate="64k") 
        storage_path = f"chat/{session_id}/{out_id}.mp3"
        
        content_type = "audio/mpeg"
        
        supabase.storage.from_("audio").upload(
            storage_path, mp3_buffer.read(),
            file_options={"content-type": content_type}
        )
        
        public_url = supabase.storage.from_("audio").get_public_url(storage_path)
        if isinstance(public_url, dict) and "publicUrl" in public_url:
            public_url = public_url["publicUrl"]
        
        # 4d. Save Assistant Message
        duration = audio_numpy.shape[0] / sr
        supabase.table("Message").insert({
            "id": str(uuid.uuid4()),
            "chatSessionId": session_id,
            "role": "ASSISTANT",
            "content": "", 
            "audioUrl": public_url,
            "durationSec": duration,
            "createdAt": datetime.utcnow().isoformat()
        }).execute()

        # 5. Cleanup Local Output
        if out_wav.exists():
            os.remove(out_wav)

    except Exception as e:
        print(f"Chat Error: {e}")
        print(traceback.format_exc())
        if out_wav and out_wav.exists():
            os.remove(out_wav)
        detail = "Internal Server Error" if IS_PROD else f"{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
        
    return {
        "status": "success",
        "audio_url": public_url
    }
