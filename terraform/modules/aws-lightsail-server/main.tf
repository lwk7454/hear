terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# 1. SSH Key Pair Management
resource "aws_lightsail_key_pair" "server_key" {
  name = "${var.project_name}-${var.environment}-server-key"
}

# Store Private Key in SSM for CI/CD usage
resource "aws_ssm_parameter" "server_private_key" {
  name        = "/${var.project_name}/${var.environment}/SERVER_SSH_KEY"
  description = "Private SSH key for accessing the ${var.environment} server instance"
  type        = "SecureString"
  value       = aws_lightsail_key_pair.server_key.private_key
  overwrite   = true
}

# 2. Lightsail Instance (VPS)
resource "aws_lightsail_instance" "server" {
  name              = "${var.project_name}-${var.environment}-server"
  availability_zone = "ca-central-1a"
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  key_pair_name     = aws_lightsail_key_pair.server_key.name

  # Enable IPv6-only networking to save costs (requires dual-stack bundle usually, 
  # but recent updates allow IPv6-only. If fail, we use dual-stack bundle but ignore IPv4)
  ip_address_type = "dualstack"

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }

  # User Data: Initial Provisioning
  # - Install Node.js 22, pnpm, pm2
  # - Install ffmpeg
  # - Setup directory structure
  # - Write env vars to .env file
  user_data = <<-EOF
    #!/bin/bash
    
    # 0. Install Node.js 22
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    apt-get install -y nodejs
    
    # 1. Install global dependencies
    npm install -g pnpm pm2
    
    # 2. Install System Dependencies
    apt-get update
    apt-get install -y ffmpeg
    
    # 2.1 Setup Swap (4GB) to prevent OOM
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    
    # 3. Setup Application Directory
    mkdir -p /home/ubuntu/apps/server
    chown -R ubuntu:ubuntu /home/ubuntu/apps
  EOF

  lifecycle {
    ignore_changes = [user_data]
  }
}

# 3. Networking & Security
resource "aws_lightsail_instance_public_ports" "server_ports" {
  instance_name = aws_lightsail_instance.server.name

  port_info {
    protocol   = "tcp"
    from_port  = 22
    to_port    = 22
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  port_info {
    protocol   = "tcp"
    from_port  = 8000
    to_port    = 8000
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }
}

# 4. Static IP
resource "aws_lightsail_static_ip" "server_ip" {
  name = "${var.project_name}-${var.environment}-static-ip"
}

resource "aws_lightsail_static_ip_attachment" "server_ip_attachment" {
  static_ip_name = aws_lightsail_static_ip.server_ip.name
  instance_name  = aws_lightsail_instance.server.name
}

# 5. Environment Variable Updates (Avoids Instance Replacement)
# This resource manages the .env file exclusively using the explicit var.env_vars map.
resource "terraform_data" "env_update" {
  triggers_replace = [
    aws_lightsail_instance.server.id,
    sha256(jsonencode(var.env_vars))
  ]

  connection {
    type        = "ssh"
    user        = "ubuntu"
    private_key = aws_lightsail_key_pair.server_key.private_key
    host        = aws_lightsail_static_ip.server_ip.ip_address
  }

  provisioner "file" {
    content     = join("\n", [for k, v in var.env_vars : "${k}=${v}"])
    destination = "/tmp/.env_update"
  }

  provisioner "remote-exec" {
    inline = [
      "echo '🚀 Environment variables updated, sync to server...'",
      "mkdir -p /home/ubuntu/apps/server",
      "mv -f /tmp/.env_update /home/ubuntu/apps/server/.env",
      "chown ubuntu:ubuntu /home/ubuntu/apps/server/.env",
      "if command -v pm2 > /dev/null && pm2 list | grep -q 'server'; then",
      "  echo '🔄 PM2: Restarting server with new env...'",
      "  pm2 restart /home/ubuntu/apps/server/ecosystem.config.cjs --update-env",
      "else",
      "  echo '⚠️ PM2: Server process not found, skipping restart.'",
      "fi",
      "echo '✅ Update complete!'"
    ]
  }

  depends_on = [aws_lightsail_static_ip_attachment.server_ip_attachment]
}
