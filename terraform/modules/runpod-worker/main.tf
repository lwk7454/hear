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

# 1. Network Volume for Models (Optional)
resource "runpod_network_volume" "models" {
  count          = var.use_network_volume && var.network_volume_id == null ? 1 : 0
  name           = "${var.project_name}-${var.environment}-${var.worker_name}"
  size           = 20
  data_center_id = "CA-MTL-1" # Canada (Montreal)
}

# 2. External Template Management (Workaround for missing provider resource)
data "external" "template" {
  program = ["python3", "${path.module}/manage_template.py"]

  query = {
    api_key        = var.runpod_api_key
    name           = "${var.project_name}-${var.environment}-${var.worker_name}"
    image_name     = var.container_image
    container_port = tostring(var.container_port)
    env_vars       = jsonencode(var.env_vars)
  }
}

# 3. Serverless Endpoint
resource "runpod_endpoint" "worker" {
  name        = "${var.project_name}-${var.environment}-${var.worker_name}-worker"
  template_id = data.external.template.result.id

  gpu_type_ids      = var.gpu_types
  data_center_ids   = ["CA-MTL-1"]
  network_volume_id = var.network_volume_id != null ? var.network_volume_id : (var.use_network_volume ? runpod_network_volume.models[0].id : null)

  idle_timeout = 5 # Scale to zero

  scaler_type  = "QUEUE_DELAY"
  scaler_value = 10

  workers_min = 0
  workers_max = 1

  lifecycle {
    ignore_changes = [
      name,
      compute_type
    ]
  }
}

output "runpod_endpoint_url" {
  value = "https://api.runpod.ai/v2/${runpod_endpoint.worker.id}/run"
}

output "template_id" {
  value = data.external.template.result.id
}

output "network_volume_id" {
  value = var.network_volume_id != null ? var.network_volume_id : (var.use_network_volume ? runpod_network_volume.models[0].id : null)
}
