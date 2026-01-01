terraform {
  required_providers {
    supabase = {
      source = "supabase/supabase"
    }
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

provider "supabase" {
  access_token = var.supabase_access_token
}

provider "runpod" {
  api_key = var.runpod_api_key
}

variable "project_id" {
  type = string
}

variable "environment" {
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

variable "runpod_api_key" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "server_image" {
  type    = string
  default = "ghcr.io/lwk7454/hear/server:latest"
}

module "supabase_audio_bucket" {
  source = "../../modules/supabase-shared"

  project_id                = var.project_id
  environment               = var.environment
  supabase_url              = var.supabase_url
  supabase_service_role_key = var.supabase_service_role_key
  bucket_name               = "audio"
}

module "supabase_models_bucket" {
  source = "../../modules/supabase-shared"

  project_id                = var.project_id
  environment               = var.environment
  supabase_url              = var.supabase_url
  supabase_service_role_key = var.supabase_service_role_key
  bucket_name               = "models"
}

module "runpod_server" {
  source = "../../modules/runpod-server"

  runpod_api_key  = var.runpod_api_key
  environment     = var.environment
  container_image = var.server_image
  env_vars = {
    DATABASE_URL              = "postgres://postgres.${var.project_id}:${var.db_password}@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    SUPABASE_URL              = var.supabase_url
    SUPABASE_SERVICE_KEY      = var.supabase_service_role_key
    GOOGLE_LOGIN_REDIRECT_URI = "https://hear-server-dev.runpod.net/auth/callback" # Placeholder
    YOUTUBE_CLIENT_ID         = "placeholder-id"
    YOUTUBE_CLIENT_SECRET     = "placeholder-secret"
    YOUTUBE_REDIRECT_URI      = "https://hear-server-dev.runpod.net/auth/youtube/callback"
    IG_CLIENT_ID              = "placeholder-id"
    IG_CLIENT_SECRET          = "placeholder-secret"
    IG_REDIRECT_URI           = "https://hear-server-dev.runpod.net/auth/instagram/callback"
    IDLE_TIMEOUT              = "300000" # 5 minutes
  }
}

module "supabase_web" {
  source = "../../modules/supabase-web"

  project_id                = var.project_id
  environment               = var.environment
  supabase_url              = var.supabase_url
  supabase_service_role_key = var.supabase_service_role_key
}

output "pod_id" {
  value = module.runpod_server.pod_id
}

output "web_bucket_id" {
  value = module.supabase_web.web_bucket_id
}
