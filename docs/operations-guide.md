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

## 2. Dedicated Database Operations (PostgreSQL 16 on EC2)

In Option 3, the database runs on a dedicated EC2 instance located in a Private Subnet running PostgreSQL 16.

### Database Credentials & Access Details:
- **Port:** `5432`
- **Default Database:** `appdb`
- **Application User:** `appuser`
- **Password:** Managed in AWS Secrets Manager (`${EnvironmentName}-ec2-postgres-credentials`)
- **Internal Host:** Private IP address of the `${EnvironmentName}-db-server` instance.
- **Service Name:** `postgresql` (PostgreSQL 16 on Amazon Linux 2023)
- **Data Directory:** `/var/lib/pgsql/data`

### Connecting to the Database Server via AWS Systems Manager:
```bash
# 1. Find the DB Instance ID
DB_INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=dev-db-server" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text)

# 2. Open an SSM session to the DB host
aws ssm start-session --target "$DB_INSTANCE_ID"

# 3. Log in to PostgreSQL locally on the host
sudo -u postgres psql -d appdb
# or authenticate as the application user:
psql -h 127.0.0.1 -p 5432 -U appuser -d appdb
```

### Performing Database Backups (`pg_dump`):
```bash
# Execute within the DB instance SSM shell:
# 1. Create a logical backup in custom compressed format (recommended):
pg_dump -h 127.0.0.1 -p 5432 -U appuser -d appdb -F c -b -v -f /tmp/appdb_backup_$(date +%F).dump

# 2. Alternatively, create a plain-text SQL backup:
pg_dump -h 127.0.0.1 -p 5432 -U appuser -d appdb --clean --if-exists > /tmp/appdb_backup_$(date +%F).sql

# 3. Verify backup size
ls -lh /tmp/appdb_backup_*
```

### Restoring Database from Backup (`pg_restore` / `psql`):
```bash
# 1. Restore from custom compressed format dump:
pg_restore -h 127.0.0.1 -p 5432 -U appuser -d appdb -v --clean --if-exists /tmp/appdb_backup_YYYY-MM-DD.dump

# 2. Restore from plain-text SQL file:
psql -h 127.0.0.1 -p 5432 -U appuser -d appdb -f /tmp/appdb_backup_YYYY-MM-DD.sql
```

### Routine PostgreSQL 16 Maintenance & Service Management:
```bash
# 1. Check PostgreSQL service status
sudo systemctl status postgresql

# 2. Reload configuration (after postgresql.conf or pg_hba.conf edits)
sudo systemctl reload postgresql

# 3. Restart PostgreSQL service
sudo systemctl restart postgresql

# 4. Routine database vacuuming and statistics update
vacuumdb -h 127.0.0.1 -p 5432 -U appuser -d appdb --analyze --verbose

# 5. Check active client connections
sudo -u postgres psql -d appdb -c "SELECT pid, usename, client_addr, state, query FROM pg_stat_activity WHERE datname = 'appdb';"
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

# Test connectivity from Web to DB instance on port 5432
nc -zv <DB_PRIVATE_IP> 5432
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
- **Cause:** Security Group mismatch, PostgreSQL service stopped, or listen address issue.
- **Remediation:**
  1. Verify the DB Security Group allows inbound port 5432 from the Web Security Group.
  2. Start an SSM session to the DB instance and verify service state: `sudo systemctl status postgresql`.
  3. Ensure PostgreSQL listens on all interfaces: check `/var/lib/pgsql/data/postgresql.conf` has `listen_addresses = '*'`.

### Issue 2: Web ASG Instance Refresh Fails or Hangs
- **Cause:** New instances fail ALB target group health checks on `/api/health`.
- **Remediation:**
  1. Inspect the instance refresh status:
     ```bash
     aws autoscaling describe-instance-refreshes --auto-scaling-group-name dev-opt3-asg
     ```
  2. Connect to the failing instance via SSM and examine `/var/log/cloud-init-output.log` and `docker logs`.

### Issue 3: High Database Storage Usage
- **Cause:** Accumulation of WAL logs or large database tables.
- **Remediation:**
  1. Check disk utilization: `df -h`.
  2. In PostgreSQL: Run `VACUUM FULL;` or adjust WAL retention settings.
  3. If storage resize is necessary, update `DBVolumeSize` in `environments/prod.json` and redeploy CloudFormation.
