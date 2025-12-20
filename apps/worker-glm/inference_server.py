from fastapi import FastAPI, WebSocket
import uvicorn
import torch
import os
from transformers import AutoModel, AutoTokenizer

app = FastAPI()

# Configuration
MODEL_PATH = "THUDM/glm-4-voice-9b"
LORA_DIR = "/workspace/adapters"

# Global model state
model = None
tokenizer = None

@app.on_event("startup")
async def startup_event():
    global model, tokenizer
    print(f"Loading GLM-4-Voice model from {MODEL_PATH}...")
    # In production on RunPod 4090, we load in 4-bit/8-bit to fit LoRA overhead
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
    model = AutoModel.from_pretrained(
        MODEL_PATH, 
        trust_remote_code=True,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        device_map="auto",
        load_in_4bit=True # QLoRA for 24GB VRAM
    )
    print("Model loaded successfully.")

@app.post("/load_adapter")
async def load_adapter(character_id: str):
    """
    Dynamically loads a LoRA adapter for a specific character.
    """
    adapter_path = os.path.join(LORA_DIR, character_id)
    if not os.path.exists(adapter_path):
        return {"status": "error", "message": "Adapter not found"}
    
    # model.load_adapter(adapter_path) # Transformers LoRA logic
    return {"status": "success", "character_id": character_id}

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # 1. Receive Audio Tokens or Raw PCM
            data = await websocket.receive_bytes()
            
            # 2. Pseudo-Duplex Inference Logic
            # - Run inference in a background thread/stream
            # - Check for interruption signals if implemented
            
            # 3. Stream back Audio Tokens
            # for token in model.stream_generate(data):
            #     await websocket.send_bytes(token)
            
            await websocket.send_bytes(data) # Loopback mock for now
            
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
