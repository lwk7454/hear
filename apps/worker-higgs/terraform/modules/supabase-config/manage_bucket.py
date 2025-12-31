import json
import sys
import urllib.request
import urllib.error

def main():
    # Read input from stdin
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            input_data = {}
        else:
            input_data = json.loads(raw_input)
    except Exception:
        input_data = {}

    supabase_url = input_data.get('supabase_url')
    supabase_key = input_data.get('supabase_key')
    bucket_name = input_data.get('name')
    public = input_data.get('public', 'false').lower() == 'true'

    if not supabase_url or not supabase_key:
        print("Missing supabase_url or supabase_key", file=sys.stderr)
        sys.exit(1)

    # Remove trailing slash from URL
    supabase_url = supabase_url.rstrip('/')
    
    headers = {
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }

    # 1. Check if bucket exists
    list_url = f"{supabase_url}/storage/v1/bucket"
    req_list = urllib.request.Request(list_url, headers=headers)
    
    try:
        with urllib.request.urlopen(req_list) as response:
            buckets = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        status_code = e.code
        error_content = e.read().decode('utf-8')
        print(f"HTTP Error checking bucket: {status_code} - {error_content}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error checking bucket: {str(e)}", file=sys.stderr)
        sys.exit(1)

    existing_bucket = next((b for b in buckets if b['name'] == bucket_name), None)
    
    if existing_bucket:
        print(json.dumps({"id": existing_bucket["id"]}))
        return

    # 2. Create Bucket
    # Removing fileSizeLimit to avoid potential 413 Payload Too Large confusion
    create_url = f"{supabase_url}/storage/v1/bucket"
    payload = {
        "id": bucket_name,
        "name": bucket_name,
        "public": public
    }
    data = json.dumps(payload).encode('utf-8')
    req_create = urllib.request.Request(create_url, data=data, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req_create) as response:
            data = json.loads(response.read().decode('utf-8'))
            # Supabase Storage API returns {"name": "..."} on success
            print(json.dumps({"id": bucket_name}))
    except urllib.error.HTTPError as e:
        status_code = e.code
        error_content = e.read().decode('utf-8')
        print(f"Failed to create bucket: {status_code} - {error_content}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error creating bucket: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
