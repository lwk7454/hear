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
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }

  backend "pg" {}
}

provider "runpod" {
  api_key = var.runpod_api_key
}

provider "supabase" {
  access_token = var.supabase_access_token
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

variable "supabase_project_id" {
  type = string
}

variable "supabase_access_token" {
  type      = string
  sensitive = true
}

variable "supabase_url" {
  type = string
}

variable "supabase_service_role_key" {
  type      = string
  sensitive = true
}

# --- Modules ---

module "worker" {
  source = "../../modules/runpod-worker"

  project_name    = var.project_name
  environment     = var.environment
  runpod_api_key  = var.runpod_api_key
  gpu_type        = "NVIDIA A40" # Optimized for Higgs
  gpu_count       = 1
  container_image = "ghcr.io/${var.github_username}/worker-higgs:latest"
  container_port  = 9000

  env_vars = {
    HIGGS_MODEL_PATH          = "/runpod-volume/models/higgs"
    HIGGS_TOKENIZER_PATH      = "/runpod-volume/models/tokenizer"
    SUPABASE_URL              = var.supabase_url
    SUPABASE_SERVICE_ROLE_KEY = var.supabase_service_role_key
    ENV                       = var.environment
  }
}

module "supabase" {
  source = "../../modules/supabase-config"

  project_id                = var.supabase_project_id
  environment               = var.environment
  supabase_url              = var.supabase_url
  supabase_service_role_key = var.supabase_service_role_key
}

# --- Outputs ---

output "runpod_endpoint_url" {
  value = module.worker.endpoint_url
}
