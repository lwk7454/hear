terraform {
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3.1"
    }
  }
}

# External Bucket Management (Workaround for missing provider resource)
data "external" "bucket" {
  program = ["python3", "${path.module}/manage_bucket.py"]

  query = {
    supabase_url = var.supabase_url
    supabase_key = var.supabase_service_role_key
    name         = var.bucket_name
    public       = "false"
  }
}

output "bucket_id" {
  value = data.external.bucket.result.id
}
