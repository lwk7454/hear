variable "project_name" {
  type = string
}
variable "environment" {
  type = string
}
variable "runpod_api_key" {
  type      = string
  sensitive = true
}
variable "gpu_type" {
  type    = string
  default = "NVIDIA RTX A4000"
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
