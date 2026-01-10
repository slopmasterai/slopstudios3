# Slop Studios 3 - Infrastructure as Code

This directory contains Terraform configurations for deploying Slop Studios 3
infrastructure to AWS.

## Directory Structure

```
terraform/
├── main.tf                 # Root module configuration
├── variables.tf            # Variable definitions
├── outputs.tf              # Output definitions
├── versions.tf             # Provider version constraints
├── environments/           # Environment-specific configurations
│   ├── dev/               # Development environment
│   ├── staging/           # Staging environment
│   └── prod/              # Production environment
└── modules/               # Reusable Terraform modules
    └── vpc/               # VPC module
```

## Prerequisites

1. **Terraform** >= 1.5.0
2. **AWS CLI** configured with appropriate credentials
3. **S3 bucket** for remote state (optional but recommended)
4. **DynamoDB table** for state locking (optional but recommended)

## Quick Start

### 1. Install Terraform

```bash
# macOS
brew install terraform

# Linux (Ubuntu/Debian)
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

### 2. Configure AWS Credentials

```bash
# Using environment variables
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"

# Or using AWS CLI
aws configure
```

### 3. Initialize Terraform

```bash
# Navigate to environment directory
cd environments/dev

# Initialize Terraform
terraform init
```

### 4. Create Variables File

```bash
# Copy the example file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars
```

### 5. Plan and Apply

```bash
# Preview changes
terraform plan

# Apply changes
terraform apply
```

## Environments

### Development (`dev`)

- Minimal resources for cost savings
- Single NAT Gateway
- No deletion protection
- 7-day log retention

### Staging (`staging`)

- Closer to production configuration
- Used for pre-production testing
- 14-day log retention

### Production (`prod`)

- High availability (Multi-AZ)
- Deletion protection enabled
- Extended backup retention
- Enhanced monitoring
- 90-day log retention

## Remote State Configuration

For team collaboration, configure remote state storage:

1. Create S3 bucket for state:

```bash
aws s3 mb s3://slopstudios3-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket slopstudios3-terraform-state --versioning-configuration Status=Enabled
```

2. Create DynamoDB table for locking:

```bash
aws dynamodb create-table \
  --table-name slopstudios3-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

3. Uncomment the backend configuration in `main.tf`

## Resources Created

| Resource        | Description                                       |
| --------------- | ------------------------------------------------- |
| VPC             | Virtual Private Cloud with public/private subnets |
| ECS Cluster     | Fargate cluster for running containers            |
| ALB             | Application Load Balancer                         |
| RDS             | PostgreSQL database                               |
| ElastiCache     | Redis cache cluster                               |
| CloudWatch      | Log groups and alarms                             |
| Secrets Manager | Secure credential storage                         |

## Variables

Key variables that can be customized:

| Variable          | Description                   | Default     |
| ----------------- | ----------------------------- | ----------- |
| `environment`     | Environment name              | Required    |
| `aws_region`      | AWS region                    | `us-east-1` |
| `container_image` | Docker image to deploy        | Required    |
| `desired_count`   | Number of container instances | `2`         |
| `cpu`             | Fargate CPU units             | `256`       |
| `memory`          | Fargate memory (MB)           | `512`       |

See `variables.tf` for complete list.

## Common Operations

### Viewing Current State

```bash
terraform show
```

### Destroying Infrastructure

```bash
# Preview destruction
terraform plan -destroy

# Destroy (use with caution!)
terraform destroy
```

### Importing Existing Resources

```bash
terraform import aws_instance.example i-1234567890abcdef0
```

### Refreshing State

```bash
terraform refresh
```

## Security Best Practices

1. **Never commit `terraform.tfvars`** - Contains sensitive values
2. **Use remote state** with encryption enabled
3. **Enable state locking** to prevent concurrent modifications
4. **Use AWS Secrets Manager** for sensitive data
5. **Apply least privilege** IAM policies
6. **Enable deletion protection** in production

## Troubleshooting

### State Lock Issues

```bash
# Force unlock (use with caution!)
terraform force-unlock LOCK_ID
```

### Provider Version Conflicts

```bash
# Upgrade providers
terraform init -upgrade
```

### Resource Already Exists

```bash
# Import existing resource
terraform import RESOURCE_ADDRESS RESOURCE_ID
```

## Contributing

1. Make changes in a feature branch
2. Run `terraform fmt` to format code
3. Run `terraform validate` to check syntax
4. Create a PR with plan output

## References

- [Terraform Documentation](https://www.terraform.io/docs)
- [AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)
