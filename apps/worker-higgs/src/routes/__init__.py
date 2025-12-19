from fastapi import APIRouter
from .root import router as root_router
from .voice import router as voice_router
from .chat import router as chat_router
from .tts import router as tts_router

router = APIRouter()

router.include_router(root_router)
router.include_router(voice_router)
router.include_router(chat_router, prefix="/chat")
router.include_router(tts_router)
