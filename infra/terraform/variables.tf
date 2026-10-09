
variable "aws_region" {
  type        = string
  description = "AWS Deployment Region"
  default     = "ap-southeast-1"
}

variable "environment" {
  type        = string
  description = "Environment name (dev or prod)"
  default     = "prod"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "web_volume_size" {
  type    = number
  default = 30
}

variable "db_volume_size" {
  type    = number
  default = 40
}

variable "db_password" {
  type      = string
  sensitive = true
  default   = "ProdSecret123!"
}
