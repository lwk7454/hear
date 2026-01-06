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

  backend "pg" {}
}

provider "runpod" {
  api_key = var.runpod_api_key
}

provider "aws" {
  region = "ca-central-1"
}

# --- SSM Parameters ---
data "aws_ssm_parameter" "supabase_url" {
  name = "/hear/${var.environment}/SUPABASE_URL"
}

data "aws_ssm_parameter" "supabase_service_key" {
  name            = "/hear/${var.environment}/SUPABASE_SERVICE_KEY"
  with_decryption = true
}

# --- Variables ---

variable "project_name" {
  type    = string
  default = "hear"
}

variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "ca-central-1" # Canada (Montreal)
}

variable "runpod_api_key" {
  type      = string
  sensitive = true
}

variable "github_username" {
  type = string
}

# --- Modules ---

module "worker" {
  source = "../../../../../terraform/modules/runpod-worker"

  worker_name = "higgs"

  project_name       = var.project_name
  environment        = var.environment
  runpod_api_key     = var.runpod_api_key
  gpu_types          = ["NVIDIA L4", "NVIDIA RTX A5000", "NVIDIA GeForce RTX 3090"]
  gpu_count          = 1
  container_image    = "ghcr.io/${var.github_username}/worker-higgs:latest"
  container_port     = 9000
  use_network_volume = true

  env_vars = {
    HIGGS_MODEL_PATH          = "/runpod-volume/models/higgs"
    HIGGS_TOKENIZER_PATH      = "/runpod-volume/models/tokenizer"
    SUPABASE_URL              = data.aws_ssm_parameter.supabase_url.value
    SUPABASE_SERVICE_ROLE_KEY = data.aws_ssm_parameter.supabase_service_key.value
    ENV                       = var.environment
  }
}

# --- Outputs ---

output "runpod_endpoint_url" {
  value = module.worker.runpod_endpoint_url
}
