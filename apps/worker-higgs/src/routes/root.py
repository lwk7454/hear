from fastapi import APIRouter
from ..config import CACHE_DIR

router = APIRouter()

@router.get("/")
def read_root():
    return {"status": "online", "service": "hear-higgs-worker", "gpu": True, "cache_dir": str(CACHE_DIR)}
