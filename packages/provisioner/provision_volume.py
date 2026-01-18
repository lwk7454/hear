import os
import subprocess
import sys
import shutil
import signal
from pathlib import Path

# Self-contained: find requirements-volume.txt in the package directory
SCRIPT_DIR = Path(__file__).parent
REQUIREMENTS_VOLUME = os.path.join(SCRIPT_DIR, "requirements-volume.txt")

VOLUME_PATH = os.getenv("VOLUME_PATH", "/runpod-volume")
VENV_PATH = os.path.join(VOLUME_PATH, "venvs")
VENV_PYTHON = os.path.join(VENV_PATH, "bin/python")
HIGGS_AUDIO_REPO = "https://github.com/boson-ai/higgs-audio.git"
HIGGS_AUDIO_DIR = os.path.join(VOLUME_PATH, "common-lib/higgs-audio")

# Model Paths
HIGGS_MODEL_PATH = "/runpod-volume/models/higgs/generation-3B-base"
HIGGS_TOKENIZER_PATH = "/runpod-volume/models/higgs/tokenizer"

TMP_DIR = os.path.join(VOLUME_PATH, "tmp")
PIP_CACHE_DIR = os.path.join(VOLUME_PATH, "pip-cache")

def run_command(cmd, cwd=None, env=None):
    print(f"Running: {' '.join(cmd)}")
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    
    # Ensure our custom env vars are passed to pip
    if "pip" in cmd:
        full_env["TMPDIR"] = TMP_DIR
        full_env["PIP_CACHE_DIR"] = PIP_CACHE_DIR
        os.makedirs(TMP_DIR, exist_ok=True)
        os.makedirs(PIP_CACHE_DIR, exist_ok=True)

    subprocess.run(cmd, cwd=cwd, check=True, env=full_env)

def download_models():
    """
    Downloads Higgs models to the shared volume using huggingface_hub.
    This runs IN THE PROVISIONER POD.
    """
    print("--> [Provision] Checking/Downloading Models...")
    from huggingface_hub import snapshot_download
    
    model_mapping = {
        HIGGS_MODEL_PATH: "bosonai/higgs-audio-v2-generation-3B-base",
        HIGGS_TOKENIZER_PATH: "bosonai/higgs-audio-v2-tokenizer"
    }
    
    # Enable fast transfer
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

    for local_path, repo_id in model_mapping.items():
        if not os.path.exists(local_path) or len(os.listdir(local_path)) < 2:
            print(f"--> Downloading {repo_id} to {local_path}...")
            try:
                snapshot_download(
                    repo_id=repo_id,
                    local_dir=local_path,
                    local_dir_use_symlinks=False
                )
                print(f"--> Successfully downloaded {repo_id}")
            except Exception as e:
                print(f"Error downloading {repo_id}: {e}")
                raise e
        else:
            print(f"--> {local_path} already exists. Skipping.")

def provision():
    if not os.path.exists(VOLUME_PATH):
        print(f"Error: {VOLUME_PATH} not found. Ensure the Network Volume is mounted.")
        return

    print("--> [Provision] Starting dedicated provisioning...")
    
    # 0. Prep dirs
    os.makedirs(TMP_DIR, exist_ok=True)
    os.makedirs(PIP_CACHE_DIR, exist_ok=True)

    # 1. Check for Requirements Change (Pruning)
    # Wipe venv if requirements changed to prune removed deps.
    import hashlib
    current_hash = "none"
    if os.path.exists(REQUIREMENTS_VOLUME):
        with open(REQUIREMENTS_VOLUME, "rb") as f:
            current_hash = hashlib.md5(f.read()).hexdigest()
    
    hash_file = os.path.join(VENV_PATH, ".requirements_hash")
    stored_hash = ""
    if os.path.exists(hash_file):
        with open(hash_file, "r") as f:
            stored_hash = f.read().strip()
            
    if stored_hash != current_hash:
        print(f"--> [Requirements Change] Hash mismatch ({stored_hash[:8]} vs {current_hash[:8]}).")
        print("--> Recreating venv to prune removed dependencies and ensure clean state...")
        if os.path.exists(VENV_PATH):
            shutil.rmtree(VENV_PATH)
    
    # 2. Create Venv (if missing or just deleted)
    if not os.path.exists(VENV_PYTHON):
        print(f"--> Creating virtual environment at {VENV_PATH} with system-site-packages...")
        os.makedirs(os.path.dirname(VENV_PATH), exist_ok=True)
        # We need specific flag to inherit packages from the docker image
        subprocess.run([sys.executable, "-m", "venv", "--system-site-packages", VENV_PATH], check=True)
        run_command([VENV_PYTHON, "-m", "pip", "install", "--upgrade", "pip"])
        
        # Save new hash
        with open(hash_file, "w") as f:
            f.write(current_hash)
    else:
        print(f"--> Venv exists and matches requirements hash.")

    # 3. Install Requirements
    if os.environ.get("SKIP_HEAVY"):
        print("--> [TEST] Skipping pip install (SKIP_HEAVY set).")
    elif os.path.exists(REQUIREMENTS_VOLUME):
        print(f"--> Installing/Syncing requirements from {REQUIREMENTS_VOLUME}...")
        # We DO NOT use --force-reinstall here, relies on pip to skip existing.
        # But since we wiped venv on hash change, this effectively installs fresh.
        # NOTE: dependencies installed in the 'system' (docker image) will satisfy requirements
        # if versions match, thanks to --system-site-packages.
        run_command([VENV_PYTHON, "-m", "pip", "install", "--no-cache-dir", "--prefer-binary", "-r", REQUIREMENTS_VOLUME])

    # 4. Clone and Install Higgs Audio
    if os.environ.get("SKIP_HEAVY"):
        print("--> [TEST] Skipping Higgs clone/install (SKIP_HEAVY set).")
    else:
        if not os.path.exists(HIGGS_AUDIO_DIR):
            print(f"--> [Persistent] Cloning higgs-audio to SAFE location: {HIGGS_AUDIO_DIR}...")
            run_command(["git", "clone", HIGGS_AUDIO_REPO, HIGGS_AUDIO_DIR])
        else:
            print(f"--> [Persistent] Higgs-audio repo found at {HIGGS_AUDIO_DIR}. Skipping git pull.")
            pass

        print(f"--> Installing higgs-audio in editable mode from {HIGGS_AUDIO_DIR}...")
        # Install from inside repo (outside venv) so repo persists across venv recreations.
        run_command([VENV_PYTHON, "-m", "pip", "install", "--no-cache-dir", "-e", ".", "--no-deps"], cwd=HIGGS_AUDIO_DIR)

    # 4. Download Models
    if os.environ.get("SKIP_HEAVY"):
        print("--> [TEST] Skipping Model Downloads (SKIP_HEAVY set).")
    else:
        # Install huggingface_hub in venv if missing
        run_command([VENV_PYTHON, "-m", "pip", "install", "huggingface_hub[cli]"])
        
        # Use venv python to run download script so it sees huggingface_hub
        
        download_script = """
import os
import sys
# Add venv site-packages to path just in case, though executing with venv python handles this.
from huggingface_hub import snapshot_download

HIGGS_MODEL_PATH = "/runpod-volume/models/higgs/generation-3B-base"
HIGGS_TOKENIZER_PATH = "/runpod-volume/models/higgs/tokenizer"

model_mapping = {
    HIGGS_MODEL_PATH: "bosonai/higgs-audio-v2-generation-3B-base",
    HIGGS_TOKENIZER_PATH: "bosonai/higgs-audio-v2-tokenizer"
}

os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"

for local_path, repo_id in model_mapping.items():
    if not os.path.exists(local_path) or len(os.listdir(local_path)) < 2:
        print(f"--> Downloading {repo_id} to {local_path}...")
        snapshot_download(repo_id=repo_id, local_dir=local_path, local_dir_use_symlinks=False)
    else:
        print(f"--> {local_path}  exists.")
"""
        print("--> Triggering model download via Venv Python...")
        subprocess.run([VENV_PYTHON, "-c", download_script], check=True)

    # 5. Cleanup
    print("--> Cleaning up temp files...")
    shutil.rmtree(TMP_DIR, ignore_errors=True)
    shutil.rmtree(PIP_CACHE_DIR, ignore_errors=True)

    print("--> Provisioning Complete! You can now start the runner pods.")
    
    # 6. Idle
    print("--> Entering idle mode to keep pod alive (auto-restart prevention)...")
    signal.pause()

if __name__ == "__main__":
    provision()
