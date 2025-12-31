from src.config import PORT
from src.app import app

if __name__ == "__main__":
    # Listen on 0.0.0.0 to accept connections from other machines (e.g. Mac accessing Windows)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
