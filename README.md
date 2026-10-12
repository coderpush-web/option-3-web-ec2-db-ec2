# Option 3: 1 EC2 Web ASG + 1 EC2 Dedicated DB Separated

Independent infrastructure and application source code for **Option 3: Multi-Tier Architecture with Auto Scaling Web EC2 and Dedicated Database EC2**.

## 1. Architecture Overview
![Architecture](infra/architecture_diagram.png)

### Key Architectural Highlights:
- **CloudFront CDN Edge Caching:** Optimized caching for static assets (`/_next/static/*`, `/static/*`), offloading 80–90% of requests from origin servers, lowering TTFB, and accelerating global page load times.
- **Application Load Balancer (ALB):** Spans Multi-AZ Public Subnets, balancing HTTP/HTTPS traffic with health checking on `/api/health`.
- **Web Auto Scaling Group (ASG):** Resides securely within **Private Subnets (AZ1 & AZ2)**, automatically scaling EC2 instances based on CPU utilization (70% target tracking).
- **Dedicated PostgreSQL 16 EC2:** Located in a **Private Subnet**, protected by a dedicated Security Group that only permits inbound port 5432 traffic from the Web Security Group.
- **Zero-Downtime Rolling Update:** Integrated `aws autoscaling start-instance-refresh` in CI/CD updates web container versions without impacting the database tier or interrupting user service.
- **Multi-Tier Monitoring & Alerts:** CloudWatch Alarms (ALB 5XX, Web CPU, and DB CPU) notify via Amazon SNS Topic; log retention auto-expires after 14 days (Dev) / 30 days (Prod).
- **AWS-Native Custom Domain:** Directs user traffic via DNS CNAME (DNS-only) directly to Amazon CloudFront Edge & ALB endpoints.

## 2. Cost Analysis

> 💡 **Verified via Infracost CLI:** Cost calculations derived directly from CloudFormation templates using `infracost scan ./infra/modules`.

### A. Component Cost Breakdown (Infracost CLI Verified)
| CloudFormation Module / Component | AWS Resource Type | Monthly Cost (USD) | Notes |
| :--- | :--- | :--- | :--- |
| **Application Load Balancer (ALB)** | `AWS::ElasticLoadBalancingV2::LoadBalancer` | **$16.43** | Multi-AZ load balancing and health checks |
| **Dedicated DB EC2 Server** | `AWS::EC2::Instance` (`t3.micro` + 30GB EBS) | **$10.49** | Isolated compute & persistent storage for PostgreSQL |
| **Web Compute (Auto Scaling Group)** | `AWS::AutoScaling::AutoScalingGroup` (`t3.micro`) | **$9.49** | Stateless web application compute |
| **Secrets & Operational Monitoring** | `SecretsManager`, `CloudWatch`, `SNS` | **$0.30** | Dual secrets (DB + App) and multi-tier alarms |
| **Subtotal (Decoupled 2-Tier Application)** | `infra/modules/app.yaml` | **$36.71 / mo** | ~930,000 VND / month |
| **Private VPC Interface Endpoints (Optional)** | `AWS::EC2::VPCEndpoint` (7 endpoints) | **$102.20** | SSM, ECR, CloudWatch Logs in Private Subnets |
| **Total (Full Enterprise Isolated Architecture)** | `infra/modules/` | **$138.91 / mo** | ~3,515,000 VND / month |

### B. Cost by Purchasing Option & Architecture Mode
| Purchasing Model / Mode | Web Compute | DB Compute + EBS | ALB & Support | Total (Lean Mode)* | Total (Full Isolated) | Approx. Local Currency (Lean) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **On-Demand (Default)** | $9.49 | $10.49 | $16.73 | **$36.71 / mo** | **$138.91 / mo** | ~930,000 VND |
| **1-Year Savings Plan / RI** | $5.98 | $6.98 | $16.73 | **$29.69 / mo** *(19% off)* | **$131.89 / mo** | ~752,000 VND |
| **3-Year Savings Plan / RI** | $3.79 | $4.79 | $16.73 | **$25.31 / mo** *(31% off)* | **$127.51 / mo** | ~641,000 VND |
| **Hybrid (Web Spot + DB 1-Yr RI)** | $2.84 | $6.98 | $16.73 | **$26.55 / mo** *(28% off)* | **$128.75 / mo** | ~673,000 VND |

*\*Lean Mode: Compute + ALB + CloudFront routing without dedicated VPC Interface Endpoints ($102.20/mo).*

## 3. Disaster Recovery & Recovery Time (MTTR)

Tested and verified under real AWS Chaos Engineering scenarios:

| Failure Scenario | Recovery Mechanism | Measured Recovery Time (MTTR) | Fault Isolation / Impact |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Service Outage on DB EC2** | Service restart + Driver auto-reconnect | **11 seconds** | Web tier completely isolated (0s downtime on Web) |
| **Web ↔ DB Network Partition (SG Severed)** | Security Group Ingress re-authorization | **3 seconds** | Fast connection pool recovery |
| **Web EC2 Instance Termination** | Web ASG auto-replacement in Private Subnets | **140 seconds** | DB server completely unaffected |
| **Target Response Latency** | CloudWatch ALB Metrics | **8.8ms average** | Independent tier compute isolation |

## 4. Application Screenshots

| Development Environment (`opt3-dev.png261.dev`) | Production Environment (`opt3.png261.dev`) |
| :---: | :---: |
| ![Development Environment](docs/screenshots/dev_screenshot.png) | ![Production Environment](docs/screenshots/prod_screenshot.png) |
