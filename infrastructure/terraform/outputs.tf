# ===========================================
# Slop Studios 3 - Terraform Outputs
# ===========================================
# These outputs are available after terraform apply
# Note: VPC outputs are defined in main.tf alongside the module invocation

# ===========================================
# ECS Outputs
# ===========================================

# Uncomment when ECS module is implemented
# output "ecs_cluster_name" {
#   description = "ECS cluster name"
#   value       = module.ecs.cluster_name
# }

# output "ecs_cluster_arn" {
#   description = "ECS cluster ARN"
#   value       = module.ecs.cluster_arn
# }

# output "ecs_service_name" {
#   description = "ECS service name"
#   value       = module.ecs.service_name
# }

# ===========================================
# Load Balancer Outputs
# ===========================================

# Uncomment when ALB module is implemented
# output "alb_dns_name" {
#   description = "ALB DNS name"
#   value       = module.alb.dns_name
# }

# output "alb_zone_id" {
#   description = "ALB zone ID"
#   value       = module.alb.zone_id
# }

# output "alb_arn" {
#   description = "ALB ARN"
#   value       = module.alb.arn
# }

# ===========================================
# Database Outputs
# ===========================================

# Uncomment when RDS module is implemented
# output "rds_endpoint" {
#   description = "RDS endpoint"
#   value       = module.rds.endpoint
#   sensitive   = true
# }

# output "rds_port" {
#   description = "RDS port"
#   value       = module.rds.port
# }

# output "rds_database_name" {
#   description = "RDS database name"
#   value       = module.rds.database_name
# }

# ===========================================
# Redis Outputs
# ===========================================

# Uncomment when ElastiCache module is implemented
# output "redis_endpoint" {
#   description = "Redis primary endpoint"
#   value       = module.redis.primary_endpoint
#   sensitive   = true
# }

# output "redis_port" {
#   description = "Redis port"
#   value       = module.redis.port
# }

# ===========================================
# CloudWatch Outputs
# ===========================================

# Uncomment when CloudWatch module is implemented
# output "log_group_name" {
#   description = "CloudWatch log group name"
#   value       = module.cloudwatch.log_group_name
# }

# output "log_group_arn" {
#   description = "CloudWatch log group ARN"
#   value       = module.cloudwatch.log_group_arn
# }

# ===========================================
# Secrets Manager Outputs
# ===========================================

# Uncomment when secrets module is implemented
# output "db_credentials_secret_arn" {
#   description = "ARN of the database credentials secret"
#   value       = module.secrets.db_credentials_arn
# }

# ===========================================
# Application URL
# ===========================================

output "application_url" {
  description = "Application URL"
  value       = var.environment == "prod" ? "https://${var.domain_name}" : "https://${var.environment}.${var.domain_name}"
}
