data "archive_file" "scheduler" {
  type        = "zip"
  source_file = "${path.module}/lambda/scheduler.py"
  output_path = "${path.module}/lambda/scheduler.zip"
}

resource "aws_iam_role" "scheduler_lambda" {
  name = "${var.app_name}-scheduler-lambda"

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

resource "aws_iam_role_policy" "scheduler_lambda" {
  name = "${var.app_name}-scheduler-policy"
  role = aws_iam_role.scheduler_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "apprunner:DescribeService",
          "apprunner:PauseService",
          "apprunner:ResumeService"
        ]
        Resource = aws_apprunner_service.app.arn
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

resource "aws_lambda_function" "scheduler" {
  function_name    = "${var.app_name}-scheduler"
  role             = aws_iam_role.scheduler_lambda.arn
  handler          = "scheduler.handler"
  runtime          = "python3.12"
  timeout          = 30
  filename         = data.archive_file.scheduler.output_path
  source_code_hash = data.archive_file.scheduler.output_base64sha256

  environment {
    variables = {
      SERVICE_ARN = aws_apprunner_service.app.arn
      HOLIDAYS    = jsonencode(var.holidays)
    }
  }
}

locals {
  schedules = {
    resume = {
      description = "Resume App Runner daily at 9:00 JST."
      expression  = "cron(0 0 ? * * *)" # 00:00 UTC = 09:00 JST every day
      action      = "resume"
    }
    pause = {
      description = "Pause App Runner daily at 24:00 JST (= 00:00 next day)."
      expression  = "cron(0 15 ? * * *)" # 15:00 UTC = 24:00 JST same day
      action      = "pause"
    }
    off_hours_guard = {
      description = "Enforce App Runner paused outside operating hours."
      expression  = "rate(15 minutes)"
      action      = "enforce"
    }
  }
}

resource "aws_cloudwatch_event_rule" "resume" {
  name                = "${var.app_name}-resume"
  description         = local.schedules.resume.description
  schedule_expression = local.schedules.resume.expression
}

resource "aws_cloudwatch_event_target" "resume" {
  rule  = aws_cloudwatch_event_rule.resume.name
  arn   = aws_lambda_function.scheduler.arn
  input = jsonencode({ action = local.schedules.resume.action })
}

resource "aws_lambda_permission" "resume" {
  statement_id  = "AllowEventBridgeResume"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.resume.arn
}

resource "aws_cloudwatch_event_rule" "pause" {
  name                = "${var.app_name}-pause"
  description         = local.schedules.pause.description
  schedule_expression = local.schedules.pause.expression
}

resource "aws_cloudwatch_event_target" "pause" {
  rule  = aws_cloudwatch_event_rule.pause.name
  arn   = aws_lambda_function.scheduler.arn
  input = jsonencode({ action = local.schedules.pause.action })
}

resource "aws_lambda_permission" "pause" {
  statement_id  = "AllowEventBridgePause"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.pause.arn
}

resource "aws_cloudwatch_event_rule" "off_hours_guard" {
  name                = "${var.app_name}-off-hours-guard"
  description         = local.schedules.off_hours_guard.description
  schedule_expression = local.schedules.off_hours_guard.expression
}

resource "aws_cloudwatch_event_target" "off_hours_guard" {
  rule  = aws_cloudwatch_event_rule.off_hours_guard.name
  arn   = aws_lambda_function.scheduler.arn
  input = jsonencode({ action = local.schedules.off_hours_guard.action })
}

resource "aws_lambda_permission" "off_hours_guard" {
  statement_id  = "AllowEventBridgeOffHoursGuard"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.off_hours_guard.arn
}
