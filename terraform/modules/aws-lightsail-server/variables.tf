variable "project_name" {
  type    = string
  default = "hear"
}

variable "environment" {
  type = string
}

variable "bundle_id" {
  type        = string
  default     = "micro_3_0" # $5/month, 1GB RAM, 2 vCPU, IPv6 only support
  description = "The bundle ID for the instance (e.g. nano_3_0, micro_3_0)"
}

variable "blueprint_id" {
  type        = string
  default     = "nodejs_22"
  description = "The blueprint ID for the instance (e.g. ubuntu_22_04, nodejs_22)"
}

variable "env_vars" {
  type        = map(string)
  default     = {}
  description = "Environment variables to inject into the instance"
}
