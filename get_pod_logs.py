import json
import sys
import urllib.request
import urllib.error

def runpod_graphql(api_key, query, variables=None):
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
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

def main():
    api_key = "rpa_WPLAUQ17XHYKI97KZ0TSL3GJNESA32LPBBDK7X1Rzyohco"
    pod_id = "107vl85wxrw1xc"

    query = """
    query GetPods {
      myself {
        pods {
          id
          name
          runtime {
            stdout
            stderr
          }
        }
      }
    }
    """
    
    data = runpod_graphql(api_key, query)
    if 'errors' in data:
        print(json.dumps(data['errors'], indent=2))
        return

    pods = data.get('data', {}).get('myself', {}).get('pods', [])
    pod = next((p for p in pods if p['id'] == pod_id), None)
    
    if pod and pod.get('runtime'):
        runtime = pod['runtime']
        print("STDOUT:")
        print(runtime.get('stdout'))
        print("\nSTDERR:")
        print(runtime.get('stderr'))
    else:
        print(f"Pod {pod_id} not found or no runtime data")

if __name__ == "__main__":
    main()
