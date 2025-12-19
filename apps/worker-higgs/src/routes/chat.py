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
    1. Loads Voice Cache (.pt).
    2. Generates Audio.
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
    
    # 1. Load Cache (Lazy Load / Hydrate)
    # Ignores req.voice_id path and looks up by creator_id
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
    
    system_prompt = "You are a helpful assistant. Respond with voice."
    messages = [engine.Message(role="system", content=system_prompt)]
    
    for msg in req.history:
        role = msg.get("role", "user")
        if role == "user": messages.append(engine.Message(role="user", content=msg.get("content")))
        elif role == "assistant": messages.append(engine.Message(role="assistant", content=msg.get("content")))
            
    messages.append(engine.Message(role="user", content=req.text))
    
    out_wav = None
    try:
        # 3. Generate (Fast Path)
        audio_numpy, sr = engine.serve_engine.generate_with_cache(
            chat_ml_sample=engine.ChatMLSample(messages=messages),
            cached_audio_ids=cached_tokens,
            max_new_tokens=2048
        )
        
        if audio_numpy is None:
             raise HTTPException(500, "Generation produced no audio")
             
        # 4. Process Output (Temp File)
        # Use tempfile directory instead of local output/ folder
        tf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tf.close() # Close immediately to avoid file lock on Windows
        out_wav = Path(tf.name)
        out_id = uuid.uuid4().hex # Needed for storage path
        start_time = time.time()
        
        tensor = torch.from_numpy(audio_numpy)[None, :]
        
        import soundfile as sf
        sf.write(str(out_wav), audio_numpy, sr)
        
        # 5. Persistence & Compression
        public_url = ""
        # 5a. Ensure Fan & Session
        # Simple check/create logic
        sess_res = supabase.table("ChatSession").select("id").eq("fanId", req.fan_id).eq("creatorId", req.creator_id).execute()
        if sess_res.data:
            session_id = sess_res.data[0]['id']
        else:
            # Create Fan if not exists (Basic check)
            # Assuming Fan exists or we auto-create fan? 
            # Let's assume Fan exists for now or try insert fan then session.
            # Just insert Session.
            new_sess = supabase.table("ChatSession").insert({
                "id": str(uuid.uuid4()),
                "fanId": req.fan_id, 
                "creatorId": req.creator_id,
                "updatedAt": datetime.utcnow().isoformat()
            }).execute()
            session_id = new_sess.data[0]['id']

        # 5b. Save User Message
        supabase.table("Message").insert({
            "id": str(uuid.uuid4()),
            "chatSessionId": session_id,
            "role": "USER",
            "content": req.text,
            "createdAt": datetime.utcnow().isoformat()
        }).execute()
        
        # 5c. Compress & Upload Audio (Assistant)
        mp3_buffer = compress_audio(str(out_wav), bitrate="64k") # Good for speech
        storage_path = f"chat/{session_id}/{out_id}.mp3"
        
        content_type = "audio/mpeg"
        sample = mp3_buffer.getvalue()[:4]
        if sample.startswith(b'RIFF'):
             content_type = "audio/wav"
             storage_path = storage_path.replace(".mp3", ".wav")
        
        supabase.storage.from_("creator-assets").upload(
            storage_path, mp3_buffer.read(),
            file_options={"content-type": content_type}
        )
        
        signed_res = supabase.storage.from_("creator-assets").create_signed_url(storage_path, 3600)
        if isinstance(signed_res, dict) and "signedURL" in signed_res:
             public_url = signed_res["signedURL"]
        else:
             public_url = signed_res
        
        public_url = supabase.storage.from_("creator-assets").get_public_url(storage_path)
        
        # 5d. Save Assistant Message
        duration = tensor.shape[1] / sr
        supabase.table("Message").insert({
            "id": str(uuid.uuid4()),
            "chatSessionId": session_id,
            "role": "ASSISTANT",
            "content": "", # Audio only
            "audioUrl": public_url,
            "durationSec": duration,
            "createdAt": datetime.utcnow().isoformat()
        }).execute()

        # 6. Cleanup Local Output (Keep container stateless)
        if out_wav.exists():
            os.remove(out_wav)

    except Exception as e:
        print(f"Chat Error: {e}")
        print(traceback.format_exc())
        # Cleanup on error too
        if out_wav and out_wav.exists():
            os.remove(out_wav)
        detail = "Internal Server Error" if IS_PROD else f"{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
        
    return {
        "status": "success",
        "audio_path": str(out_wav), # Local fallback
        "audio_url": public_url
    }
