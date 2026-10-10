# AGENTS.md — Option 3: Hosting 1 Web on EC2 + 1 DB on Single Dedicated EC2

## 1. Project Overview
This repository implements **Option 3**: A decoupled 2-Tier web architecture consisting of **one stateless Web EC2 instance** and **one dedicated Database EC2 instance** running native PostgreSQL 16, isolated across distinct private network subnets.

This architecture is optimized for workloads requiring dedicated compute and memory isolation between the application and database tiers without incurring the overhead of managed database services.

---

## 2. Repository Layout
```
option-3-web-ec2-db-ec2/
├── app/                          # Next.js 14 application codebase
│   ├── app/                      # Application routes and API handlers
│   ├── Dockerfile                # Multi-stage container build
│   └── package.json              # Dependencies and scripts
├── infra/
│   ├── environments/             # Environment configs (dev.json, prod.json)
│   └── modules/                  # CloudFormation templates
│       ├── vpc-subnets.yaml      # 3-Tier VPC (Public, App Private, DB Private)
│       ├── security-groups.yaml  # ALB SG, Web SG, and Database SG definitions
│       └── app.yaml              # Web ASG, Dedicated DB EC2, persistent EBS, ALB
├── .github/workflows/            # CI/CD pipelines (OIDC deployment, ECR build, lint)
├── .husky/ & .githooks/          # Quality gates: commit-msg, pre-commit, pre-push
├── test/test_api.js              # Automated Node.js API and healthcheck tests
└── AGENTS.md                     # Agent guide for Option 3
```

---

## 3. Essential Commands

### Build & Run
- **Install Dependencies:** `npm install` (root) or `cd app && npm install`
- **Build Web Container:** `docker build -t nextjs-app:latest app/`
- **Run Application Locally:** `cd app && npm run dev`

### Validation & Quality Gates
- **Run Automated Tests:**
  ```bash
  node test/test_api.js
  ```
- **Lint CloudFormation Templates:**
  ```bash
  cfn-lint infra/modules/*.yaml
  ```
- **Scan IaC Security (Checkov):**
  ```bash
  checkov --config-file .checkov.yaml
  ```
- **Scan for Secrets (GitLeaks):**
  ```bash
  gitleaks protect --staged --verbose
  ```
- **Run All Pre-Commit Checks:**
  ```bash
  ./.husky/pre-commit
  ```

---

## 4. Architecture Requirements to Create

### 4.1. Compute & Tier Separation
- **Web Tier:** 1x EC2 instance (`t4g.small` Graviton ARM) in the **App Private Subnet**, managed by an Auto Scaling Group (capacity `1/1/1`) behind an ALB.
- **Database Tier:** 1x dedicated EC2 instance (`t4g.small` or `t4g.medium`) in the **DB Private Subnet**, running native PostgreSQL 16.
- **OS & Kernel Tuning:** Native PostgreSQL 16 configured with tuned memory parameters (`shared_buffers`, `work_mem`, `effective_cache_size`).
- **Management Access:** Both instances managed strictly via **AWS Systems Manager (SSM) Session Manager**. Inbound SSH (Port 22) must NOT be opened.

### 4.2. 3-Tier Network & Security Isolation
- **Subnet Segmentation:**
  - **Tier 1 (Public Subnets):** Application Load Balancer (ALB).
  - **Tier 2 (App Private Subnets):** Web EC2 instances.
  - **Tier 3 (Database Private Subnets):** Dedicated DB EC2 instance (strictly isolated, no internet access).
- **Security Group Chain:**
  - `ALBSecurityGroup`: Ingress port 80/443 from CloudFront/Internet.
  - `WebSecurityGroup`: Ingress port 80 strictly from `ALBSecurityGroup`.
  - `DatabaseSecurityGroup`: Ingress port 5432 **exclusively from `WebSecurityGroup`**. All direct external access is blocked.

### 4.3. Storage & Backup Layer
- **Dedicated Persistent Storage:** Dedicated Amazon EBS gp3 SSD volume (50GB) attached to the DB EC2 instance and mounted at `/data/postgresql`.
- **Automated Backup Strategy:**
  - AWS Backup Vault with daily automated snapshot rule at 02:00 AM UTC and 14-day retention.
  - PostgreSQL WAL archival or `pg_dump` backups pushed to Amazon S3.

### 4.4. Edge & Load Balancing Layer
- **Amazon CloudFront:** Global CDN, TLS termination with ACM, static asset caching, and injection of custom header `X-CloudFront-Origin-Verify`.
- **Application Load Balancer (ALB):** Evaluates header `X-CloudFront-Origin-Verify`. Direct traffic bypassing CloudFront receives `HTTP 403 Forbidden`.

---

## 5. Operational Boundaries & Guardrails

### 🛑 Never Do
- **Never Expose Port 5432 to Public or ALB:** Database port 5432 must ONLY accept traffic from `WebSecurityGroup`.
- **Never Open Port 22:** Inbound SSH from `0.0.0.0/0` is strictly forbidden.
- **Never Use Static AWS Keys:** GitHub Actions must authenticate solely via AWS IAM OIDC (`secrets.AWS_ROLE_TO_ASSUME`).

### ⚠️ Ask First
- Modifying PostgreSQL configuration parameters (`postgresql.conf`, `pg_hba.conf`).
- Resizing DB EBS volume or altering AWS Backup retention schedules.

### ✅ Always Do
- Follow Conventional Commits format (`type(scope): message`).
- Verify that `test/test_api.js`, `cfn-lint`, `checkov`, and `gitleaks` pass before pushing.

---

## 6. Technical Conventions & Standards
- **Decoupled Deployment:** Deploying new web application versions must update only the Web EC2 tier via SSM rolling updates without downtime or interference to the DB EC2 instance.
- **Security Groups:** All ingress rules must contain explicit `Description` fields.
- **Configuration Storage:** Database connection parameters must be fetched dynamically from AWS SSM Parameter Store (`/app/prod/database_url`).

---

## 7. Definition of Done (Verification Checklist)
Before completing any task in this repository, verify:
1. [ ] `cfn-lint infra/modules/*.yaml` exits with code 0.
2. [ ] `checkov --config-file .checkov.yaml` runs cleanly.
3. [ ] `gitleaks protect --staged --verbose` finds 0 secrets.
4. [ ] `node test/test_api.js` passes all tests.
5. [ ] Workflows contain zero static AWS keys (`! grep -rn --exclude="ci-infra.yml" "AWS_ACCESS_KEY_ID" .github/workflows/`).
6. [ ] Commit message conforms to Conventional Commits hook.
