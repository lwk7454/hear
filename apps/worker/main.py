import os
import shutil
import subprocess
import requests
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Load Environment
BASE_DIR = Path(__file__).resolve().parent
server_env = BASE_DIR.parent / "server" / ".env"
worker_env = BASE_DIR / ".env"

if server_env.exists():
    load_dotenv(dotenv_path=server_env)

if worker_env.exists():
    load_dotenv(dotenv_path=worker_env, override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
HF_TOKEN = os.getenv("HF_TOKEN") # Required for Pyannote

app = FastAPI(title="Hear GPU Worker")

# Setup Supabase
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("WARNING: Supabase keys missing. Uploads will fail.")

class ProcessRequest(BaseModel):
    audio_url: str
    creator_id: str

@app.get("/")
def read_root():
    return {"status": "online", "service": "hear-gpu-worker", "gpu": True}

@app.post("/process")
def process_audio(req: ProcessRequest):
    print(f"--> Processing {req.audio_url} for {req.creator_id}")
    
    # Setup Paths
    work_dir = Path("temp") / req.creator_id
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    
    input_path = work_dir / "input_raw.mp3"
    
    try:
        # A. DOWNLOAD
        print(f"    Downloading...")
        with requests.get(req.audio_url, stream=True) as r:
            r.raise_for_status()
            with open(input_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        
        # B. DEMUCS (Vocals Separation)
        import torch
        device_arg = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"    Running Demucs on {device_arg}...")

        # demucs --two-stems=vocals -n htdemucs -d {device} -o {work_dir} {input_path}
        subprocess.run([
            "demucs", 
            "--two-stems=vocals", 
            "-n", "htdemucs", 
            "-d", device_arg,
            "-o", str(work_dir), 
            str(input_path)
        ], check=True)
        
        # Demucs output structure: {work_dir}/htdemucs/input_raw/vocals.wav
        vocals_path = work_dir / "htdemucs" / "input_raw" / "vocals.wav"
        if not vocals_path.exists():
            raise FileNotFoundError("Demucs failed to produce vocals.wav")
            
        # C. DIARIZATION (Pyannote)
        segments = []
        if HF_TOKEN:
            print(f"    Running Pyannote Diarization...")
            
            try:
                from huggingface_hub import login
                login(token=HF_TOKEN)

                from pyannote.audio import Pipeline
                import torch
                
                pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=HF_TOKEN
                )
                
                # Use GPU if available
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                if "mps" in str(torch.backends.mps.is_available() and "mps"):
                     device = torch.device("mps")
                
                pipeline.to(device)
                
                diarization = pipeline(str(vocals_path))
                
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    segments.append({
                        "start": turn.start,
                        "end": turn.end,
                        "speaker": speaker
                    })
            except Exception as e:
                print(f"    Pyannote Error: {e}")
                # Fallback: Single segment
                segments = [{"start": 0, "end": 30, "speaker": "SPEAKER_00"}]
        else:
            print("    Skipping Diarization (No HF_TOKEN). Using default segment.")
            segments = [{"start": 0, "end": 30, "speaker": "SPEAKER_00"}]

        # D. UPLOAD ARTIFACTS
        vocals_url = req.audio_url # Fallback
        if supabase:
            print(f"    Uploading results...")
            ts = int(os.path.getmtime(vocals_path))
            dest_path = f"ingest/{req.creator_id}/{ts}_vocals.wav"
            
            with open(vocals_path, 'rb') as f:
                file_bytes = f.read()
                
            supabase.storage.from_("audio").upload(
                dest_path, 
                file_bytes, 
                file_options={"content-type": "audio/wav", "upsert": "true"}
            )
            
            # Get Public URL
            res = supabase.storage.from_("audio").get_public_url(dest_path)
            vocals_url = res # supabase-py returns string from get_public_url direct? check docs.
            # Usually res is string in newer versions, or has data. Let's check safely.
            # In supabase-js: { data: { publicUrl } }
            # In supabase-py: it typically returns the URL string directly or we construct it.
            # Checking `storage3` (used by supabase-py): `get_public_url` returns string.
            
        print(f"--> Done. Vocals: {vocals_url}")
        
        return {
            "status": "success",
            "artifacts": {
                "vocals": vocals_url,
                "segments": segments
            }
        }

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup
        if work_dir.exists():
            shutil.rmtree(work_dir)

if __name__ == "__main__":
    import uvicorn
    # Listen on 0.0.0.0 to accept connections from other machines (e.g. Mac accessing Windows)
    uvicorn.run(app, host="0.0.0.0", port=8001)
