output "ecr_repository_url" {
  description = "ECR repository URL."
  value       = aws_ecr_repository.app.repository_url
}

output "app_url" {
  description = "App Runner service URL."
  value       = "https://${aws_apprunner_service.app.service_url}"
}

output "service_arn" {
  description = "App Runner service ARN."
  value       = aws_apprunner_service.app.arn
}

output "activity_table_name" {
  description = "DynamoDB table used for activity logs and cost records."
  value       = aws_dynamodb_table.activity_logs.name
}

output "schedule_info" {
  description = "App Runner weekday operating schedule."
  value       = "Weekdays 10:00-12:00 and 13:00-17:00 JST. Resume is skipped on configured holidays. Off-hours guard pauses any service that is manually resumed."
}

output "budget_info" {
  description = "AWS Budgets limit and automatic cleanup behavior."
  value       = "Monthly account budget: ¥${var.budget_limit_yen} (${local.budget_limit_usd} USD at ${var.budget_usd_jpy_rate} JPY/USD). Budget SNS invokes cleanup Lambda."
}

output "alerts_sns_topic_arn" {
  description = "SNS topic ARN for operational alerts."
  value       = aws_sns_topic.alerts.arn
}

output "docker_push_commands" {
  description = "Commands to build and push the application image."
  value       = <<-EOT
    aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com
    docker build -t ${aws_ecr_repository.app.repository_url}:latest .
    docker push ${aws_ecr_repository.app.repository_url}:latest
    aws apprunner start-deployment --service-arn ${aws_apprunner_service.app.arn}
  EOT
}
