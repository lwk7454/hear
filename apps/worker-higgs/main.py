import os
import uvicorn
import runpod
import asyncio
from src.app import app, initialize_engine, ensure_infrastructure
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
    if os.getenv("RUNPOD_SERVERLESS", "false").lower() == "true":
        print("--> Starting RunPod Serverless Worker...")
        runpod.serverless.start({"handler": handler})
    else:
        print(f"--> Starting Local Development Server on port {PORT}...")
        # Listen on 0.0.0.0 to accept connections from other machines (e.g. Mac accessing Windows)
        uvicorn.run(app, host="0.0.0.0", port=PORT)
