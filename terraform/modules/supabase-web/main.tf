terraform {
  required_providers {
    supabase = {
      source = "supabase/supabase"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3.1"
    }
  }
}

# 1. Static Web Bucket
data "external" "bucket" {
  program = ["python3", "${path.module}/../../modules/supabase-shared/manage_bucket.py"]

  query = {
    supabase_url = var.supabase_url
    supabase_key = var.supabase_service_role_key
    name         = var.bucket_name
    public       = "true"
  }
}

# 2. Edge Function for Static Proxy 
# Note: The 'supabase_edge_function' resource is not supported in this provider version.
# We will deploy it via Supabase CLI in the CI/CD pipeline or manually for now.
# resource "supabase_edge_function" "static_proxy" {
#   project_ref = var.project_id
#   slug        = "static-proxy"
# }

output "web_bucket_id" {
  value = data.external.bucket.result.id
}
