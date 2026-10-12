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

### A. Cost by Purchasing Option (Singapore Region: `ap-southeast-1`)
| Purchasing Model | Web Tier Compute | DB Tier Compute | Storage & IP | Total Monthly Cost | Approx. Local Currency (VND) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **On-Demand (Default)** | $15.18 / mo | $15.18 / mo | $11.25 / mo | **$41.61 / mo** | ~1,050,000 VND |
| **1-Year Reserved / Savings Plan** | $9.56 / mo | $9.56 / mo | $11.25 / mo | **$30.37 / mo** *(27% savings)* | ~765,000 VND |
| **3-Year Reserved / Savings Plan** | $6.06 / mo | $6.06 / mo | $11.25 / mo | **$23.37 / mo** *(44% savings)* | ~589,000 VND |
| **Hybrid (Web Spot + DB 1-Year RI)**| $4.53 / mo | $9.56 / mo | $11.25 / mo | **$25.34 / mo** *(39% savings)* | ~639,000 VND |

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
