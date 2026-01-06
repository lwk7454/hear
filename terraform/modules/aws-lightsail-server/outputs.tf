output "instance_name" {
  value = aws_lightsail_instance.server.name
}

output "ipv6_address" {
  value = aws_lightsail_instance.server.ipv6_addresses[0]
}

output "ssh_key_parameter" {
  value = aws_ssm_parameter.server_private_key.name
}

# Legacy outputs for compatibility (if needed during transition)
output "server_url" {
  value = "http://[${aws_lightsail_instance.server.ipv6_addresses[0]}]:8000"
}

output "static_ip" {
  value = aws_lightsail_static_ip.server_ip.ip_address
}
