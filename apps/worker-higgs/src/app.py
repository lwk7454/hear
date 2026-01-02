import os
import torch
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI
from .config import MODEL_PATH, TOKENIZER_PATH, DEVICE, USE_8BIT, USE_4BIT, KV_CACHE_SIZE
from .database import supabase
from . import engine
from .routes import router

def ensure_models_locally():
    """
    Checks if the model paths are local directories.
    If they are, and they are empty/missing, download them from HuggingFace.
    """
    from huggingface_hub import snapshot_download
    from pathlib import Path

    # Mapping of target paths to their original HuggingFace repos
    # This ensures that if we mount a volume at /runpod-volume/models/higgs,
    # we can populate it if it's empty.
    model_mapping = {
        MODEL_PATH: "bosonai/higgs-audio-v2-generation-3B-base",
        TOKENIZER_PATH: "bosonai/higgs-audio-v2-tokenizer"
    }

    for local_path_str, repo_id in model_mapping.items():
        # Only attempt download if the path looks like an absolute local path
        if local_path_str.startswith("/"):
            local_path = Path(local_path_str)
            
            # If directory is missing or empty (less than 2 files)
            if not local_path.exists() or len(list(local_path.iterdir())) < 2:
                print(f"--> [Volume Setup] {local_path_str} is empty or missing.")
                print(f"--> [Volume Setup] Downloading {repo_id} to {local_path_str}...")
                try:
                    snapshot_download(
                        repo_id=repo_id,
                        local_dir=str(local_path),
                        local_dir_use_symlinks=False
                    )
                    print(f"--> [Volume Setup] Successfully provisioned {local_path_str}")
                except Exception as e:
                    print(f"--> [Volume Setup] FAILED to download {repo_id}: {e}")
                    # We don't exit here, the engine init will fail later with better error reporting

def initialize_engine():
    """
    Exposed for Aliyun FC /initialize lifecycle hook.
    """
    if engine.serve_engine is not None:
        return engine.serve_engine

    # Mock Mode
    if os.getenv("MOCK_MODEL", "false").lower() == "true":
        print("--> MOCK_MODEL=true. Skipping load.")
        class MockEngine:
            def generate_with_cache(self, *args, **kwargs):
                import numpy as np
                return np.zeros(24000), 24000
            
            # Helper to simulate tokenization
            class audio_tokenizer:
                sampling_rate = 24000
                @staticmethod
                def encode(wav, sr):
                    return torch.zeros((1, 100)) # Dummy cache
            
        engine.serve_engine = MockEngine()
        engine.serve_engine.audio_tokenizer = MockEngine.audio_tokenizer() # for /clone usage
        return engine.serve_engine

    if not engine.HIGGS_AVAILABLE:
        print("--> Higgs not available. Skipping engine initialization.")
        return None

    print(f"--> Starting Cached Higgs Engine on {DEVICE}...")
    try:
        load_kwargs = {}
        skip_cuda_graphs = False
        
        if (USE_8BIT or USE_4BIT) and DEVICE == "cuda":
            from transformers import BitsAndBytesConfig
            if USE_4BIT:
                print("--> Loading in 4-bit...")
                load_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True
                )
            else:
                print("--> Loading in 8-bit...")
                load_kwargs["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)
            
            load_kwargs["device_map"] = "auto"
            skip_cuda_graphs = True  # Quantization incompatible with CUDA graphs

        engine.serve_engine = engine.CachedHiggsEngine(
            model_name_or_path=MODEL_PATH, 
            audio_tokenizer_name_or_path=TOKENIZER_PATH, 
            device=DEVICE,
            torch_dtype=torch.float16,
            skip_cuda_graphs=skip_cuda_graphs,
            kv_cache_lengths=[KV_CACHE_SIZE],  # Use single smaller cache to reduce VRAM usage
            **load_kwargs
        )
        print("--> Model Loaded Successfully.")
    except Exception as e:
        engine.startup_error = f"{e}\n{traceback.format_exc()}"
        print(f"CRITICAL ERROR: {e}")
        print(traceback.format_exc())
    
    return engine.serve_engine

def ensure_infrastructure():
    """
    Ensures that Supabase buckets and local model storage are ready.
    """
    try:
        buckets = supabase.storage.list_buckets()
        bucket_names = [b.name for b in buckets]
        if "audio" not in bucket_names:
            print("--> Creating 'audio' bucket...")
            supabase.storage.create_bucket("audio", options={"public": True})
    except Exception as e:
        engine.startup_error = f"{e}\n{traceback.format_exc()}"
        print(f"--> Bucket Check Failed: {e}")
        print(traceback.format_exc())

    # 1. Ensure Persistent Storage is provisioned
    ensure_models_locally()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # For local development / standard FastAPI usage
    ensure_infrastructure()
    initialize_engine()
    yield

app = FastAPI(title="Hear Higgs Worker (Boson AI V2)", lifespan=lifespan)
app.include_router(router)
