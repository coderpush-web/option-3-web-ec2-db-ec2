# Operations & Usage Guide - Option 3: Web ASG EC2 + Dedicated DB EC2

This guide covers local application development, two-tier network management, database administration, remote host access, and troubleshooting for **Option 3: Web ASG EC2 + Dedicated DB EC2**.

---

## 1. Local Application Development

### Development Environment Setup:
```bash
cd app

# 1. Install Node.js packages
npm install

# 2. Start development server
npm run dev
```

Visit `http://localhost:3000` to preview the Next.js application.

### Key Endpoints:
- `/`: Main dashboard overview with revenue and invoice statistics.
- `/dashboard/invoices`: Invoice table, filtering, status badges, and invoice creation.
- `/dashboard/customers`: Customer listing and contact information.
- `/api/health`: Health probe used by ALB Target Group (`200 OK`).

### Running Tests:
```bash
node test/test_api.js
```

---

## 2. Dedicated Database Operations (MariaDB / MySQL on EC2)

In Option 3, the database runs on a dedicated EC2 instance located in a Private Subnet.

### Database Credentials & Access Details:
- **Port:** `3306`
- **Default Database:** `appdb`
- **Application User:** `appuser`
- **Password:** Defined in `environments/dev.json` or `prod.json` (`DBPassword`)
- **Internal Host:** Private IP address of the `${EnvironmentName}-db-server` instance.

### Connecting to the Database Server via AWS Systems Manager:
```bash
# 1. Find the DB Instance ID
DB_INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=dev-db-server" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text)

# 2. Open an SSM session to the DB host
aws ssm start-session --target "$DB_INSTANCE_ID"

# 3. Log in to MariaDB/MySQL locally on the host
mysql -u root
# or
mysql -u appuser -p appdb
```

### Performing Database Backups (`mysqldump`):
```bash
# Execute within the DB instance SSM shell:
mysqldump -u appuser -p'YourPassword' appdb > /tmp/appdb_backup_$(date +%F).sql

# Verify backup size
ls -lh /tmp/appdb_backup_*.sql
```

---

## 3. Remote Web Tier Administration via AWS Systems Manager

Because the Web EC2 instances are in Private Subnets behind an ALB, they have no public IP addresses.

### Connect to a Web Instance:
```bash
# 1. List healthy instances in the Web Auto Scaling Group
aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=dev-opt3-asg" "Name=instance-state-name,Values=running" \
  --query "Reservations[*].Instances[*].[InstanceId,PrivateIpAddress,State.Name]" \
  --output table

# 2. Start SSM Session to a specific Web instance
aws ssm start-session --target <WEB_INSTANCE_ID>
```

### Common Commands on Web Instance:
```bash
# Check Docker container status
sudo docker ps

# View container runtime logs
sudo docker logs -f $(sudo docker ps -q)

# Test connectivity from Web to DB instance on port 3306
nc -zv <DB_PRIVATE_IP> 3306
```

---

## 4. Monitoring & Observability

### A. Centralized CloudWatch Logs
- **Log Group:** `/aws/ec2/dev-opt3` (or `/aws/ec2/prod-opt3`)
- **Retention Period:** 14 days (Dev) / 30 days (Prod)

Stream logs from terminal:
```bash
aws logs tail /aws/ec2/dev-opt3 --follow --format short
```

### B. Multi-Tier CloudWatch Alarms
Option 3 provides alarms across both compute and database tiers:
1. **ALB 5XX Errors Alarm:** Triggers when ALB 5XX error responses exceed 10 per minute.
2. **Web CPU Utilization Alarm:** Triggers when ASG average CPU utilization exceeds 85% for 5 minutes.
3. **DB CPU Utilization Alarm:** Triggers when the dedicated DB EC2 CPU utilization exceeds 85% for 5 minutes.

All alarms publish directly to the **Amazon SNS Topic** (`${EnvironmentName}-ops-alerts`), which sends email notifications to the operations team.

---

## 5. Troubleshooting & Frequently Encountered Issues

### Issue 1: Web Application Cannot Connect to Database (`ECONNREFUSED` or Timeout)
- **Cause:** Security Group mismatch, MariaDB service stopped, or bind address issue.
- **Remediation:**
  1. Verify the DB Security Group allows inbound port 3306 from the Web Security Group.
  2. Start an SSM session to the DB instance and verify service state: `sudo systemctl status mariadb`.
  3. Ensure MariaDB binds to all interfaces: check `/etc/my.cnf.d/mariadb-server.cnf` has `bind-address = 0.0.0.0`.

### Issue 2: Web ASG Instance Refresh Fails or Hangs
- **Cause:** New instances fail ALB target group health checks on `/api/health`.
- **Remediation:**
  1. Inspect the instance refresh status:
     ```bash
     aws autoscaling describe-instance-refreshes --auto-scaling-group-name dev-opt3-asg
     ```
  2. Connect to the failing instance via SSM and examine `/var/log/cloud-init-output.log` and `docker logs`.

### Issue 3: High Database Storage Usage
- **Cause:** Accumulation of binary logs or large transaction logs.
- **Remediation:**
  1. Check disk utilization: `df -h`.
  2. In MySQL/MariaDB: `PURGE BINARY LOGS BEFORE NOW() - INTERVAL 7 DAY;`.
  3. If storage resize is necessary, update `DBVolumeSize` in `environments/prod.json` and redeploy CloudFormation.
