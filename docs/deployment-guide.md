# Deployment Guide - Option 3: Web ASG EC2 + Dedicated DB EC2

This guide walks you through deploying the two-tier AWS CloudFormation infrastructure and Next.js containerized application for **Option 3: 1 EC2 Web ASG + 1 EC2 Dedicated DB Separated**.

---

## 1. Prerequisites

Ensure your environment satisfies the following requirements:

- **AWS CLI v2**: Configured with credentials possessing administrative permissions across CloudFormation, EC2, VPC, ELBv2, Auto Scaling, CloudFront, ECR, SSM, and CloudWatch.
- **Docker Engine**: Docker 24.x+ or Docker Desktop.
- **Node.js**: Node.js 20.x LTS or higher.
- **Python 3**: Python 3.10+ (for configuration parameter processing).
- **cfn-lint** *(optional)*: For CloudFormation template linting (`pip install cfn-lint`).

---

## 2. Infrastructure Code Structure

All CloudFormation modules are organized under `infra/`:

```text
infra/
├── environments/
│   ├── dev.json             # Environment parameters for Development
│   └── prod.json            # Environment parameters for Production
└── modules/
    ├── vpc-subnets.yaml     # Module 1: VPC, IGW, Public Subnets (2 AZs), Private Subnets (2 AZs)
    ├── security-groups.yaml # Module 2: Security Groups (ALB, Web Tier, and DB Tier)
    ├── iam-roles.yaml       # Module 3: EC2 IAM Role & Instance Profile (SSM, ECR ReadOnly)
    └── app.yaml             # Module 4: ALB, Web ASG, Dedicated DB EC2, CloudFront
```

---

## 3. Environment Parameter Configuration

Configuration files are located in `infra/environments/dev.json` and `infra/environments/prod.json`.

| Parameter | Dev Value | Prod Value | Description |
| :--- | :--- | :--- | :--- |
| `EnvironmentName` | `dev` | `prod` | Prefix for resource naming and tagging |
| `InstanceType` | `t3.micro` | `t3.small` / `t3.medium` | EC2 instance sizing for Web ASG |
| `DBInstanceType` | `t3.micro` | `t3.medium` | EC2 instance sizing for Dedicated DB |
| `MinInstances` | `1` | `2` | Minimum Web instances in ASG |
| `MaxInstances` | `2` | `6` | Maximum Web instances in ASG |
| `DesiredInstances` | `1` | `2` | Initial Web instance target count |
| `WebVolumeSize` | `20` | `30` | Root EBS volume size for Web instances (GB) |
| `DBVolumeSize` | `20` | `50` | Dedicated EBS volume size for DB instance (GB) |
| `DBPassword` | *(secure)* | *(secure)* | Master password for MariaDB/MySQL database |
| `LogRetentionDays` | `14` | `30` | CloudWatch log retention period in days |

---

## 4. Automated Deployment via GitHub Actions (CI/CD)

The repository features a modular CI/CD pipeline split into 4 focused GitHub Actions workflows:
- `.github/workflows/ci-app.yml`: Application testing and validation (`test/test_api.js`).
- `.github/workflows/ci-infra.yml`: Infrastructure validation and linting (`cfn-lint`).
- `.github/workflows/build-ecr.yml`: Builds Docker container image and pushes to Amazon ECR.
- `.github/workflows/deploy.yml`: Deploys CloudFormation stacks and triggers instance refresh.

### Required GitHub Repository Secrets:
Add the following in **Settings** -> **Secrets and variables** -> **Actions**:
- `AWS_ACCESS_KEY_ID`: IAM user/role access key.
- `AWS_SECRET_ACCESS_KEY`: IAM user/role secret access key.
- `AWS_REGION`: AWS Region (default: `ap-southeast-1`).

### Automated Workflow Pipeline:
1. **Application Testing & CloudFormation Linting:**
   - Validates Next.js code and tests API endpoints.
   - Runs `cfn-lint` against all infrastructure templates.
2. **Container Delivery to Amazon ECR:**
   - Builds multi-stage Docker image for Next.js.
   - Pushes image with tag `dev-latest` (on `dev` branch) or `latest` (on `main` branch).
3. **Infrastructure Stacks Deployment:**
   - Triggers GitHub Actions CD (`deploy.yml`) on merge to `main`.
4. **Zero-Downtime Instance Refresh:**
   - Automatically executes `aws autoscaling start-instance-refresh` for `prod-opt3-asg`, updating web instances sequentially while keeping the database tier untouched.

---

## 5. Manual Deployment via AWS CLI

### Step 1: Build and Push Docker Image to ECR

```bash
# Configure environment variables
export AWS_REGION="ap-southeast-1"
export ENV="dev" # or prod
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REPO_NAME="${ENV}-option-3-web-app"
export IMAGE_TAG="dev-latest" # or latest for prod

# Create ECR repository if it does not exist
aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$AWS_REGION" 2>/dev/null || \
aws ecr create-repository --repository-name "$REPO_NAME" --region "$AWS_REGION"

# Log in to ECR
aws ecr get-login-password --region "$AWS_REGION" | \
docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Build and push container image
cd app
docker build -t "$REPO_NAME:$IMAGE_TAG" .
docker tag "$REPO_NAME:$IMAGE_TAG" "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}"
docker push "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}"
cd ..
```

### Step 2: Run Deployment Script

```bash
cd infra
chmod +x deploy.sh

# Deploy to Development
./deploy.sh dev dev-latest

# Deploy to Production
./deploy.sh prod latest
```

The script provisions:
1. `${ENV}-network`: Provisions VPC and Multi-AZ subnets.
2. `${ENV}-security-groups`: Creates ALB SG, Web SG, and DB SG (allowing port 3306 only from Web SG).
3. `${ENV}-iam`: Configures EC2 Instance Profile.
4. `${ENV}-app`: Provisions the Dedicated DB EC2 server, initializes MariaDB, launches the Web Auto Scaling Group, ALB, and CloudFront.
5. Initiates ASG instance refresh for rolling updates.

---

## 6. Custom Domain & DNS Mapping

Obtain the CloudFront domain name from the stack output:

```bash
aws cloudformation describe-stacks \
  --stack-name dev-app \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomain'].OutputValue" \
  --output text
```

In your DNS provider:
- **Record Type:** `CNAME`
- **Host:** `opt3-dev` (or `opt3` for Prod)
- **Target:** `<distribution-id>.cloudfront.net`
- **Proxy Status:** **DNS Only (Grey Cloud ☁️)**

---

## 7. Infrastructure Teardown & Resource Cleanup

To delete all resources and stop billing:

```bash
ENV="dev" # or prod

aws cloudformation delete-stack --stack-name "${ENV}-app"
aws cloudformation wait stack-delete-complete --stack-name "${ENV}-app"

aws cloudformation delete-stack --stack-name "${ENV}-iam"
aws cloudformation wait stack-delete-complete --stack-name "${ENV}-iam"

aws cloudformation delete-stack --stack-name "${ENV}-security-groups"
aws cloudformation wait stack-delete-complete --stack-name "${ENV}-security-groups"

aws cloudformation delete-stack --stack-name "${ENV}-network"
aws cloudformation wait stack-delete-complete --stack-name "${ENV}-network"

echo "✅ Teardown complete for environment: $ENV"
```