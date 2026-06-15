resource "aws_apprunner_auto_scaling_configuration_version" "app" {
  auto_scaling_configuration_name = "${var.app_name}-scaling"
  max_concurrency                 = 100
  max_size                        = 2
  min_size                        = 1
}

resource "aws_apprunner_service" "app" {
  service_name = local.name_prefix

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.app.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "4000"

        runtime_environment_variables = {
          NODE_ENV                  = "production"
          NEXT_TELEMETRY_DISABLED   = "1"
          AWS_REGION                = var.aws_region
          BEDROCK_MODEL_ID          = var.bedrock_model_id
          BEDROCK_MONTHLY_LIMIT_YEN = tostring(var.bedrock_monthly_limit_yen)
          ACTIVITY_TABLE_NAME       = aws_dynamodb_table.activity_logs.name
          ADMIN_TOKEN               = var.admin_token
          ALLOWED_IPS               = join(",", local.allowed_cidrs)
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.app_runner_cpu
    memory            = var.app_runner_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.app.arn
}
