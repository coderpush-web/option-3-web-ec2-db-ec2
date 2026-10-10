# Option 3: 1 EC2 Web ASG + 1 EC2 Dedicated DB Separated

Independent infrastructure and application source code for **Option 3: Multi-Tier Architecture with Auto Scaling Web EC2 and Dedicated Database EC2**.

## 1. Directory Structure (File Structure)
```text
.
├── .github/workflows/ci-cd.yml   # CI/CD Pipeline (test code, lint CloudFormation, auto-deploy)
├── app/                          # Standalone web application (Next.js / Node.js)
├── docs/                         # Technical documentation (Deployment, Operations, Architecture)
├── infra/                        # AWS CloudFormation Infrastructure-as-Code
│   ├── cloudformation.yaml       # Consolidated CloudFormation template
│   ├── modules/                  # Modular templates (app.yaml, vpc-subnets.yaml, etc.)
│   ├── environments/             # Environment parameters for dev & prod
│   └── architecture_diagram.png  # Diagram-as-Code architecture diagram
├── test/                         # Automated tests (Unit test & API integration tests)
│   └── test_api.js
└── README.md                     # Technical report, cost matrix, and architectural summary
```

## 2. Multi-Dimension Cost Analysis

### A. Cost by Purchasing Option (Singapore Region: `ap-southeast-1`)
| Purchasing Model | Web Tier Compute | DB Tier Compute | Storage & IP | Total Monthly Cost | Approx. Local Currency (VND) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **On-Demand (Default)** | $15.18 / mo | $15.18 / mo | $11.25 / mo | **$41.61 / mo** | ~1,050,000 VND |
| **1-Year Reserved / Savings Plan** | $9.56 / mo | $9.56 / mo | $11.25 / mo | **$30.37 / mo** *(27% savings)* | ~765,000 VND |
| **3-Year Reserved / Savings Plan** | $6.06 / mo | $6.06 / mo | $11.25 / mo | **$23.37 / mo** *(44% savings)* | ~589,000 VND |
| **Hybrid (Web Spot + DB 1-Year RI)**| $4.53 / mo | $9.56 / mo | $11.25 / mo | **$25.34 / mo** *(39% savings)* | ~639,000 VND |

<!-- INFRACOST_START -->
### 💵 Automated CloudFormation Cost Scan (Infracost CI/CD Output)
*Scan timestamp: Sat Oct 10 09:55:00 UTC 2026*

```text
No costed resources detected.
```
<!-- INFRACOST_END -->

## 3. Architecture Overview
![Architecture](infra/architecture_diagram.png)

```mermaid
flowchart TD
    subgraph Client ["Client Access"]
        Users["Users / Browsers"]
        Domain["Custom Domain (opt3.png261.dev)"]
    end

    subgraph Edge ["Edge Layer"]
        CF["Amazon CloudFront CDN (Cache Static /_next/*)"]
    end

    subgraph AWS_VPC ["AWS VPC (ap-southeast-1)"]
        subgraph Public_Subnets ["Public Subnets (AZ1 & AZ2)"]
            ALB["Application Load Balancer (ALB)"]
            TG["Target Group (Healthcheck: /api/health)"]
        end

        subgraph Private_Subnets ["Private Subnets (AZ1 & AZ2)"]
            subgraph ASG ["Web Auto Scaling Group (Min: 1-2, Max: 4-6)"]
                EC2_1["Web Instance 1<br/>Docker Next.js (Port 80)"]
                EC2_2["Web Instance 2<br/>Docker Next.js (Port 80)"]
            end

            subgraph DB_Tier ["Database Tier (Private Subnet AZ1)"]
                DB_EC2["Dedicated EC2 Server<br/>MySQL 8.0 (Port 3306)"]
            end
        end
    end

    subgraph Management ["Observability & Deployment"]
        CW_Logs["CloudWatch LogGroup<br/>(14d Dev / 30d Prod)"]
        CW_Alarms["CloudWatch Alarms<br/>(ALB 5XX + Web CPU > 85% + DB CPU > 85%)"]
        SNS["SNS OpsAlertTopic"]
        Email["Ops Alert Email"]
        ECR["Amazon ECR Repository"]
        CI_CD["GitHub Actions CI/CD<br/>(Zero-Downtime Instance Refresh)"]
    end

    Users --> Domain --> CF
    CF -->|Dynamic requests| ALB
    ALB --> TG --> ASG
    ASG -->|SQL Queries (Port 3306)| DB_EC2
    ASG -.->|Logs| CW_Logs
    ASG -.->|Metrics| CW_Alarms
    DB_EC2 -.->|Metrics| CW_Alarms
    ALB -.->|Metrics| CW_Alarms
    CW_Alarms --> SNS --> Email
    CI_CD -->|Push Docker Image| ECR
    CI_CD -->|Trigger Instance Refresh| ASG
```

### Key Architectural Highlights:
- **CloudFront CDN Edge Caching:** Optimized caching for static assets (`/_next/static/*`, `/static/*`), offloading 80–90% of requests from origin servers, lowering TTFB, and accelerating global page load times.
- **Application Load Balancer (ALB):** Spans Multi-AZ Public Subnets, balancing HTTP/HTTPS traffic with health checking on `/api/health`.
- **Web Auto Scaling Group (ASG):** Resides securely within **Private Subnets (AZ1 & AZ2)**, automatically scaling EC2 instances based on CPU utilization (70% target tracking).
- **Dedicated MySQL/MariaDB EC2:** Located in a **Private Subnet**, protected by a dedicated Security Group that only permits inbound port 3306 traffic from the Web Security Group.
- **Zero-Downtime Rolling Update:** Integrated `aws autoscaling start-instance-refresh` in CI/CD updates web container versions without impacting the database tier or interrupting user service.
- **Multi-Tier Monitoring & Alerts:** CloudWatch Alarms (ALB 5XX, Web CPU, and DB CPU) notify via Amazon SNS Topic; log retention auto-expires after 14 days (Dev) / 30 days (Prod).
- **AWS-Native Custom Domain:** Directs user traffic via DNS CNAME (DNS-only) directly to Amazon CloudFront Edge & ALB endpoints.

## 📸 Application Screenshots (Live Environments: Dev & Prod)

| Development Environment (`opt3-dev.png261.dev`) | Production Environment (`opt3.png261.dev`) |
| :---: | :---: |
| ![Development Environment](screenshots/dev_screenshot.png) | ![Production Environment](screenshots/prod_screenshot.png) |

> 🚀 **Deployment Notes:**
> - **Development (`opt3-dev.png261.dev`):** Debug configuration, Web Auto Scaling Min 1 - Max 2 instances.
> - **Production (`opt3.png261.dev`):** Production optimized, Web Auto Scaling Min 2 - Max 6 instances, secured with AWS ACM SSL/HTTPS.

## ⚛️ Web Application & Docker / Amazon ECR Delivery

### 1. Web Application Architecture
- **Application:** Next.js Dashboard & Management Platform.
- **Frontend Stack:** React 18, Next.js App Router, Tailwind CSS, Lucide Icons.
- **Backend & API:** Node.js Next.js Server Components and REST routes.
- **Database:** Dedicated MariaDB 10.5 / MySQL running on an isolated EC2 server in a Private Subnet.

### 2. Separation of Build and Deployment (Build Once, Deploy Everywhere)
1. **Multi-Stage Docker Build:**
   - **Stage 1 (Builder):** Compiles Next.js frontend code and assets.
   - **Stage 2 (Runner):** Lightweight `node:20-alpine` base image containing only required production runtime files.
2. **Push to Amazon ECR:**
   - Image tagged by environment (`latest` for Prod, `dev-latest` for Dev) and pushed to **Amazon Elastic Container Registry (ECR)**.
3. **Decoupled Deployment:**
   - EC2 instances do not compile code on-box. They pull verified containers from ECR and manage service lifecycles via `systemd`.

## 4. CI/CD Workflow & Branching Strategy
- **`dev`**: Main development branch. Automatically runs unit tests, lints CloudFormation, and pushes dev container images.
- **`main`**: Protected production branch (**Branch Protection Rules** enforce PR reviews). Merging triggers automated production deployment and Web ASG rolling instance refresh.

## 🌐 Custom Domain Configuration (`png261.dev`)

The infrastructure routes traffic for `png261.dev` across both environments:

| Environment | Git Branch | Subdomain | Record Type | Target Destination | Proxy Status |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Development** | `dev` | `opt3-dev.png261.dev` | `CNAME` | `${CloudFrontDistribution.DomainName}` | DNS Only (☁️ Grey Cloud) |
| **Production** | `main` | `opt3.png261.dev` | `CNAME` | `${CloudFrontDistribution.DomainName}` | DNS Only (☁️ Grey Cloud) |

## ☁️ Native AWS CloudFormation Infrastructure Management (No State File)
The entire infrastructure is 100% managed with **AWS CloudFormation Native**:
- **AWS-Managed State:** Resource state is maintained internally by AWS CloudFormation.
- **Zero State File Overhead:** Eliminates state locking conflicts, accidental leaks, and S3/DynamoDB maintenance overhead.
- **Drift Detection:** Enables automated configuration drift detection directly from the AWS Console or AWS CLI.
