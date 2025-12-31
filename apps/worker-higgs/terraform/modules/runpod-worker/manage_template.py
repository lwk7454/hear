import json
import sys
import urllib.request
import urllib.error

def runpod_graphql(api_key, query, variables=None):
    # Correct endpoint is .io and Auth is usually via header
    url = "https://api.runpod.io/graphql"
    
    data = json.dumps({'query': query, 'variables': variables}).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        status_code = e.code
        error_content = e.read().decode('utf-8')
        print(f"HTTP Error: {status_code} - {error_content}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

def main():
    # Read input from stdin (Terraform external data source)
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            input_data = {}
        else:
            input_data = json.loads(raw_input)
    except Exception:
        input_data = {}

    api_key = input_data.get('api_key')
    template_name = input_data.get('name')
    image_name = input_data.get('image_name')
    container_port = int(input_data.get('container_port', 9000))
    env_vars = json.loads(input_data.get('env_vars', '{}'))

    if not api_key:
        print("Missing api_key", file=sys.stderr)
        sys.exit(1)

    # 1. Check if template exists
    query_list = """
    query GetTemplates {
      myself {
        podTemplates {
          id
          name
        }
        containerRegistryAuth {
          id
          name
        }
      }
    }
    """
    data = runpod_graphql(api_key, query_list)
    
    # Handle GraphQL errors
    if 'errors' in data:
        print(f"GraphQL Errors: {json.dumps(data['errors'])}", file=sys.stderr)
        sys.exit(1)

    templates = data.get('data', {}).get('myself', {}).get('podTemplates', [])
    registry_auths = data.get('data', {}).get('myself', {}).get('containerRegistryAuth', [])

    if templates is None:
        templates = []
    if registry_auths is None:
        registry_auths = []
    
    existing_template = next((t for t in templates if t['name'] == template_name), None)
    
    # Try to find a registry auth for ghcr.io
    # We look for 'ghcr.io' in the name or username
    # This assumes the user has already added GHCR credentials to RunPod
    ghcr_auth = next((a for a in registry_auths if 'ghcr.io' in a['name'].lower()), None)
    registry_auth_id = ghcr_auth['id'] if ghcr_auth else None
    
    if not registry_auth_id:
        print("⚠️ Warning: No GHCR credentials found in RunPod. Private images may fail to pull.", file=sys.stderr)
        print("   Please add GHCR (ghcr.io) credentials in RunPod Settings > Managed Registry.", file=sys.stderr)
    
    # 2. Create or Update Template
    env_list = [{"key": k, "value": v} for k, v in env_vars.items()]

    mutation = """
    mutation SaveTemplate($input: SaveTemplateInput!) {
      saveTemplate(input: $input) {
        id
        name
      }
    }
    """
    variables = {
        "input": {
            "name": template_name,
            "imageName": image_name,
            "ports": f"{container_port}/http",
            "env": env_list,
            "isServerless": True,
            "containerDiskInGb": 20,
            "volumeInGb": 0,
            "dockerArgs": ""
        }
    }
    
    if registry_auth_id:
        variables["input"]["containerRegistryAuthId"] = registry_auth_id
    
    if existing_template:
        variables["input"]["id"] = existing_template["id"]

    data = runpod_graphql(api_key, mutation, variables)
    
    if 'errors' in data:
        print(f"GraphQL Mutation Errors: {json.dumps(data['errors'])}", file=sys.stderr)
        sys.exit(1)

    saved_template = data.get('data', {}).get('saveTemplate')
    
    if not saved_template:
        print(f"Failed to save template: {json.dumps(data)}", file=sys.stderr)
        sys.exit(1)

    # Return output as JSON to Terraform
    print(json.dumps({"id": saved_template["id"]}))

if __name__ == "__main__":
    main()
