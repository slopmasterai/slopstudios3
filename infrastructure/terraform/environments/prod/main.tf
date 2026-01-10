# ===========================================
# Slop Studios 3 - Production Environment
# ===========================================

terraform {
  required_version = ">= 1.5.0"

  # Backend configuration for production state
  # Uncomment and configure for your setup
  # backend "s3" {
  #   bucket         = "slopstudios3-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "slopstudios3-terraform-locks"
  # }
}

# Use the root module
module "infrastructure" {
  source = "../../"

  environment     = "prod"
  aws_region      = "us-east-1"
  project_name    = "slopstudios3"
  domain_name     = "slopstudios.com"
  container_image = "ghcr.io/slopstudios/slopstudios3:latest"

  # Production sizing
  desired_count = 3
  cpu           = 1024
  memory        = 2048
  min_capacity  = 2
  max_capacity  = 10

  # Database sizing for production
  db_instance_class    = "db.t3.medium"
  db_allocated_storage = 100

  # Redis sizing for production
  redis_node_type = "cache.t3.medium"

  # Production protections
  enable_deletion_protection = true
  enable_multi_az            = true
  single_nat_gateway         = false
  db_skip_final_snapshot     = false

  # Extended backup retention
  db_backup_retention_period = 30
  redis_snapshot_retention_limit = 7

  # Logging
  log_retention_days = 90

  # Enhanced monitoring
  enable_enhanced_monitoring = true
  monitoring_interval        = 30

  tags = {
    CostCenter = "production"
    Compliance = "required"
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
