terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Shared environments should move state to S3/DynamoDB locking.
  # backend "s3" {
  #   bucket         = "sekokan-quiz-tfstate"
  #   key            = "frontend/terraform.tfstate"
  #   region         = "ap-northeast-1"
  #   dynamodb_table = "sekokan-quiz-tfstate-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
      RebuiltBy   = "codex"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name_prefix      = "${var.app_name}-${var.environment}"
  allowed_ips_file = "${path.module}/allowed_ips.txt"
  allowed_ip_lines = fileexists(local.allowed_ips_file) ? split("\n", file(local.allowed_ips_file)) : []
  allowed_cidrs = [
    for line in local.allowed_ip_lines : trimspace(line)
    if trimspace(line) != "" && !startswith(trimspace(line), "#")
  ]
}
