variable "aws_region" {
  description = "AWS region for App Runner, Bedrock, DynamoDB, Lambda, and ECR."
  type        = string
  default     = "ap-northeast-1"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "app_name" {
  description = "Application name used for resource names."
  type        = string
  default     = "sekokan-quiz"
}

variable "bedrock_model_id" {
  description = "Amazon Bedrock model ID used by chat and report APIs."
  type        = string
  default     = "apac.anthropic.claude-3-haiku-20240307-v1:0"
}

variable "bedrock_monthly_limit_yen" {
  description = "Monthly Bedrock usage limit enforced by the application."
  type        = number
  default     = 5000
}

variable "app_runner_cpu" {
  description = "App Runner CPU size."
  type        = string
  default     = "256"
}

variable "app_runner_memory" {
  description = "App Runner memory size."
  type        = string
  default     = "512"
}

variable "admin_token" {
  description = "Bearer token for admin APIs."
  type        = string
  sensitive   = true
}

variable "holidays" {
  description = "JST dates when the App Runner resume schedule should be skipped."
  type        = list(string)
  default = [
    "2026-07-20",
    "2026-08-11",
    "2026-09-21",
    "2026-09-23",
    "2026-10-12",
    "2026-11-03",
    "2026-11-23",
  ]
}

variable "alert_email" {
  description = "Optional email address for SNS alert subscriptions."
  type        = string
  default     = ""
}

variable "budget_limit_yen" {
  description = "AWS account monthly budget limit in JPY."
  type        = number
  default     = 4500
}

variable "budget_usd_jpy_rate" {
  description = "USD/JPY rate used to convert the JPY budget into AWS Budgets USD."
  type        = number
  default     = 150
}

variable "ecr_force_delete" {
  description = "Allow Terraform to delete the ECR repository even when images remain."
  type        = bool
  default     = true
}
