// AWS からの指摘対応: Bedrock のアクセス元 IP を社内ネットワークに限定する。
// 対象は長期アクセスキーを持つ IAM ユーザーのみ。App Runner のインスタンスロールは
// 一時認証情報かつ固定の送信元 IP を持たないため、この Deny の対象外にする。
// 許可 IP は allowed_ips.txt (アプリのIP制限と同一ソース) を再利用する。

variable "bedrock_ip_guard_user" {
  description = "IAM user name to restrict Bedrock access by source IP. Empty disables the guard."
  type        = string
  default     = ""
}

locals {
  allowed_cidr_blocks = [
    for cidr in local.allowed_cidrs : strcontains(cidr, "/") ? cidr : "${cidr}/32"
  ]
}

resource "aws_iam_policy" "bedrock_ip_guard" {
  count       = var.bedrock_ip_guard_user == "" ? 0 : 1
  name        = "${var.app_name}-bedrock-ip-guard"
  description = "Deny Bedrock access from outside the corporate network."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DenyBedrockOutsideCorporateNetwork"
        Effect   = "Deny"
        Action   = "bedrock:*"
        Resource = "*"
        Condition = {
          NotIpAddress = {
            "aws:SourceIp" = local.allowed_cidr_blocks
          }
          Bool = {
            "aws:ViaAWSService" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "bedrock_ip_guard" {
  count      = var.bedrock_ip_guard_user == "" ? 0 : 1
  user       = var.bedrock_ip_guard_user
  policy_arn = aws_iam_policy.bedrock_ip_guard[0].arn
}
