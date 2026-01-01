terraform {
  required_providers {
    runpod = {
      source  = "decentralized-infrastructure/runpod"
      version = "~> 1.0.1"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3.1"
    }
  }
}

# 1. External Template Management
data "external" "template" {
  program = ["python3", "${path.module}/manage_template.py"]

  query = {
    api_key        = var.runpod_api_key
    name           = "${var.project_name}-${var.environment}-${var.server_name}"
    image_name     = var.container_image
    container_port = tostring(var.container_port)
    env_vars       = jsonencode(var.env_vars)
  }
}

# 2. Long-running Pod (Workaround for GPU-enforcement in provider)
data "external" "pod" {
  program = ["python3", "${path.module}/manage_pod.py"]

  query = {
    api_key     = var.runpod_api_key
    name        = "${var.project_name}-${var.environment}-${var.server_name}"
    template_id = data.external.template.result.id
    vcpu_count  = tostring(var.cpu_count)
    memory_gb   = tostring(var.ram_gb)
  }
}

output "pod_id" {
  value = data.external.pod.result.id
}
