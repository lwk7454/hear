variable "project_id" {
  description = "Project ID/Slug"
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. dev, prod)"
  type        = string
}

variable "domain_name" {
  description = "Custom domain name (e.g. hear-web-dev.wayneliao.dev)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for the custom domain"
  type        = string
  default     = ""
}
