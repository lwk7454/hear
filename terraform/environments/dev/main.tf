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
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "pg" {}
}

# --- SSM Parameters ---
data "aws_ssm_parameter" "supabase_url" {
  name = "/hear/${var.environment}/SUPABASE_URL"
}

data "aws_ssm_parameter" "supabase_service_key" {
  name            = "/hear/${var.environment}/SUPABASE_SERVICE_KEY"
  with_decryption = true
}

data "aws_ssm_parameter" "supabase_access_token" {
  name            = "/hear/${var.environment}/SUPABASE_ACCESS_TOKEN"
  with_decryption = true
}

data "aws_ssm_parameter" "runpod_api_key" {
  name            = "/hear/${var.environment}/RUNPOD_API_KEY"
  with_decryption = true
}

data "aws_ssm_parameter" "db_password" {
  name            = "/hear/${var.environment}/DB_PASSWORD"
  with_decryption = true
}

data "aws_ssm_parameter" "youtube_client_id" {
  name = "/hear/${var.environment}/YOUTUBE_CLIENT_ID"
}

data "aws_ssm_parameter" "youtube_client_secret" {
  name            = "/hear/${var.environment}/YOUTUBE_CLIENT_SECRET"
  with_decryption = true
}

data "aws_ssm_parameter" "ig_client_id" {
  name = "/hear/${var.environment}/IG_CLIENT_ID"
}

data "aws_ssm_parameter" "ig_client_secret" {
  name            = "/hear/${var.environment}/IG_CLIENT_SECRET"
  with_decryption = true
}

# --- Providers ---

provider "supabase" {
  access_token = data.aws_ssm_parameter.supabase_access_token.value
}

provider "runpod" {
  api_key = data.aws_ssm_parameter.runpod_api_key.value
}

provider "aws" {
  region = "ca-central-1"
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

locals {
  root_domain = "wayneliao.dev"
  web_domain  = "hear-web-dev.${local.root_domain}"
  api_domain  = "hear-api-dev.${local.root_domain}"
}

# --- Route53 Zones (Subdomain Delegation) ---

resource "aws_route53_zone" "web" {
  name = local.web_domain
}

resource "aws_route53_zone" "api" {
  name = local.api_domain
}

# --- ACM Certificates (Separate for each subdomain to allow auto-validation) ---

# 1. Web Certificate
resource "aws_acm_certificate" "web" {
  provider          = aws.us_east_1
  domain_name       = local.web_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "web_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.web.domain_validation_options : dvo.domain_name => dvo
  }

  allow_overwrite = true
  name            = each.value.resource_record_name
  records         = [each.value.resource_record_value]
  ttl             = 60
  type            = each.value.resource_record_type
  zone_id         = aws_route53_zone.web.zone_id
}

resource "aws_acm_certificate_validation" "web" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.web.arn
  validation_record_fqdns = [for record in aws_route53_record.web_cert_validation : record.fqdn]
}

# 2. API Certificate
resource "aws_acm_certificate" "api" {
  provider          = aws.us_east_1
  domain_name       = local.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => dvo
  }

  allow_overwrite = true
  name            = each.value.resource_record_name
  records         = [each.value.resource_record_value]
  ttl             = 60
  type            = each.value.resource_record_type
  zone_id         = aws_route53_zone.api.zone_id
}

resource "aws_acm_certificate_validation" "api" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api_cert_validation : record.fqdn]
}

# --- Modules ---

module "supabase_audio_bucket" {
  source = "../../modules/supabase-shared"

  project_id                = var.project_id
  environment               = var.environment
  supabase_url              = data.aws_ssm_parameter.supabase_url.value
  supabase_service_role_key = data.aws_ssm_parameter.supabase_service_key.value
  bucket_name               = "audio"
}

module "supabase_models_bucket" {
  source = "../../modules/supabase-shared"

  project_id                = var.project_id
  environment               = var.environment
  supabase_url              = data.aws_ssm_parameter.supabase_url.value
  supabase_service_role_key = data.aws_ssm_parameter.supabase_service_key.value
  bucket_name               = "models"
}

module "aws_server" {
  source = "../../modules/aws-lightsail-server"

  project_name = "hear"
  environment  = var.environment
  bundle_id    = "small_3_0"
  blueprint_id = "ubuntu_22_04"

  env_vars = {
    DATABASE_URL         = "postgres://postgres.${var.project_id}:${data.aws_ssm_parameter.db_password.value}@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    SUPABASE_URL         = data.aws_ssm_parameter.supabase_url.value
    SUPABASE_SERVICE_KEY = data.aws_ssm_parameter.supabase_service_key.value
    CORS_ORIGINS         = "https://${local.web_domain}"
    FRONTEND_URL         = "https://${local.web_domain}"

    # Auth
    GOOGLE_LOGIN_REDIRECT_URI = "https://${local.api_domain}/auth/login/google/callback"
    YOUTUBE_CLIENT_ID         = data.aws_ssm_parameter.youtube_client_id.value
    YOUTUBE_CLIENT_SECRET     = data.aws_ssm_parameter.youtube_client_secret.value
    YOUTUBE_REDIRECT_URI      = "https://${local.api_domain}/auth/youtube/callback"
    IG_CLIENT_ID              = data.aws_ssm_parameter.ig_client_id.value
    IG_CLIENT_SECRET          = data.aws_ssm_parameter.ig_client_secret.value
    IG_REDIRECT_URI           = "https://${local.api_domain}/auth/instagram/callback"
    IDLE_TIMEOUT              = "300000"

    # RunPod (if needed by server)
    RUNPOD_API_KEY = data.aws_ssm_parameter.runpod_api_key.value
  }
}

module "aws_web" {
  source = "../../modules/aws-static-web"

  project_id          = var.project_id
  environment         = var.environment
  domain_name         = local.web_domain
  acm_certificate_arn = aws_acm_certificate.web.arn
}

# --- CloudFront Proxy for Lightsail API (Free SSL) ---

resource "aws_cloudfront_distribution" "api_proxy" {
  origin {
    domain_name = aws_route53_record.api_origin.fqdn # Using DNS Reocrd
    origin_id   = "LightsailAPI"

    custom_origin_config {
      http_port              = 8000
      https_port             = 443
      origin_protocol_policy = "http-only" # We talk to Lightsail on HTTP:8000
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_id} ${var.environment} api proxy"
  aliases         = [local.api_domain]

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "LightsailAPI"

    forwarded_values {
      query_string = true
      headers      = ["*"] # Forward ALL headers for API
      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.api.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# --- DNS Records ---

# --- DNS Records (Alias to CloudFront) ---

# Note: Since we have zones for the subdomains, the record name is empty (root of the subdomain zone)
# i.e. hear-web-dev.wayneliao.dev is the APEX of the `hear-web-dev.wayneliao.dev` zone.

resource "aws_route53_record" "web" {
  zone_id = aws_route53_zone.web.zone_id
  name    = local.web_domain
  type    = "A"

  alias {
    name                   = module.aws_web.cloudfront_domain_name
    zone_id                = module.aws_web.cloudfront_hosted_zone_id # Need to ensure this output exists or hardcode CF Zone ID
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.api.zone_id
  name    = local.api_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api_proxy.domain_name
    zone_id                = aws_cloudfront_distribution.api_proxy.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_origin" {
  zone_id = aws_route53_zone.api.zone_id
  name    = "origin.${local.api_domain}"
  type    = "A"
  ttl     = "300"
  records = [module.aws_server.static_ip]
}

output "server_url" {
  value = "https://${local.api_domain}"
}

output "server_service_name" {
  value = module.aws_server.instance_name
}

output "cloudfront_url" {
  value = module.aws_web.cloudfront_domain_name
}

output "s3_bucket" {
  value = module.aws_web.s3_bucket_name
}


output "cloudfront_id" {
  value = module.aws_web.cloudfront_distribution_id
}

output "nameservers_web" {
  value = aws_route53_zone.web.name_servers
}

output "nameservers_api" {
  value = aws_route53_zone.api.name_servers
}

# --- Auto-Export Outputs to SSM (For CI/CD) ---

resource "aws_ssm_parameter" "export_web_bucket" {
  name      = "/hear/${var.environment}/WEB_S3_BUCKET"
  type      = "String"
  value     = module.aws_web.s3_bucket_name
  overwrite = true
}

resource "aws_ssm_parameter" "export_cloudfront_id" {
  name      = "/hear/${var.environment}/WEB_CLOUDFRONT_ID"
  type      = "String"
  value     = module.aws_web.cloudfront_distribution_id
  overwrite = true
}

resource "aws_ssm_parameter" "export_api_url" {
  name      = "/hear/${var.environment}/NEXT_PUBLIC_API_URL"
  type      = "String"
  value     = "https://${local.api_domain}"
  overwrite = true
}

resource "aws_ssm_parameter" "export_cors_origins" {
  name      = "/hear/${var.environment}/CORS_ORIGINS"
  type      = "String"
  value     = "https://${local.web_domain},http://localhost:3000"
  overwrite = true
}
