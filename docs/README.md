# Technical Documentation - Option 3: Web ASG EC2 + Dedicated DB EC2

Welcome to the technical documentation for **Option 3: Multi-Tier Architecture with Auto Scaling Web EC2 and Dedicated Database EC2**.

This `docs/` folder contains end-to-end guidance for infrastructure deployment, two-tier architecture operations, database maintenance, and troubleshooting.

---

## 📚 Documentation Index

1. [Deployment Guide](./deployment-guide.md)
   - Prerequisites & Required Tools
   - Environment Configuration (`dev.json` & `prod.json`)
   - CI/CD Automated Deployment via GitHub Actions
   - Manual Deployment via AWS CLI & CloudFormation
   - Custom Domain & DNS Mapping (`png261.dev`)
   - Zero-Downtime Rolling Update (Web ASG Instance Refresh)
   - Teardown & Resource Cleanup

2. [Operations & Usage Guide](./operations-guide.md)
   - Local Development & Testing (`npm run dev`, API tests)
   - Two-Tier Networking & Inter-Tier Security Rules
   - Dedicated Database Administration (PostgreSQL 16 on EC2)
   - Database Backups & pg_dump Operations
   - Remote Instance Management via AWS Systems Manager (SSM)
   - Monitoring & Observability (Web & DB CloudWatch Alarms)
   - Troubleshooting & Frequently Encountered Issues

---

## 🏛️ Architecture Overview

Option 3 decouples the application into two distinct, isolated tiers within an AWS Virtual Private Cloud (VPC):

```
[Users / Browsers]
        │
        ▼ (HTTPS / DNS CNAME)
[Amazon CloudFront CDN] ────── (Edge Caching for /_next/static/*)
        │ (Forward Dynamic Requests)
        ▼
[Application Load Balancer (ALB)] ── (Public Subnets AZ1 & AZ2)
        │
        ▼ (Port 80 / Target Group Health Check: /api/health)
[Web Auto Scaling Group (ASG)] ───── (Private Subnets AZ1 & AZ2)
        ├── Web EC2 Instance 1 (Docker Next.js)
        └── Web EC2 Instance 2 (Docker Next.js)
                │
                ▼ (SQL Queries: Port 5432)
[Dedicated Database EC2 Server] ─── (Private Subnet AZ1)
        └── PostgreSQL 16 Engine (Port 5432, Encrypted EBS)
```

### Key Architectural Highlights:
- **Separation of Concerns:** Separates stateless Web compute from stateful Database compute, preventing web traffic spikes from degrading database performance.
- **Strict Tier-to-Tier Security:** The Database EC2 instance has NO public IP address and accepts inbound traffic on port 5432 exclusively from the Web Security Group.
- **Horizontal Scaling for Web:** Web instances scale automatically based on CPU utilization (70% target tracking) across two Availability Zones.
- **Amazon CloudFront CDN:** Offloads static content delivery globally, minimizing unnecessary traffic to the Web ASG and database.
- **Zero-Downtime Instance Refresh:** Seamlessly deploys new container versions across the Web ASG with zero user disruption.

---

## ⚡ Quick Start

### 1. Run the Web Application Locally
```bash
cd app
npm install
npm run dev
# Open http://localhost:3000 in your browser
```

### 2. Deploy Infrastructure to Development Environment
```bash
cd infra
Deploy via GitHub Actions (workflow_dispatch) or directly via AWS CLI
```
