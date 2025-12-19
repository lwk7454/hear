from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class ChatGenerateRequest(BaseModel):
    fan_id: str
    creator_id: str
    text: str
    voice_id: str # Local path from /clone
    history: List[dict] = [] # Optional previous context [{"role": "user", "content": "..."}]

class SynthesizeRequest(BaseModel):
    creator_id: str
    text: str
