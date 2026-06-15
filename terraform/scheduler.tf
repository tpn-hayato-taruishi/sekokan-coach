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
      description = "Resume App Runner weekdays at 10:00 JST."
      expression  = "cron(0 1 ? * MON-FRI *)"
      action      = "resume"
    }
    lunch_pause = {
      description = "Pause App Runner weekdays at 12:00 JST."
      expression  = "cron(0 3 ? * MON-FRI *)"
      action      = "pause"
    }
    lunch_resume = {
      description = "Resume App Runner weekdays at 13:00 JST."
      expression  = "cron(0 4 ? * MON-FRI *)"
      action      = "resume"
    }
    pause = {
      description = "Pause App Runner weekdays at 17:00 JST."
      expression  = "cron(0 8 ? * MON-FRI *)"
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

resource "aws_cloudwatch_event_rule" "lunch_pause" {
  name                = "${var.app_name}-lunch-pause"
  description         = local.schedules.lunch_pause.description
  schedule_expression = local.schedules.lunch_pause.expression
}

resource "aws_cloudwatch_event_target" "lunch_pause" {
  rule  = aws_cloudwatch_event_rule.lunch_pause.name
  arn   = aws_lambda_function.scheduler.arn
  input = jsonencode({ action = local.schedules.lunch_pause.action })
}

resource "aws_lambda_permission" "lunch_pause" {
  statement_id  = "AllowEventBridgeLunchPause"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.lunch_pause.arn
}

resource "aws_cloudwatch_event_rule" "lunch_resume" {
  name                = "${var.app_name}-lunch-resume"
  description         = local.schedules.lunch_resume.description
  schedule_expression = local.schedules.lunch_resume.expression
}

resource "aws_cloudwatch_event_target" "lunch_resume" {
  rule  = aws_cloudwatch_event_rule.lunch_resume.name
  arn   = aws_lambda_function.scheduler.arn
  input = jsonencode({ action = local.schedules.lunch_resume.action })
}

resource "aws_lambda_permission" "lunch_resume" {
  statement_id  = "AllowEventBridgeLunchResume"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.lunch_resume.arn
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
