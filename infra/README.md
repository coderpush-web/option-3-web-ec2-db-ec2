# Infrastructure Modules - option-3-web-ec2-db-ec2

This directory contains standalone AWS CloudFormation modules supporting both **Development (`dev`)** and **Production (`prod`)** environments.

## 1. Module Structure
- `modules/vpc-subnets.yaml`: Provisions VPC, Internet Gateway, 2 Public Subnets (ALB), and 2 Private Subnets (Web ASG and Dedicated DB EC2).
- `modules/security-groups.yaml`: Manages Security Groups for ALB, Web Tier, and Database Tier (inbound port 3306 restricted strictly to Web SG).
- `modules/iam-roles.yaml`: Configures EC2 IAM Instance Profile with AWS SSM Session Manager and Amazon ECR ReadOnly access.
- `modules/app.yaml`: Provisions two-tier compute resources (Web Launch Template, Web Auto Scaling Group, Dedicated DB EC2 with MariaDB, ALB, CloudFront Distribution).

## 2. Environment Configuration
- `environments/dev.json`: Cost-optimized parameters for Development (t3.micro for Web & DB).
- `environments/prod.json`: High-availability & performance configuration for Production (t3.small/medium for Web, t3.medium for DB, 50GB storage).

## 3. Deployment Commands
```bash
# Deploy to Development:
./deploy.sh dev

# Deploy to Production:
./deploy.sh prod
```
