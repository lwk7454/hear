variable "runpod_api_key" {
  type      = string
  sensitive = true
}

variable "project_name" {
  type    = string
  default = "hear"
}

variable "environment" {
  type = string
}

variable "server_name" {
  type    = string
  default = "server"
}

variable "container_image" {
  type = string
}

variable "container_port" {
  type    = number
  default = 8000
}

variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "cpu_count" {
  type    = number
  default = 2
}

variable "ram_gb" {
  type    = number
  default = 4
}
