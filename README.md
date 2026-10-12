# Option 3: 1 EC2 Web ASG + 1 EC2 Dedicated DB Separated

Independent infrastructure and application source code for **Option 3: Multi-Tier Architecture with Auto Scaling Web EC2, Dedicated Database EC2, and AWS NAT Gateway**.

## 1. Architecture Overview
![Architecture](infra/architecture_diagram.png)

### Key Architectural Highlights:
- **CloudFront CDN Edge Caching:** Optimized caching for static assets (`/_next/static/*`, `/static/*`), offloading 80–90% of requests from origin servers, lowering TTFB, and accelerating global page load times.
- **Application Load Balancer (ALB):** Spans Multi-AZ Public Subnets, balancing HTTP/HTTPS traffic with health checking on `/api/health`.
- **AWS NAT Gateway:** Located in the Public Subnet with Elastic IP, allowing private web and database instances to safely access external resources and AWS APIs without exposing ports.
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
| **AWS NAT Gateway** | `AWS::EC2::NatGateway` | **$32.85** | Managed NAT Gateway in Public Subnet (0.0.0.0/0 egress) |
| **Application Load Balancer (ALB)** | `AWS::ElasticLoadBalancingV2::LoadBalancer` | **$16.43** | Multi-AZ load balancing and health checks |
| **Dedicated DB EC2 Server** | `AWS::EC2::Instance` (`t3.micro` + 30GB EBS) | **$10.49** | Isolated compute & persistent storage for PostgreSQL |
| **Web Compute (Auto Scaling Group)** | `AWS::AutoScaling::AutoScalingGroup` (`t3.micro`) | **$9.49** | Stateless web application compute tier |
| **Secrets & Operational Monitoring** | `SecretsManager`, `CloudWatch`, `SNS` | **$0.30** | Dual secrets (DB + App) and multi-tier alarms |
| **Total Monthly Cost** | `infra/modules/` | **$69.56 / mo** | ~1,760,000 VND / month |

*(Tiết kiệm **$69.35 / tháng** so với mô hình cũ sử dụng 7 VPC Interface Endpoints $102.20/tháng).*

### B. Cost by Purchasing Option & Commitment
| Purchasing Model | Web Compute | DB Compute + EBS | NAT Gateway & ALB | Total Monthly Cost | Approx. Local Currency (VND) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **On-Demand (Default)** | $9.49 | $10.49 | $49.58 | **$69.56 / mo** | ~1,760,000 VND |
| **1-Year Savings Plan / RI** | $5.98 | $6.98 | $49.58 | **$62.54 / mo** *(10% savings)* | ~1,580,000 VND |
| **3-Year Savings Plan / RI** | $3.79 | $4.79 | $49.58 | **$58.16 / mo** *(16% savings)* | ~1,470,000 VND |
| **Hybrid (Web Spot + DB 1-Yr RI)** | $2.84 | $6.98 | $49.58 | **$59.40 / mo** *(15% savings)* | ~1,500,000 VND |

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
