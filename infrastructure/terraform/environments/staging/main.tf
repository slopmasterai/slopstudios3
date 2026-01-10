# ===========================================
# Slop Studios 3 - Staging Environment
# ===========================================

terraform {
  required_version = ">= 1.5.0"

  # Backend configuration for staging state
  # Uncomment and configure for your setup
  # backend "s3" {
  #   bucket         = "slopstudios3-terraform-state"
  #   key            = "staging/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "slopstudios3-terraform-locks"
  # }
}

# Use the root module
module "infrastructure" {
  source = "../../"

  environment     = "staging"
  aws_region      = "us-east-1"
  project_name    = "slopstudios3"
  domain_name     = "slopstudios.com"
  container_image = "ghcr.io/slopstudios/slopstudios3:develop"

  # Staging sizing (closer to production)
  desired_count = 2
  cpu           = 512
  memory        = 1024
  min_capacity  = 1
  max_capacity  = 4

  # Database sizing for staging
  db_instance_class    = "db.t3.small"
  db_allocated_storage = 50

  # Redis sizing for staging
  redis_node_type = "cache.t3.small"

  # Enable some protection
  enable_deletion_protection = false
  enable_multi_az            = false
  single_nat_gateway         = true
  db_skip_final_snapshot     = true

  # Logging
  log_retention_days = 14

  tags = {
    CostCenter = "staging"
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
