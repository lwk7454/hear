variable "project_id" {
  type = string
}
variable "environment" {
  type = string
}
variable "supabase_url" {
  type = string
}
variable "supabase_service_role_key" {
  type      = string
  sensitive = true
}
