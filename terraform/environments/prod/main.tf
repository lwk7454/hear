terraform {
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }

  backend "pg" {}
}

provider "supabase" {
  access_token = var.supabase_access_token
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
