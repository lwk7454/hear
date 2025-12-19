import requests
import os
import time
import wave
import uuid
import json
from datetime import datetime
from dotenv import load_dotenv

# Load env for Supabase
load_dotenv()
try:
    from supabase import create_client
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None
except ImportError:
    supabase = None
    print("Warning: 'supabase' lib not found or keys missing.")

BASE_URL = "http://localhost:8002"

def setup_test_data():
    """Ensures Creator exists."""
    if not supabase:
        print("Skipping DB Setup (No Supabase config). using dummy IDs.")
        return "test_creator_default"
    
    print("--> Setting up Test Data in Supabase...")
    try:
        # 1. Creator
        c_uuid = str(uuid.uuid4())
        email = f"test_creator_{c_uuid[:6]}@test.com"
        now_ts = datetime.utcnow().isoformat()
        creator_data = {"id": c_uuid, "email": email, "name": "Test Creator", "updatedAt": now_ts}
        res = supabase.table("Creator").insert(creator_data).execute()
        creator_id = res.data[0]['id']
        
        print(f"    Created Creator: {creator_id}")
        return creator_id
    except Exception as e:
        print(f"    Setup DB Failed: {e}. Using dummy IDs.")
        return "test_creator_default"

def test_synthesize():
    print(f"Checking Health at {BASE_URL}...")
    try:
        r = requests.get(BASE_URL)
        print(f"Health: {r.json()}")
        assert r.status_code == 200
    except Exception as e:
        print(f"Worker not reachable: {e}")
        return

    # Setup DB
    creator_id = setup_test_data()

    print("\nTesting /clone (Prerequisite for Synthesize)...")
    # Create a dummy wav file (silence is fine for testing pipeline)
    with wave.open("test_synth.wav", 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24000)
        wav_file.writeframes(b'\x00\x00' * 24000) # 1 second of silence
        
    try:
        with open("test_synth.wav", "rb") as f:
            r = requests.post(
                f"{BASE_URL}/clone", 
                files={"file": f}, 
                data={"creator_id": creator_id} 
            )
        
        if r.status_code != 200:
            print(f"Clone Create Failed: {r.text}")
            return
            
        print(f"Clone Response: {r.json()}")
        
        # 3. Test Synthesize
        print("\nTesting /synthesize...")
        payload = {
            "creator_id": creator_id,
            "text": "Hello, this is a test of the synthesize endpoint."
        }
        
        r = requests.post(f"{BASE_URL}/synthesize", json=payload)
        print(f"Synthesize Status: {r.status_code}")
        if r.status_code == 200:
            print(f"Synthesize Success! Response: {r.json()}")
        else:
            print(f"Synthesize Failed: {r.text}")

    finally:
        if os.path.exists("test_synth.wav"): 
            os.remove("test_synth.wav")

if __name__ == "__main__":
    test_synthesize()
