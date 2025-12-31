import os
import torch
from pathlib import Path
from dotenv import load_dotenv
import tempfile

# 2. Config & Env
# Assuming this file is in apps/worker-higgs/src/config.py
# We want BASE_DIR to be apps/worker-higgs
BASE_DIR = Path(__file__).resolve().parent.parent

# Load local .env (Explicit declaration)
load_dotenv(dotenv_path=BASE_DIR / ".env", override=True)

# Supabase Init (Mandatory Env Vars)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.")

# Model Config
MODEL_PATH = os.getenv("HIGGS_MODEL_PATH", "bosonai/higgs-audio-v2-generation-3B-base")
TOKENIZER_PATH = os.getenv("HIGGS_TOKENIZER_PATH", "bosonai/higgs-audio-v2-tokenizer")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Aliyun FC default port is 9000
PORT = int(os.getenv("PORT", "9000"))

# Quantization
USE_4BIT = os.getenv("USE_4BIT", "true" if os.name == "nt" else "false").lower() == "true"
USE_8BIT = os.getenv("USE_8BIT", "false").lower() == "true"
if USE_4BIT:
    USE_8BIT = False # 4-bit takes precedence

KV_CACHE_SIZE = int(os.getenv("KV_CACHE_SIZE", "1024"))  # Smaller cache for 12GB VRAM
IS_PROD = os.getenv("ENV", "development").lower() == "production"

# Storage Config (Stateless / Read-Only Friendly)
# Default to /tmp/higgs_cache so it works in containers with read-only root but writable tmp
CACHE_DIR = Path(os.getenv("CACHE_DIR", Path(tempfile.gettempdir()) / "higgs_cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
print(f"--> Storage Cache Directory: {CACHE_DIR}")
