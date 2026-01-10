# ===========================================
# Slop Studios 3 - Development Environment
# ===========================================

terraform {
  required_version = ">= 1.5.0"

  # Backend configuration for dev state
  # Uncomment and configure for your setup
  # backend "s3" {
  #   bucket         = "slopstudios3-terraform-state"
  #   key            = "dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "slopstudios3-terraform-locks"
  # }
}

# Use the root module
module "infrastructure" {
  source = "../../"

  environment     = "dev"
  aws_region      = "us-east-1"
  project_name    = "slopstudios3"
  domain_name     = "slopstudios.com"
  container_image = "ghcr.io/slopstudios/slopstudios3:develop"

  # Development-specific sizing
  desired_count = 1
  cpu           = 256
  memory        = 512
  min_capacity  = 1
  max_capacity  = 2

  # Database sizing for dev
  db_instance_class    = "db.t3.micro"
  db_allocated_storage = 20

  # Redis sizing for dev
  redis_node_type = "cache.t3.micro"

  # Cost savings for dev
  enable_deletion_protection = false
  enable_multi_az            = false
  single_nat_gateway         = true
  db_skip_final_snapshot     = true

  # Logging
  log_retention_days = 7

  tags = {
    CostCenter = "development"
  }
}

# ===========================================
# Outputs
# ===========================================

output "environment" {
  description = "Environment name"
  value       = module.infrastructure.environment
}

output "application_url" {
  description = "Application URL"
  value       = module.infrastructure.application_url
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.infrastructure.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.infrastructure.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.infrastructure.private_subnet_ids
}
