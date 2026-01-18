import os
import sys
import site
import glob
import runpod
import asyncio

# --- BOOTSTRAP: Load dependencies from Network Volume (higgs-story pattern) ---
VOLUME_PATH = "/runpod-volume"
VENV_ROOT = os.path.join(VOLUME_PATH, "venvs")
HIGGS_LIB_PATH = os.path.join(VOLUME_PATH, "common-lib/higgs-audio")

if os.path.exists(VENV_ROOT):
    site_packages_pattern = os.path.join(VENV_ROOT, "lib/python3.*/site-packages")
    site_packages = glob.glob(site_packages_pattern)
    for sp in site_packages:
        print(f"--> [Bootstrap] Adding site-packages: {sp}")
        site.addsitedir(sp)

if os.path.exists(HIGGS_LIB_PATH):
    print(f"--> [Bootstrap] Adding higgs-audio library root to sys.path: {HIGGS_LIB_PATH}")
    if HIGGS_LIB_PATH not in sys.path:
        sys.path.insert(0, HIGGS_LIB_PATH)

# Also add the lib directory if it exists on volume
volume_lib = os.path.join(VOLUME_PATH, "lib")
if os.path.exists(volume_lib):
    print(f"--> [Bootstrap] Injecting {volume_lib} into sys.path")
    sys.path.insert(0, volume_lib)

# Redirect AI model caches to volume
os.environ["HF_HOME"] = os.path.join(VOLUME_PATH, "models", "huggingface")
os.environ["TORCH_HOME"] = os.path.join(VOLUME_PATH, "models", "torch")
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

from src.app import initialize_engine, ensure_infrastructure
from src.routes.chat import chat_generate
from src.routes.tts import synthesize
from src.routes.root import read_root
from src.models import ChatGenerateRequest, SynthesizeRequest
from src.config import PORT

async def handler(job):
    """
    RunPod Serverless Handler
    """
    job_input = job.get("input", {})
    action = job_input.get("action", "health")

    # 1. Ensure Infrastructure (Buckets, Models)
    # This is fast if already done
    ensure_infrastructure()

    if action == "health":
        return read_root()

    # 2. Lazy load engine for heavy actions
    initialize_engine()

    try:
        if action == "generate":
            req = ChatGenerateRequest(**job_input)
            return await chat_generate(req)
        
        elif action == "synthesize":
            req = SynthesizeRequest(**job_input)
            return await synthesize(req)
        
        else:
            return {"status": "error", "message": f"Unknown action: {action}"}
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "traceback": traceback.format_exc()}

if __name__ == "__main__":
    print("--> Starting RunPod Serverless Worker...")
    runpod.serverless.start({"handler": handler})
