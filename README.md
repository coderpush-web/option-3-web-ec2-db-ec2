# Option 3: 1 EC2 Web + 1 EC2 DB Separated

Hạ tầng và Mã nguồn ứng dụng độc lập cho **Option 3: 1 EC2 Web + 1 EC2 DB Separated**.

## 1. Cấu trúc thư mục (File Structure)
```text
.
├── .github/workflows/ci-cd.yml   # CI/CD Pipeline (test code, lint CloudFormation, auto-deploy)
├── app/                          # Mã nguồn Website độc lập (Node.js/Express)
├── infra/                        # Mã nguồn CloudFormation hạ tầng AWS
│   ├── cloudformation.yaml       # Template CloudFormation độc lập
│   └── architecture_diagram.png  # Sơ đồ kiến trúc Diagram-as-Code
├── test/                         # Kiểm thử tự động (Unit test API & app)
│   └── test_api.js
└── README.md                     # Báo cáo kỹ thuật và ma trận chi phí
```

## 2. Báo cáo Chi phí Đa Chiều (Multi-Dimension Cost Analysis)

### A. Chi phí theo Mô hình Thanh toán (Region Singapore)
| Mô hình áp dụng | Web Tier Compute | DB Tier Compute | Storage & IP | Tổng chi phí / tháng |
| :--- | :--- | :--- | :--- | :--- |
| **On-Demand thuần túy** | $15.18 / tháng | $15.18 / tháng | $11.25 / tháng | **$41.61 / tháng** (~1.050.000 VNĐ) |
| **1-Year Reserved / Savings Plan** | $9.56 / tháng | $9.56 / tháng | $11.25 / tháng | **$30.37 / tháng** *(Giảm 27%)* |
| **3-Year Reserved / Savings Plan** | $6.06 / tháng | $6.06 / tháng | $11.25 / tháng | **$23.37 / tháng** *(Giảm 44%)* |
| **Hybrid (Web Spot + DB 1-Year RI)**| $4.53 / tháng | $9.56 / tháng | $11.25 / tháng | **$25.34 / tháng** *(Giảm 39%)* |

<!-- INFRACOST_START -->
### 💵 Kết quả Kiểm tra Chi phí Tự động (Infracost CI/CD Output)
*Thời gian kiểm tra: Fri Oct  9 06:03:21 UTC 2026*

```text
Resource                                                  Count  Monthly Cost
aws_instance.db                                               2           $46
aws_instance.web                                              2           $44
module.vpc.aws_vpc.this                                       2            $0
module.vpc.aws_subnet.private_1                               2            $0
module.vpc.aws_subnet.private_2                               2            $0
module.vpc.aws_subnet.public                                  2            $0
aws_eip.web                                                   2            $0
module.iam.aws_iam_instance_profile.this                      2            $0
module.iam.aws_iam_role.ssm_role                              2            $0
module.iam.aws_iam_role_policy_attachment.ssm_attachment      2            $0
module.security.aws_security_group.db                         2            $0
module.security.aws_security_group.web                        2            $0
module.vpc.aws_internet_gateway.this                          2            $0
module.vpc.aws_route_table.public                             2            $0
module.vpc.aws_route_table_association.public                 2            $0
```
<!-- INFRACOST_END -->

## 3. Kiến trúc Hạ tầng (Architecture Diagram)
![Architecture](infra/architecture_diagram.png)

## 4. Quy trình CI/CD & Branching Strategy
- **dev**: Nhánh phát triển chính. Tự động chạy kiểm thử khi push/PR.
- **main**: Nhánh Production được bảo vệ (**Branch Protection Rule**). Chỉ cho phép merge từ nhánh **dev**.

## 🔒 Bảo Mật & Quản Lý Trạng Thái Hạ Tầng (Terraform State on S3)
Toàn bộ trạng thái hạ tầng được lưu trữ và bảo vệ nghiêm ngặt:
- **Lưu trữ từ xa (Remote State):** Amazon S3 Bucket `coderpush-terraform-states-ap-southeast-1`.
- **Mã hóa dữ liệu tại chỗ (Encryption at Rest):** Bật mã hóa `encrypt = true` (AES-256) ngăn ngừa mọi truy cập trái phép.
- **Khóa trạng thái (State Locking):** Tích hợp Amazon DynamoDB Table `coderpush-terraform-locks` ngăn xung đột khi nhiều kỹ sư hoặc pipeline chạy đồng thời.
- **Phân tách môi trường:** Khóa phân lập `environments/dev.tfvars` và `environments/prod.tfvars`.
