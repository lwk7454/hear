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
# from ..services import ensure_voice_cache # Deprecated
from .. import dependencies
from ..smart_generation import merge_audio_files
import glob

router = APIRouter()

@router.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    """
    Direct Text-to-Speech Generation using Higgs V2.
    1. Uses DynamicReferenceManager to finding matching voice ref.
    2. Generates Audio using global HiggsGenerator.
    3. Uploads to Supabase (Ephemeral/TTS).
    """
    generator = dependencies.generator
    ref_manager = dependencies.reference_manager
    
    # Check Engine
    if not generator:
        detail = "Model not loaded"
        if dependencies.startup_error:
             detail += f". Startup Error: {dependencies.startup_error}"
        raise HTTPException(503, detail)
    
    out_merged = None
    generated_files = []
    
    try:
        # 1. Generate (Streamed chunks to disk)
        # We treat the text as a single chunk or list of chunks.
        # generate_streamed handles ref selection via ref_manager + user_id
        
        job_id = uuid.uuid4().hex
        output_dir = tempfile.gettempdir()
        
        chunks = [req.text] # TODO: Split by sent if long? generate_streamed expects chunks.
        
        generated_files = generator.generate_streamed(
            chunks=chunks,
            ref_audio_path=None, # Let manager decide
            output_dir=output_dir,
            job_id=job_id,
            reference_manager=ref_manager,
            ref_audio_user_id=req.creator_id
        )
        
        if not generated_files:
             raise HTTPException(500, "Generation produced no audio files")
             
        # 2. Merge Chunks
        out_merged = Path(output_dir) / f"{job_id}_merged.wav"
        merge_audio_files(generated_files, str(out_merged))
        
        # 3. Persistence (Ephemeral TTS bucket folder)
        # Compress to MP3
        mp3_buffer = compress_audio(str(out_merged), bitrate="128k")
        storage_path = f"tts/{req.creator_id}/{job_id}.mp3"
        content_type = "audio/mpeg"
        
        supabase.storage.from_("audio").upload(
            storage_path, mp3_buffer.read(),
            file_options={"content-type": content_type, "upsert": "true"}
        )
        
        public_url = supabase.storage.from_("audio").get_public_url(storage_path)
        if isinstance(public_url, dict) and "publicUrl" in public_url:
            public_url = public_url["publicUrl"]
            
        return {
            "status": "success",
            "audio_url": public_url
        }

    except Exception as e:
        print(f"TTS Error: {e}")
        traceback.print_exc()
        detail = "Internal Server Error" if IS_PROD else f"{e}\n{traceback.format_exc()}"
        raise HTTPException(500, detail)
        
    finally:
        # Cleanup
        if out_merged and out_merged.exists():
            os.remove(out_merged)
        for f in generated_files:
            if os.path.exists(f): 
                os.remove(f)
