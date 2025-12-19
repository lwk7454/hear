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
    print("Warning: 'supabase' lib not found or keys missing. Tests might fail FK constraints if IDs don't exist.")

BASE_URL = "http://localhost:8002"

def setup_test_data():
    """Ensures Creator and Fan exist."""
    if not supabase:
        print("Skipping DB Setup (No Supabase config). using dummy IDs.")
        return "test_fan_default", "test_creator_default"
    
    print("--> Setting up Test Data in Supabase...")
    try:
        # 1. Creator
        c_uuid = str(uuid.uuid4())
        email = f"test_creator_{c_uuid[:6]}@test.com"
        now_ts = datetime.utcnow().isoformat()
        creator_data = {"id": c_uuid, "email": email, "name": "Test Creator", "updatedAt": now_ts}
        res = supabase.table("Creator").insert(creator_data).execute()
        creator_id = res.data[0]['id']
        
        # 2. Fan
        f_uuid = str(uuid.uuid4())
        fan_email = f"test_fan_{f_uuid[:6]}@test.com"
        fan_data = {"id": f_uuid, "email": fan_email, "updatedAt": now_ts}
        res = supabase.table("Fan").insert(fan_data).execute()
        fan_id = res.data[0]['id']
        
        print(f"    Created Creator: {creator_id}")
        print(f"    Created Fan: {fan_id}")
        return fan_id, creator_id
    except Exception as e:
        print(f"    Setup DB Failed: {e}. Using dummy IDs.")
        return "test_fan_default", "test_creator_default"

def test_endpoints():
    print(f"Checking Health at {BASE_URL}...")
    try:
        r = requests.get(BASE_URL)
        print(f"Health: {r.json()}")
        assert r.status_code == 200
    except Exception as e:
        print(f"Worker not reachable: {e}")
        return

    # Setup DB
    fan_id, creator_id = setup_test_data()

    print("\nTesting /clone (1. Create New)...")
    with wave.open("test_1.wav", 'wb') as wav_file:

        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24000)
        wav_file.writeframes(b'\x00\x00' * 12000)
        
    try:
        with open("test_1.wav", "rb") as f:
            # FIX: Send creator_id
            r = requests.post(
                f"{BASE_URL}/clone", 
                files={"file": f}, 
                data={"creator_id": creator_id} 
            )
        
        if r.status_code != 200:
            print(f"Clone Create Failed: {r.text}")
            return
            
        print(r.json())
        voice_path = r.json().get("voice_id")
        initial_duration = r.json().get("duration_seconds")
        print(f"Created Voice: {voice_path} (Duration: {initial_duration}s)")
        
        print("\nTesting /clone (2. Append)...")
        with wave.open("test_2.wav", 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(24000)
            wav_file.writeframes(b'\x00\x00' * 24000)
            
        with open("test_2.wav", "rb") as f:
            r = requests.post(
                f"{BASE_URL}/clone", 
                files={"file": f}, 
                data={"voice_id": voice_path, "creator_id": creator_id}
            )
        print(r.json())
        assert r.status_code == 200
        new_duration = r.json().get("duration_seconds")
        print(f"Appended Voice. New Duration: {new_duration}s")
        
        # 3. Test Chat Gen
        print("\nTesting /chat/generate...")
        payload = {
            "fan_id": fan_id, 
            "creator_id": creator_id,
            "text": "Hello, this is a context aware test.",
            "voice_id": voice_path, 
            "history": [
                {"role": "user", "content": "Hi there"},
                {"role": "assistant", "content": "Hello!"}
            ]
        }
        
        r = requests.post(f"{BASE_URL}/chat/generate", json=payload)
        print(r.json())
        if r.status_code == 200:
            print("Chat Gen Success!")
        else:
            print(f"Chat Gen Failed: {r.text}")

    finally:
        for f in ["test_1.wav", "test_2.wav"]:
            if os.path.exists(f): 
                os.remove(f)

if __name__ == "__main__":
    test_endpoints()
