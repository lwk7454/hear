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
    except urllib.error.HTTPError as e:
        status_code = e.code
        error_content = e.read().decode('utf-8')
        print(f"HTTP Error: {status_code} - {error_content}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            input_data = {}
        else:
            input_data = json.loads(raw_input)
    except Exception:
        input_data = {}

    api_key = input_data.get('api_key')
    pod_name = input_data.get('name')
    template_id = input_data.get('template_id')
    vcpu_count = int(input_data.get('vcpu_count', 2))
    memory_gb = int(input_data.get('memory_gb', 4))
    ports = input_data.get('ports', '8000')
    
    if not api_key or not pod_name or not template_id:
        print("Missing required input", file=sys.stderr)
        sys.exit(1)

    # Pod management logic

    # 1. Check if pod exists
    query_list = """
    query GetPods {
      myself {
        pods {
          id
          name
          templateId
          imageName
          runtime {
            ports {
              ip
              isIpPublic
              privatePort
              publicPort
            }
          }
          gpuCount
          machine {
            dataCenterId
          }
        }
      }
    }
    """
    data = runpod_graphql(api_key, query_list)
    
    if 'errors' in data:
        print(f"GraphQL Errors: {json.dumps(data['errors'])}", file=sys.stderr)
        sys.exit(1)

    pods = data.get('data', {}).get('myself', {}).get('pods', [])
    if pods is None: pods = []
    
    existing_pod = next((p for p in pods if p['name'] == pod_name), None)
    
    # Target config for CPU-only pod in US-NC-2 (cpu3g-2-8)
    target_dc = "US-NC-2"
    target_gpu_count = 0
    target_instance_id = "cpu3g-2-8"
    target_disk = 5

    if existing_pod:
        current_dc = existing_pod.get('machine', {}).get('dataCenterId')
        current_gpu_count = existing_pod.get('gpuCount')
        current_template_id = existing_pod.get('templateId')
        
        existing_ports = existing_pod.get('runtime', {}).get('ports')
        has_correct_port = False
        if existing_ports:
            for p in existing_ports:
                if str(p.get('privatePort')) == str(ports):
                    has_correct_port = True
                    break

        if (current_dc == target_dc and 
            current_gpu_count == target_gpu_count and 
            current_template_id == template_id and
            has_correct_port):
            print(json.dumps({"id": existing_pod["id"]}))
            return
        else:
            # Terminate the mismatched pod
            reason = []
            if current_dc != target_dc: reason.append(f"DC: {current_dc} -> {target_dc}")
            if current_gpu_count != target_gpu_count: reason.append(f"GPU: {current_gpu_count} -> {target_gpu_count}")
            if current_template_id != template_id: reason.append(f"Template: {current_template_id} -> {template_id}")
            if not has_correct_port: reason.append(f"Ports: Missing or mismatched (Target: {ports})")
            
            print(f"Terminating mismatched pod {existing_pod['id']} ({', '.join(reason)})", file=sys.stderr)
            mutation_terminate = """
            mutation TerminatePod($input: PodTerminateInput!) {
              podTerminate(input: $input)
            }
            """
            runpod_graphql(api_key, mutation_terminate, {"input": {"podId": existing_pod["id"]}})
    
    # 2. Deploy CPU Pod
    # Based on research, deployCpuPod is the correct undocumented mutation for pure CPU pods.
    # We use a literal mutation to avoid issues with unknown input type names in variables.
    mutation = f"""
    mutation {{
      deployCpuPod(input: {{
        name: "{pod_name}",
        templateId: "{template_id}",
        instanceId: "{target_instance_id}",
        containerDiskInGb: {target_disk},
        cloudType: SECURE,
        dataCenterId: "{target_dc}",
        ports: "{ports}/http"
      }}) {{
        id
      }}
    }}
    """
    
    data = runpod_graphql(api_key, mutation)
    
    if 'errors' in data:
        print(f"GraphQL Mutation Errors: {json.dumps(data['errors'])}", file=sys.stderr)
        sys.exit(1)

    deployed_pod = data.get('data', {}).get('deployCpuPod')
    
    if not deployed_pod:
        print(f"Failed to deploy pod: {json.dumps(data)}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps({"id": deployed_pod["id"]}))

if __name__ == "__main__":
    main()
