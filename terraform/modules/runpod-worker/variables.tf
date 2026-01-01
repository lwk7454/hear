variable "project_name" {
  type = string
}
variable "environment" {
  type = string
}
variable "worker_name" {
  type = string
}
variable "runpod_api_key" {
  type      = string
  sensitive = true
}
variable "gpu_type" {
  type    = string
  default = "NVIDIA RTX A4000" # Suitable for lighter workloads like Demucs
}
variable "gpu_count" {
  type    = number
  default = 1
}
variable "container_image" {
  type = string
}
variable "container_port" {
  type    = number
  default = 9000
}
variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "network_volume_id" {
  type    = string
  default = null
}

variable "use_network_volume" {
  type    = bool
  default = false
}
