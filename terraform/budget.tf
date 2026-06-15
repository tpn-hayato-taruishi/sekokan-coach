locals {
  budget_limit_usd = format("%.2f", var.budget_limit_yen / var.budget_usd_jpy_rate)
}

resource "aws_sns_topic" "budget_alert" {
  name = "${var.app_name}-budget-alert"
}

resource "aws_sns_topic_policy" "budget_alert" {
  arn = aws_sns_topic.budget_alert.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.budget_alert.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

resource "aws_budgets_budget" "account_monthly" {
  name         = "${var.app_name}-account-monthly"
  budget_type  = "COST"
  limit_amount = local.budget_limit_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 90
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget_alert.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.budget_alert.arn]
  }
}

data "archive_file" "budget_destroyer" {
  type        = "zip"
  source_file = "${path.module}/lambda/budget_destroyer.py"
  output_path = "${path.module}/lambda/budget_destroyer.zip"
}

resource "aws_iam_role" "budget_destroyer" {
  name = "${var.app_name}-budget-destroyer"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "budget_destroyer" {
  name = "${var.app_name}-budget-destroyer-policy"
  role = aws_iam_role.budget_destroyer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "apprunner:DeleteService",
          "apprunner:DescribeService",
          "apprunner:PauseService"
        ]
        Resource = aws_apprunner_service.app.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchDeleteImage",
          "ecr:DescribeRepositories",
          "ecr:ListImages"
        ]
        Resource = aws_ecr_repository.app.arn
      },
      {
        Effect = "Allow"
        Action = [
          "events:DisableRule"
        ]
        Resource = "arn:aws:events:${var.aws_region}:${data.aws_caller_identity.current.account_id}:rule/${var.app_name}-*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      }
    ]
  })
}

resource "aws_lambda_function" "budget_destroyer" {
  function_name    = "${var.app_name}-budget-destroyer"
  role             = aws_iam_role.budget_destroyer.arn
  handler          = "budget_destroyer.handler"
  runtime          = "python3.12"
  timeout          = 60
  filename         = data.archive_file.budget_destroyer.output_path
  source_code_hash = data.archive_file.budget_destroyer.output_base64sha256

  environment {
    variables = {
      SERVICE_ARN   = aws_apprunner_service.app.arn
      ECR_REPO_NAME = aws_ecr_repository.app.name
      APP_NAME      = var.app_name
      # AWS_REGION は Lambda の予約環境変数 (自動注入されるため削除)
      DEPLOY_REGION = var.aws_region
    }
  }
}

resource "aws_sns_topic_subscription" "budget_to_lambda" {
  topic_arn = aws_sns_topic.budget_alert.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.budget_destroyer.arn
}

resource "aws_lambda_permission" "budget_sns" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.budget_destroyer.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.budget_alert.arn
}
