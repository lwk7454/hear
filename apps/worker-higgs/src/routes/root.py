from fastapi import APIRouter
from ..config import CACHE_DIR
from .. import engine

router = APIRouter()

@router.get("/")
def read_root():
    return {"status": "online", "service": "hear-higgs-worker", "gpu": True, "cache_dir": str(CACHE_DIR)}

@router.post("/initialize")
async def initialize():
    """
    Aliyun FC Lifecycle Hook: Initialize the model.
    """
    from ..app import initialize_engine
    
    try:
        initialize_engine()
        if engine.startup_error:
            return {"status": "error", "message": engine.startup_error}
        return {"status": "success", "message": "Engine initialized"}
    except Exception as e:
        import traceback
        return {"status": "error", "message": f"{e}\n{traceback.format_exc()}"}
