import os
import sys
import site
import glob
import shutil
import subprocess
import requests

# --- BOOTSTRAP: Load dependencies from Network Volume (higgs-story pattern) ---
VOLUME_PATH = "/runpod-volume"
VENV_ROOT = os.path.join(VOLUME_PATH, "venvs")

if os.path.exists(VENV_ROOT):
    site_packages_pattern = os.path.join(VENV_ROOT, "lib/python3.*/site-packages")
    site_packages = glob.glob(site_packages_pattern)
    for sp in site_packages:
        print(f"--> [Bootstrap] Adding site-packages: {sp}")
        site.addsitedir(sp)

# Redirect AI model caches to volume
os.environ["HF_HOME"] = os.path.join(VOLUME_PATH, "models", "huggingface")
os.environ["TORCH_HOME"] = os.path.join(VOLUME_PATH, "models", "torch")
os.environ["PYANNOTE_CACHE"] = os.path.join(VOLUME_PATH, "models", "pyannote")

import json
import numpy as np
import torch
import torchaudio
from scipy.spatial.distance import cosine
from pathlib import Path
from pyannote.audio import Inference
from dotenv import load_dotenv
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional

# 1. Load Environment (Local)
BASE_DIR = Path(__file__).resolve().parent
local_env = BASE_DIR / ".env"
if local_env.exists():
    load_dotenv(dotenv_path=local_env, override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
HF_TOKEN = os.getenv("HF_TOKEN") # Required for Pyannote

# supabase: Optional[Client] = None (handled below)

# Setup Supabase
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("WARNING: Supabase keys missing. Uploads will fail.")

class ProcessRequest(BaseModel):
    audio_url: str
    creator_id: str
    voice_sample_url: Optional[str] = None

def read_root():
    return {"status": "online", "service": "hear-gpu-worker", "gpu": True}

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

        if req.voice_sample_url and HF_TOKEN:
            print(f"    Filtering for enrolled voice...")
            # 1. Download Golden Sample
            golden_path = work_dir / "golden.wav"
            with requests.get(req.voice_sample_url, stream=True) as r:
                 r.raise_for_status()
                 with open(golden_path, 'wb') as f:
                     for chunk in r.iter_content(chunk_size=8192):
                         f.write(chunk)
            
            # 2. Compute Golden Embedding
            # Load Inference Model
            inference = Inference("pyannote/embedding", use_auth_token=HF_TOKEN)
            inference.to(device)
            
            # Convert to numpy immediately
            emb_golden = np.array(inference(golden_path))
            
            # Ensure golden is flat (mean if multiple windows)
            if len(emb_golden.shape) == 2:
                 emb_golden_flat = np.mean(emb_golden, axis=0)
            else:
                 emb_golden_flat = emb_golden.reshape(-1)

            # 3. Compute Embeddings for each Diarized Speaker
            # Concatenate all segments for a speaker to get a robust embedding
            speaker_turns = {}
            waveform, sample_rate = torchaudio.load(vocals_path)
            
            for seg in segments:
                spk = seg['speaker']
                start = seg['start']
                end = seg['end']
                if spk not in speaker_turns:
                    speaker_turns[spk] = []
                speaker_turns[spk].append((start, end))
                
            closest_speaker = None
            min_dist = 1.0
            
            for spk, turns in speaker_turns.items():
                # Extract up to 30s of speech for embedding
                max_dur = 30.0
                curr_dur = 0.0
                spk_audio = []
                
                for start, end in turns:
                    if curr_dur >= max_dur: break
                    dur = end - start
                    take = min(dur, max_dur - curr_dur)
                    
                    frame_start = int(start * sample_rate)
                    frame_num = int(take * sample_rate)
                    
                    # Extract channel 0
                    chunk = waveform[0, frame_start:frame_start+frame_num]
                    spk_audio.append(chunk)
                    curr_dur += take
                    
                if not spk_audio: continue
                
                # Concat and save temp file for inference
                full_spk_audio = torch.cat(spk_audio)
                # Reshape to (1, samples)
                full_spk_audio = full_spk_audio.unsqueeze(0)
                
                spk_wav_path = work_dir / f"{spk}.wav"
                torchaudio.save(spk_wav_path, full_spk_audio, sample_rate)
                
                # Compute Embedding
                emb_spk = np.array(inference(spk_wav_path))
                
                # Handle Pyannote output (n_windows, dim)
                if len(emb_spk.shape) == 2:
                    emb_spk = np.mean(emb_spk, axis=0) # Average over windows to get speaker vector
                
                # Reshape just in case
                emb_spk = emb_spk.reshape(-1)

                # Compare
                dist = cosine(emb_golden_flat, emb_spk)
                print(f"    Distance to {spk}: {dist:.4f}")
                
                if dist < min_dist:
                    min_dist = dist
                    closest_speaker = spk
            
            target_speaker = closest_speaker
            print(f"    Target Speaker Identified: {target_speaker} (dist: {min_dist:.4f})")
            
            # 4. Filter Audio & Compact Silence (Max 500ms)
            if target_speaker and target_speaker in speaker_turns:
                # Sort segments 
                target_segments = sorted([s for s in segments if s['speaker'] == target_speaker], key=lambda x: x['start'])
                
                output_tensors = []
                last_end = 0.0
                
                for i, seg in enumerate(target_segments):
                    start = float(seg['start'])
                    end = float(seg['end'])
                    
                    # Handle gap (silence)
                    if i > 0:
                        gap = start - last_end
                        # Cap silence at 500ms, but keep smaller gaps (natural pauses)
                        silence_dur = max(0.0, min(gap, 0.5))
                        if silence_dur > 0:
                            silence_samples = int(silence_dur * sample_rate)
                            output_tensors.append(torch.zeros((waveform.shape[0], silence_samples)))
                            
                    # Extract segment
                    s_frame = int(start * sample_rate)
                    e_frame = int(end * sample_rate)
                    output_tensors.append(waveform[:, s_frame:e_frame])
                    
                    last_end = end
                
                if output_tensors:
                    filtered_waveform = torch.cat(output_tensors, dim=1)
                else:
                    filtered_waveform = torch.zeros((waveform.shape[0], 0))
                
                filtered_path = work_dir / "filtered_vocals.wav"
                torchaudio.save(filtered_path, filtered_waveform, sample_rate)
                
                # Swap output path
                vocals_path = filtered_path
                
                # Filter returned segments metadata (Note: these still use ORIGINAL timestamps)
                segments = target_segments

        # D. UPLOAD ARTIFACTS
        vocals_url = req.audio_url # Fallback
        if supabase:
            print(f"    Uploading results...")
            
            # Better Naming
            # ingest/{creator_id}/{source_id}/{stage}.wav
            # Source ID hard to get from URL safely, let's look at filename in future
            # For now use timestamp + clear suffixes
            import time
            ts = int(time.time())
            
            # Extract filename from URL if possible or use random
            filename_base = Path(req.audio_url).stem[:20] # truncate
            dest_path = f"ingest/{req.creator_id}/processed/{ts}_{filename_base}_vocals.wav"
            
            with open(vocals_path, 'rb') as f:
                file_bytes = f.read()
                
            supabase.storage.from_("audio").upload(
                dest_path, 
                file_bytes, 
                file_options={"content-type": "audio/wav", "upsert": "true"}
            )
            
            # Get Public URL
            res = supabase.storage.from_("audio").get_public_url(dest_path)
            vocals_url = res
            
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
        raise Exception(str(e))
    finally:
        # Cleanup
        if work_dir.exists():
            shutil.rmtree(work_dir)

def handler(job):
    """
    RunPod Serverless Handler
    """
    job_input = job.get("input", {})
    action = job_input.get("action", "health")

    if action == "health":
        return read_root()

    if action == "process":
        try:
            req = ProcessRequest(**job_input)
            return process_audio(req)
        except Exception as e:
            import traceback
            return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}
    
    return {"status": "error", "message": f"Unknown action: {action}"}

if __name__ == "__main__":
    import runpod
    print("--> Starting RunPod Serverless Worker...")
    runpod.serverless.start({"handler": handler})
