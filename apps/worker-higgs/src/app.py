import os
import torch
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI
from .config import MODEL_PATH, TOKENIZER_PATH, get_device, USE_8BIT, USE_4BIT, KV_CACHE_SIZE
from .database import supabase
from .routes import router

# Import HiggsGenerator from new smart_generation module
from .smart_generation import HiggsGenerator, merge_audio_files
from .reference_manager import DynamicReferenceManager

# Global Dependencies
from . import dependencies
from .dependencies import generator, reference_manager, startup_error # For access, but we write to dependencies.*

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
            
            # Ensure parent exists (e.g., /runpod-volume/models/)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
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
    Initialize the HiggsGenerator and ReferenceManager.
    Exposed for Aliyun FC /initialize lifecycle hook.
    """
    global generator, reference_manager, startup_error
    # Note: We are updating the module-level variables in dependencies
    
    if dependencies.generator is not None:
        return dependencies.generator

    # Mock Mode
    if os.getenv("MOCK_MODEL", "false").lower() == "true":
        print("--> MOCK_MODEL=true. Skipping load.")
        class MockGenerator:
            def generate_streamed(self, *args, **kwargs):
                return []
        
        generator = MockGenerator()
        return generator

    print(f"--> Starting Higgs Generator on {get_device()}...")
    try:
        # Build KV cache lengths list
        kv_cache_lengths = [2048, 4096, 8192, 16384]
        if KV_CACHE_SIZE not in kv_cache_lengths:
            kv_cache_lengths.append(KV_CACHE_SIZE)
            kv_cache_lengths = sorted(kv_cache_lengths)
        
        dependencies.generator = HiggsGenerator(
            model_path=MODEL_PATH,
            audio_tokenizer_path=TOKENIZER_PATH,
            device=get_device(),
            kv_cache_lengths=kv_cache_lengths
        )
        
        # Initialize Reference Manager with 2GB cache
        dependencies.reference_manager = DynamicReferenceManager(
            cache_dir="/tmp/ref_cache",
            supabase_client=supabase,
            bucket_name="ref_audio",
            max_cache_size_mb=2048  # 2GB default
        )
        
        print("--> Model Loaded Successfully.")
    except Exception as e:
        dependencies.startup_error = f"{e}\n{traceback.format_exc()}"
        print(f"CRITICAL ERROR: {e}")
        print(traceback.format_exc())
    
    return generator

def ensure_infrastructure():
    """
    Ensures that Supabase buckets and local model storage are ready.
    """
    global startup_error
    try:
        buckets = supabase.storage.list_buckets()
        bucket_names = [b.name for b in buckets]
        if "audio" not in bucket_names:
            print("--> Creating 'audio' bucket...")
            supabase.storage.create_bucket("audio", options={"public": True})
    except Exception as e:
        startup_error = f"{e}\n{traceback.format_exc()}"
        print(f"--> Bucket Check Failed: {e}")
        print(traceback.format_exc())

    # 1. Ensure Persistent Storage is provisioned
    ensure_models_locally()

def get_generator():
    """Get the global generator instance."""
    return dependencies.generator

def get_reference_manager():
    """Get the global reference manager instance."""
    return dependencies.reference_manager

def get_startup_error():
    """Get any startup error message."""
    return dependencies.startup_error

@asynccontextmanager
async def lifespan(app: FastAPI):
    # For local development / standard FastAPI usage
    ensure_infrastructure()
    initialize_engine()
    yield

app = FastAPI(title="Hear Higgs Worker (Boson AI V2)", lifespan=lifespan)
app.include_router(router)
