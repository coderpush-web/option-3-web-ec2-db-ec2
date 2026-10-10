# Comprehensive Security, Architectural & Production Readiness Audit
## Architecture Option 3: Multi-Tier Web EC2 Auto Scaling Group with Dedicated PostgreSQL 16 on EC2
**Repository:** `option-3-web-ec2-db-ec2`  
**Evaluation Date:** 2026-10-10  
**Audit Standard:** AWS Well-Architected Framework (Security, Reliability, Operational Excellence) & CWE/CVSS v3.1  
**Status:** Action Required Prior to Production Deployment  

---

## 1. Executive Summary

This document presents a comprehensive, production-grade security, architectural, and reliability assessment of **Option 3 (`option-3-web-ec2-db-ec2`)**.

Option 3 implements a **decoupled multi-tier cloud architecture** featuring a horizontally auto-scaling Next.js 14 web application tier deployed across Multi-AZ Private Subnets behind an internet-facing Application Load Balancer (ALB) and CloudFront CDN, communicating with a dedicated self-managed PostgreSQL 16 database server hosted on an EC2 instance in Private Subnet 1.

### Key Assessment Findings
1. **Critical In-Transit Encryption Deficiency (Cleartext Database Traffic):** The self-managed PostgreSQL instance on EC2 is configured **without SSL/TLS encryption**. UserData configures `listen_addresses = '*'` and `host all all 0.0.0.0/0 md5` in `pg_hba.conf` without generating TLS certificates or enabling `ssl = on`. All database queries, user records, and application traffic traverse the VPC network unencrypted. Furthermore, obsolete `md5` password hashing is used instead of modern `scram-sha-256`.
2. **Database Schema & Migration Blind Spot (Day-1 Production Outage):** The repository lacks any database migration framework (no Prisma, Drizzle, Flyway, or migration runner). Database table creation logic is confined exclusively to `/app/app/seed/route.ts`, which explicitly blocks execution in production (`NODE_ENV === 'production' -> 403 Forbidden`). Consequently, a clean production deployment launches an empty database with **zero tables**, while application queries catch errors and silently serve mock data, concealing a critical system failure.
3. **Hardcoded Fallbacks & Authentication Bypass Backdoor:** Source code contains hardcoded fallback credentials (`postgres://postgres:postgres@127.0.0.1:5432/postgres` in `db.ts`) and a built-in authentication bypass backdoor (`user@nextmail.com` / `123456` in `placeholder-data.ts` and `auth.ts`) validating unauthenticated logins when the database is empty or offline.
4. **Architectural Coupling & Single Point of Failure (SPOF):** The Web LaunchTemplate UserData directly embeds the private IP of the database instance (`!GetAtt DBServerInstance.PrivateIp`) at CloudFormation deployment time. If the database EC2 instance fails or is replaced, its private IP changes, permanently severing database connectivity for all web instances. The database tier lacks automated failover, replication, and automated EBS snapshot policies.
5. **Secret Exposure in Bootstrap Execution:** PostgreSQL user creation in EC2 UserData executes passwords via command-line arguments (`psql -c "CREATE USER ... WITH PASSWORD '$DB_PASS'"`), leaking sensitive database credentials into process tables (`/proc/<pid>/cmdline`) and `/var/log/cloud-init-output.log`.
6. **Stale Documentation & Template Defects:** CloudFormation module descriptions and operational documentation copy-pasted from MySQL stacks repeatedly refer to MariaDB and MySQL, including recommending `mysqldump` instead of `pg_dump`.

---

## 2. Architectural Context & Component Topology

### 2.1 Component Architecture Diagram

```
                                      [ Internet Clients ]
                                                │
                                                │ HTTPS (Port 443)
                                                ▼
                           ┌─────────────────────────────────────────┐
                           │      Amazon CloudFront CDN Edge         │
                           │   - ViewerProtocolPolicy: redirect-to-https
                           │   - X-CloudFront-Origin-Verify Header   │
                           │   - Cache /_next/static/* & /static/*   │
                           └────────────────────┬────────────────────┘
                                                │
                                                │ HTTP (Port 80)
                                                ▼
┌────────────────────────────────── AWS Virtual Private Cloud (VPC: 10.0.0.0/16) ──────────────────────────────────┐
│                                                                                                                  │
│  ┌────────────────────── Public Subnet 1 (10.0.1.0/24) ──┐  ┌────────────────────── Public Subnet 2 (10.0.2.0/24) ──┐  │
│  │                                                       │  │                                                       │  │
│  │               ┌───────────────────────────────────────┴──┴───────────────────────────────────────┐               │  │
│  │               │              Internet-Facing Application Load Balancer (ALB)                     │               │  │
│  │               │  - Port 80 Listener (Redirects to 443 if Cert; 403 Forbidden without Header)     │               │  │
│  │               │  - Port 443 Listener (Validates Origin Header -> Forwards to ALBTargetGroup)     │               │  │
│  │               └───────────────────────────────────────┬──────────────────────────────────────────┘               │  │
│  └───────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┘  │
│                                                          │ Forward Port 80 (WebSecurityGroup)                           │
│                                                          ▼                                                              │
│  ┌───────────────────── Private Subnet 1 (10.0.10.0/24) ─────────────────────────────────────────────────────────┐  │
│  │                                                                                                                │  │
│  │   ┌──────────────────────────────────────────────────┐   ┌──────────────────────────────────────────────────┐  │  │
│  │   │        Auto Scaling Group Web Instance 1         │   │        Auto Scaling Group Web Instance 2         │  │  │
│  │   │  - AL2023 EC2 (t3.micro dev / t3.small prod)     │   │  - AL2023 EC2 (t3.micro dev / t3.small prod)     │  │  │
│  │   │  - Docker Container: `react-webapp` (Port 80)    │   │  - Docker Container: `react-webapp` (Port 80)    │  │  │
│  │   │  - Next.js 14 App Router (Node 20 Alpine)        │   │  - Next.js 14 App Router (Node 20 Alpine)        │  │  │
│  │   │  - Env: `/etc/react-webapp.env` (Missing AuthKey)│   │  - Env: `/etc/react-webapp.env` (Missing AuthKey)│  │  │
│  │   └────────────────────────┬─────────────────────────┘   └────────────────────────┬─────────────────────────┘  │  │
│  │                            │                                                      │                            │  │
│  │                            │ Unencrypted Cleartext TCP (Port 5432)                │                            │  │
│  │                            │ [CRITICAL SECURITY DEFECT: No SSL/TLS, md5 Auth]     │                            │  │
│  │                            └──────────────────────────┬───────────────────────────┘                            │  │
│  │                                                       │                                                        │  │
│  │                                                       ▼                                                        │  │
│  │   ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │  │
│  │   │               Dedicated Database EC2 Instance: `dev-db-server` (t3.micro dev / t3.small prod)          │   │  │
│  │   │  - PostgreSQL 16.x daemon on Amazon Linux 2023                                                         │   │  │
│  │   │  - Static Private IP coupled into Web LaunchTemplate [ARCHITECTURAL COUPLING DEFECT]                   │   │  │
│  │   │  - Insecure pg_hba.conf: `host all all 0.0.0.0/0 md5` (listen_addresses = '*')                         │   │  │
│  │   │  - Single EBS GP3 Volume: 30GB dev / 50GB prod (Encrypted, DeleteOnTermination: false)                 │   │  │
│  │   │  - [AVAILABILITY GAP]: Single Point of Failure (SPOF); No Multi-AZ, No automated snapshots             │   │  │
│  │   │  - [SCHEMA GAP]: Database launches with ZERO tables (seed disabled in production, no migrations)       │   │  │
│  │   └────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                                                                │  │
│  │   ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │  │
│  │   │ VPC Interface Endpoints: `ecr.api`, `ecr.dkr`, `s3`, `logs`, `secretsmanager`, `ssm`, `ssmmessages`    │   │  │
│  │   └────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component & Resource Inventory

| Logical Resource | CloudFormation Type | Physical Architecture & Configuration | Purpose & Status |
| :--- | :--- | :--- | :--- |
| `DBServerInstance` | `AWS::EC2::Instance` | Standalone EC2 in `PrivateSubnet1`, PostgreSQL 16 | Dedicated database server (SPOF) |
| `DBSecret` | `AWS::SecretsManager::Secret` | `${EnvironmentName}-ec2-postgres-credentials` | DB Master credentials generator |
| `WebLaunchTemplate` | `AWS::EC2::LaunchTemplate` | AL2023, IMDSv2 required, binds `DBPrivateIp` | Web tier compute specification |
| `WebAutoScalingGroup` | `AWS::AutoScaling::AutoScalingGroup` | Min: 1 (dev) / 2 (prod), Max: 2 (dev) / 6 (prod) | Web tier elasticity & rolling updates |
| `ApplicationLoadBalancer` | `AWS::ElasticLoadBalancingV2::LoadBalancer` | Internet-facing ALB in Public Subnets 1 & 2 | Ingress controller |
| `ALBTargetGroup` | `AWS::ElasticLoadBalancingV2::TargetGroup` | Target: ASG port 80, Health: `/api/health` | Web instance routing pool |
| `CloudFrontDistribution` | `AWS::CloudFront::Distribution` | CDN distribution, PriceClass 200 | Edge caching and SSL offloading |
| `ALBSecurityGroup` | `AWS::EC2::SecurityGroup` | Ports 80 & 443 inbound from `0.0.0.0/0` | Ingress filtering |
| `WebSecurityGroup` | `AWS::EC2::SecurityGroup` | Port 80 restricted to `ALBSecurityGroup` | Web instance security group |
| `DatabaseSecurityGroup` | `AWS::EC2::SecurityGroup` | Port 5432 restricted to `WebSecurityGroup` | Database tier network boundary |
| `EC2SSMRole` | `AWS::IAM::Role` | SSM, ECR, CloudWatch, SecretsManager read | Shared host IAM profile |

---

## 3. Comprehensive Security Findings & Vulnerability Matrix

| Finding ID | Severity | CVSS v3.1 | CWE ID | Affected Files & Lines | Short Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | 8.6 | CWE-798 | `app/app/lib/db.ts:4–7` | Insecure hardcoded fallback connection string with plaintext credentials |
| **SEC-02** | **CRITICAL** | 8.5 | CWE-319 / CWE-326 | `infra/modules/app.yaml:146–154, 333` | EC2 PostgreSQL runs completely unencrypted over TCP with obsolete `md5` |
| **SEC-03** | **HIGH** | 7.7 | CWE-287 / CWE-798 | `app/app/lib/placeholder-data.ts:3–10`<br>`app/auth.ts:20–28` | Authentication bypass backdoor validating mock credentials on DB failure |
| **SEC-04** | **HIGH** | 7.5 | CWE-312 / CWE-330 | `infra/modules/app.yaml:330–341`<br>`app/auth.ts:35` | Missing `AUTH_SECRET` container injection breaking session encryption |
| **SEC-05** | **HIGH** | 7.3 | CWE-214 / CWE-532 | `infra/modules/app.yaml:152` | PostgreSQL credentials leaked in process table & `cloud-init-output.log` |
| **SEC-06** | **HIGH** | 7.2 | CWE-657 / CWE-404 | Architecture / `app/app/seed/route.ts` | Zero schema migrations; production DB has no tables, silently serving mocks |
| **SEC-07** | **MEDIUM** | 5.3 | CWE-476 | `app/app/seed/route.ts:5`<br>`app/app/query/route.ts:3` | Non-null assertion on missing env variable triggers unhandled module crash |
| **SEC-08** | **MEDIUM** | 4.8 | CWE-330 | `infra/modules/app.yaml:240, 273, 439` | Predictable ALB origin verification header derived from AWS Account ID |
| **SEC-09** | **MEDIUM** | 4.3 | CWE-1188 | Repository Root / `app/` | Absence of `.env.example` template for configuration contracts |
| **SEC-10** | **LOW** | 3.3 | CWE-1059 | `infra/modules/app.yaml:2, 589`<br>`docs/operations-guide.md:66` | Copy-paste documentation defects referring to MariaDB, MySQL, `mysqldump` |

---

### Deep-Dive Analysis of Vulnerabilities

#### Finding SEC-01: Hardcoded Insecure Fallback Database Connection String
- **Severity:** **CRITICAL** (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N — Score: 8.6)
- **CWE:** CWE-798 (Use of Hard-coded Credentials), CWE-259 (Use of Hard-coded Password)
- **Affected Location:** `option-3-web-ec2-db-ec2/app/app/lib/db.ts`, Lines 4–7:
  ```typescript
  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@127.0.0.1:5432/postgres';
  ```
- **Technical Description:** If environment variables are omitted or unset, the application falls back to an unauthenticated localhost connection with default credentials (`postgres:postgres`).
- **Remediation:** Remove the fallback string entirely. If `POSTGRES_URL` or `DATABASE_URL` is absent, throw a descriptive configuration error during startup.

---

#### Finding SEC-02: EC2 PostgreSQL Operates Without SSL/TLS & Uses Obsolete `md5`
- **Severity:** **CRITICAL** (CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N — Score: 8.5)
- **CWE:** CWE-319 (Cleartext Transmission of Sensitive Information), CWE-326 (Inadequate Encryption Strength)
- **Affected Locations:**
  - `infra/modules/app.yaml`, Lines 146–154:
    ```bash
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /var/lib/pgsql/data/postgresql.conf || true
    echo "host all all 0.0.0.0/0 md5" >> /var/lib/pgsql/data/pg_hba.conf
    ```
  - `infra/modules/app.yaml`, Line 333:
    ```bash
    POSTGRES_URL=postgres://$DB_USER:$DB_PASS@${DBPrivateIp}:5432/appdb
    ```
  - `app/app/lib/db.ts`, Lines 12–14:
    ```typescript
    ssl: connectionString.includes('sslmode=require') ? 'require' : false,
    ```
- **Technical Description:**
  1. The DB EC2 UserData bootstrap script never enables `ssl = on` in `postgresql.conf`, never generates TLS certificates (`server.crt`, `server.key`), and configures `host all all 0.0.0.0/0 md5` in `pg_hba.conf`.
  2. The Web UserData script configures `POSTGRES_URL` without `?sslmode=require`.
  3. `app/app/lib/db.ts` sets `ssl: false`.
  4. All database queries, user records, password hashes, and financial invoice data are transmitted across the AWS VPC in cleartext.
  5. Furthermore, `md5` password authentication is obsolete and vulnerable to collision and pass-the-hash attacks; PostgreSQL 16 standard requires `scram-sha-256`.
  6. **Configuration Collision:** In `app/app/seed/route.ts:5` and `app/app/query/route.ts:3`, the code hardcodes `{ ssl: 'require' }`. If invoked against this EC2 database, the connection is aborted with `The server does not support SSL connections`.
- **Security Impact:** Man-in-the-middle sniffing of database credentials and customer records within the VPC; regulatory failure (PCI-DSS, HIPAA, SOC 2).
- **Remediation:**
  1. In DB UserData, generate TLS certificates, set `ssl = on` in `postgresql.conf`, and configure `hostssl all all 0.0.0.0/0 scram-sha-256` in `pg_hba.conf`.
  2. Append `?sslmode=require` to `POSTGRES_URL` and `DATABASE_URL` in Web UserData.
  3. Set `ssl: 'require'` in `app/app/lib/db.ts`.

---

#### Finding SEC-03: Hardcoded Plaintext User Credentials with Auth Bypass Backdoor
- **Severity:** **HIGH** (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:L/A:N — Score: 7.7)
- **CWE:** CWE-287 (Improper Authentication), CWE-798 (Use of Hard-coded Credentials)
- **Affected Locations:**
  - `app/app/lib/placeholder-data.ts`, Lines 3–10 (`user@nextmail.com` / `123456`)
  - `app/auth.ts`, Lines 20–28:
    ```typescript
    const found = placeholderUsers.find((u) => u.email === email);
    if (found) {
      return {
        id: found.id,
        name: found.name,
        email: found.email,
        password: await bcrypt.hash(found.password, 10),
      };
    }
    ```
- **Technical Description:** In Option 3, clean production deployments have an empty database. When `getUser(email)` queries the database and finds no matching record or errors out, execution falls back to `placeholderUsers`. Any user supplying `user@nextmail.com` and `123456` is granted full administrative access.
- **Security Impact:** Built-in backdoor account allowing unauthenticated administrative login.
- **Remediation:** Remove fallback lines 20–28 in `app/auth.ts`. Return `null` if user is not in database.

---

#### Finding SEC-04: Missing `AUTH_SECRET` Container Injection
- **Severity:** **HIGH** (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N — Score: 7.5)
- **CWE:** CWE-312 (Cleartext Storage of Sensitive Information), CWE-330 (Use of Insufficiently Random Values)
- **Affected Locations:**
  - `infra/modules/app.yaml`, Lines 330–341.
  - `app/auth.ts`, Line 35: `secret: process.env.AUTH_SECRET`.
- **Technical Description:** UserData writes database credentials into `/etc/react-webapp.env` but omits `AUTH_SECRET`. In production, NextAuth throws `MissingSecret` on sign-in attempts.
- **Remediation:** Create an `AWS::SecretsManager::Secret` for `${EnvironmentName}-web-auth-secret` (32-byte hex string) and write `AUTH_SECRET` into `/etc/react-webapp.env`.

---

#### Finding SEC-05: Database Password Leakage in CLI Execution and Log Files
- **Severity:** **HIGH** (CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N — Score: 7.3)
- **CWE:** CWE-214 (Invocation of Process Using Visible Sensitive Information), CWE-532 (Insertion of Sensitive Information into Log File)
- **Affected Location:** `infra/modules/app.yaml`, Line 152:
  ```bash
  sudo -u postgres psql -c "CREATE USER \"$DB_USER\" WITH PASSWORD '$DB_PASS';" || true
  ```
- **Technical Description:** Executing SQL statements with plaintext passwords via `-c` flags exposes `$DB_PASS` in the Linux process table (`ps aux` / `/proc/<pid>/cmdline`) to any local user or monitoring process. Furthermore, cloud-init logs the entire command line to `/var/log/cloud-init-output.log` with read permissions accessible to standard users.
- **Remediation:** Pass SQL commands via `stdin` or utilize environment variables (`PGPASSWORD`) and ensure `/var/log/cloud-init-output.log` is secured (`chmod 600`).

---

#### Finding SEC-06: Production Outage on Launch (Zero Tables, Disabled Seed, No Migrations)
- **Severity:** **HIGH** (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H — Score: 7.2)
- **CWE:** CWE-657 (Violation of Secure Design Principles), CWE-404 (Improper Resource Shutdown or Release)
- **Affected Locations:** `app/app/seed/route.ts:105–110`, `app/app/lib/data.ts:18, 40`.
- **Technical Description:**
  1. The repository provides no schema migration tool (no Prisma, Drizzle, Flyway, Knex, or raw SQL script).
  2. Table definitions exist only in `/api/seed`, which returns `403 Forbidden` in production.
  3. Consequently, upon initial deployment, the EC2 PostgreSQL database contains zero tables.
  4. All queries fail. However, `app/app/lib/data.ts` catches database errors and serves mock data, concealing the complete absence of a database from operators.
  5. Any mutation (e.g. creating an invoice) throws an unhandled database error.
- **Remediation:** Implement an automated migration runner executing during deployment or EC2 boot that idempotently creates tables and constraints before starting the web application.

---

#### Finding SEC-07: Non-Null Assertion Crash Risk on Seed and Query Routes
- **Severity:** **MEDIUM** (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:M — Score: 5.3)
- **CWE:** CWE-476 (NULL Pointer Dereference)
- **Affected Locations:** `app/app/seed/route.ts:5`, `app/app/query/route.ts:3`.
- **Technical Description:** `postgres(process.env.POSTGRES_URL!, ...)` crashes route module loading if `POSTGRES_URL` is undefined.
- **Remediation:** Remove top-level client instantiation or validate configuration prior to invocation.

---

#### Finding SEC-08: Predictable ALB Origin Verification Header
- **Severity:** **MEDIUM** (CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N — Score: 4.8)
- **CWE:** CWE-330 (Use of Insufficiently Random Values)
- **Affected Locations:** `infra/modules/app.yaml`, Lines 240, 273, 439.
- **Technical Description:** Deterministic header `${EnvironmentName}-secure-origin-${AWS::AccountId}` allows origin bypass if Account ID is known.
- **Remediation:** Store high-entropy secret in AWS Secrets Manager.

---

#### Finding SEC-09: Missing `.env.example` Template
- **Severity:** **MEDIUM** (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N — Score: 4.3)
- **CWE:** CWE-1188 (Insecure Default Initialization of Resource)
- **Affected Location:** Repository Root and `app/`.
- **Technical Description:** Lacks `.env.example` documenting `AUTH_SECRET`, `POSTGRES_URL`, `DATABASE_URL`, `APP_ENV`, `PORT`.
- **Remediation:** Create `app/.env.example`.

---

#### Finding SEC-10: Documentation & Metadata Defects Referencing MySQL / MariaDB
- **Severity:** **LOW** (CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N — Score: 3.3)
- **CWE:** CWE-1059 (Incomplete Documentation)
- **Affected Locations:**
  - `infra/modules/app.yaml:2`: `Description: '... Dedicated Single EC2 MariaDB'`.
  - `infra/modules/app.yaml:589`: `Description: AWS Secrets Manager ARN for EC2 MariaDB Credentials`.
  - `docs/operations-guide.md:66`: Lists `mysqldump` command instead of `pg_dump`.
  - `docs/deployment-guide.md:51`: References `DBPassword for MariaDB/MySQL`.
- **Technical Description:** Inconsistent copy-pasted documentation creates operational confusion during maintenance and disaster recovery procedures.
- **Remediation:** Update all documentation and CFN metadata to explicitly specify PostgreSQL 16.

---

## 4. Infrastructure Security & AWS Well-Architected Review

### 4.1 Architectural Coupling & Single Point of Failure (SPOF)
- **Static Private IP Coupling:**
  In `infra/modules/app.yaml`, line 333:
  `DBPrivateIp: !GetAtt DBServerInstance.PrivateIp`
  The Web LaunchTemplate statically embeds the DB instance's private IP. If the DB EC2 instance is replaced (due to hardware failure, reboot, or template update), its private IP changes, immediately breaking database access across all ASG web instances without an automatic update mechanism.
- **Single Point of Failure:**
  The database EC2 instance has:
  - No Multi-AZ standby replica.
  - No automated failover mechanism.
  - No automated AWS Backup plan or point-in-time recovery (PITR).
  - An outage in `PrivateSubnet1` causes total system failure.

### 4.2 IAM Roles & Instance Profiles (`infra/modules/iam-roles.yaml`)
- **Shared IAM Identity Defect:**
  Both Web EC2 instances and the DB EC2 instance share the same IAM role (`EC2SSMRole`).
  The DB instance has access to web application secrets, violating the principle of least privilege.
- **Broad Wildcard Secret Permissions:**
  ```yaml
  Resource: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${EnvironmentName}-*'
  ```
  The policy grants access to all secrets matching the environment prefix without scoping to specific credential types.
- **Missing KMS & Parameter Store Actions:**
  Lacks `kms:Decrypt` for Customer Managed Keys and `ssm:GetParameter*` for Parameter Store.

### 4.3 Storage & Transit Cryptography
- **EBS Storage:** Both Web and DB EC2 instances have `Encrypted: true` on GP3 root volumes. However, default AWS managed keys (`aws/ebs`) are used rather than Customer Managed KMS Keys (CMK) with automated rotation.
- **CloudFront to ALB Transit:** CloudFront `CustomOriginConfig` specifies `OriginProtocolPolicy: http-only` on port 80, transmitting edge-to-origin traffic unencrypted.

### 4.4 Monitoring & Observability
- **Existing Alarms:**
  - `ALB5XXAlarm`: Triggers on `HTTPCode_Target_5XX_Count > 10`.
  - `HighCPUAlarm`: Triggers on Web ASG `CPUUtilization > 85%`.
  - `DBHighCPUAlarm`: Triggers on DB EC2 `CPUUtilization > 85%`.
- **Missing Alarms:**
  - Database Disk Space Utilization (`DiskSpaceUtilization > 85%`). A full disk will halt the PostgreSQL transaction log and corrupt transactions.
  - Database Memory Exhaustion (`MemoryUtilization > 85%`).
  - ALB Target Response Time and Unhealthy Host Count.

---

## 5. Application Security & Code Quality Review

### 5.1 Build Configuration & TypeScript Masking (`app/next.config.js`)
- `next.config.js` sets `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }`.
- **Remediation:** Remove build error suppression and ensure `npm run build` passes cleanly.

### 5.2 Automated Testing Gaps (`test/test_api.js`)
- Trivial assertion `1 + 1 === 2`. Lacks database connectivity tests, SSL flag verification, and schema validation.

### 5.3 Health Check Shallow Probe (`app/app/api/health/route.ts`)
- Returns HTTP 200 without testing PostgreSQL connectivity. If PostgreSQL crashes, `/api/health` continues returning HTTP 200, misleading the load balancer into routing traffic to the instance.

---

## 6. Architecture-Specific Deep Dive: Self-Managed PostgreSQL on EC2

Operating a production database on Amazon EC2 requires managing aspects handled automatically by managed services (e.g. RDS):

1. **SSL/TLS Setup via UserData:**
   To establish encrypted communication, DB UserData must:
   ```bash
   # Generate self-signed TLS cert and private key
   openssl req -new -x509 -days 3650 -nodes -text \
     -out /var/lib/pgsql/data/server.crt \
     -keyout /var/lib/pgsql/data/server.key \
     -subj "/CN=db.internal"
   chmod 600 /var/lib/pgsql/data/server.key
   chown postgres:postgres /var/lib/pgsql/data/server.*

   # Configure postgresql.conf
   cat << EOF >> /var/lib/pgsql/data/postgresql.conf
   ssl = on
   ssl_cert_file = 'server.crt'
   ssl_key_file = 'server.key'
   password_encryption = scram-sha-256
   EOF

   # Configure pg_hba.conf for mandatory SSL and scram-sha-256
   echo "hostssl all all 0.0.0.0/0 scram-sha-256" >> /var/lib/pgsql/data/pg_hba.conf
   ```
2. **Dynamic Service Discovery via Route 53 Private Hosted Zone:**
   To eliminate static private IP coupling, provision a Route 53 Private Hosted Zone (`internal.local`) with a record `db.internal.local` pointing to the DB instance, allowing dynamic IP updates without rebuilding Web LaunchTemplates.
3. **Automated Migration Runner:**
   Package a lightweight SQL migration script (`migrate.sql`) executed during container startup or instance bootstrap:
   ```bash
   PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d appdb -f /app/migrations/001_initial_schema.sql
   ```

---

## 7. Actionable Step-by-Step Remediation Roadmap

### Phase 1: Critical Security & Secret Management (Immediate)
1. **Eradicate Fallback PostgreSQL String:** Remove `'postgres://postgres:postgres@...'` from `db.ts`.
2. **Remove Authentication Backdoor:** Delete lines 20–28 in `app/auth.ts`.
3. **Dynamic NextAuth Secret:**
   - Add `AWS::SecretsManager::Secret` for `${EnvironmentName}-web-auth-secret`.
   - Update IAM policies and inject `AUTH_SECRET` into `/etc/react-webapp.env`.
4. **Create `.env.example`:** Document `AUTH_SECRET`, `POSTGRES_URL`, `DATABASE_URL`, `APP_ENV`, `PORT`.

### Phase 2: Enforce Database SSL/TLS & Authentication (High Priority)
1. **Configure PostgreSQL SSL in DB UserData:**
   Generate TLS certificates, enable `ssl = on`, and enforce `hostssl all all 0.0.0.0/0 scram-sha-256` in `pg_hba.conf`.
2. **Append `?sslmode=require` in Web UserData:**
   Ensure connection strings include `?sslmode=require`.
3. **Update Database Client:**
   Ensure `app/app/lib/db.ts` connects with `ssl: 'require'`.

### Phase 3: Database Schema Migration & Service Discovery (Medium Priority)
1. **Automated Database Schema Migration:**
   Provide migration script initializing `users`, `invoices`, `customers`, and `revenue` tables during deployment.
2. **Decouple DB IP Coupling:**
   Implement Route 53 Private DNS or ensure LaunchTemplate refreshes dynamically upon DB instance replacement.
3. **Correct MySQL / MariaDB Metadata:**
   Replace all references to MariaDB/MySQL in `app.yaml`, `README.md`, and operations guides with PostgreSQL 16.

### Phase 4: Code Quality & Observability (Low Priority)
1. **Enforce Strict TypeScript Compilation:**
   Remove `ignoreBuildErrors: true` from `next.config.js`.
2. **Deep Health Check:**
   Update `/api/health` to execute `SELECT 1` against PostgreSQL, returning HTTP 503 if unreachable.
3. **CloudWatch Alarms:**
   Add alarms for DB disk utilization and ALB target response time.

---

## 8. AWS Well-Architected Framework Compliance Scorecard

| Pillar | Rating | Baseline Findings | Target Status Post-Remediation |
| :--- | :---: | :--- | :--- |
| **Security** | **FAIL** | Unencrypted PostgreSQL traffic on port 5432, `md5` password auth, hardcoded fallback in `db.ts`, auth backdoor in `auth.ts`, credentials in CLI arguments. | **PASS**: Mandatory SSL/TLS (`hostssl`), `scram-sha-256`, Secrets Manager dynamic retrieval, zero hardcoded credentials. |
| **Reliability** | **FAIL** | Single EC2 DB SPOF, static private IP coupling in LaunchTemplate, zero schema migrations causing day-1 production empty DB outage. | **PASS**: Automated schema migrations, resilient service discovery, automated EBS backup plan. |
| **Performance Efficiency** | **PASS** | Dedicated EC2 compute for database provides consistent I/O and CPU performance; client connection pooling configured (`max: 10`). | **PASS**: High-performance multi-tier architecture. |
| **Cost Optimization** | **PASS** | Avoids managed RDS premium fees; leverages GP3 EBS volumes and burstable EC2 instances. | **PASS**: Low-cost multi-tier deployment. |
| **Operational Excellence** | **FAIL** | Stale MariaDB/MySQL documentation; suppressed TypeScript build errors; no automated database migration pipeline. | **PASS**: Accurate PostgreSQL documentation, strict `tsc` compilation, automated schema initialization. |

---

## 9. Verification & Audit Attestation

This audit was conducted by inspecting CloudFormation templates (`infra/modules/*.yaml`), application source code (`app/**/*`), container definitions (`app/Dockerfile`), and pipeline workflows (`.github/workflows/*.yml`) in repository `option-3-web-ec2-db-ec2`.

**Verification Command References:**
- CloudFormation Linting: `cfn-lint infra/modules/*.yaml`
- TypeScript Static Verification: `cd app && npx tsc --noEmit`
- Clean Production Build: `cd app && npm run build`
- Zero-Secret Grep Validation: `grep -rn "postgres://postgres:" .`
