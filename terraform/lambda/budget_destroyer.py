import json
import os
from typing import Any

import boto3


def _append(results: list[dict[str, Any]], target: str, status: str, detail: str = "") -> None:
    results.append({"target": target, "status": status, "detail": detail})


def _disable_schedules(events, app_name: str, results: list[dict[str, Any]]) -> None:
    for suffix in ("resume", "lunch-pause", "lunch-resume", "pause", "off-hours-guard"):
        rule_name = f"{app_name}-{suffix}"
        try:
            events.disable_rule(Name=rule_name)
            _append(results, rule_name, "disabled")
        except Exception as error:
            _append(results, rule_name, "error", str(error))


def _delete_ecr_images(ecr, repository_name: str, results: list[dict[str, Any]]) -> None:
    image_ids: list[dict[str, str]] = []
    paginator = ecr.get_paginator("list_images")
    for page in paginator.paginate(repositoryName=repository_name):
        image_ids.extend(page.get("imageIds", []))

    if not image_ids:
        _append(results, repository_name, "empty")
        return

    for index in range(0, len(image_ids), 100):
        batch = image_ids[index:index + 100]
        ecr.batch_delete_image(repositoryName=repository_name, imageIds=batch)

    _append(results, repository_name, "images_deleted", str(len(image_ids)))


def _delete_apprunner_service(apprunner, service_arn: str, results: list[dict[str, Any]]) -> None:
    try:
        service = apprunner.describe_service(ServiceArn=service_arn).get("Service", {})
        status = service.get("Status", "UNKNOWN")
        if status in {"DELETED", "DELETE_FAILED"}:
            _append(results, service_arn, "skipped", f"status={status}")
            return
        apprunner.delete_service(ServiceArn=service_arn)
        _append(results, service_arn, "delete_requested", f"previous_status={status}")
    except Exception as error:
        _append(results, service_arn, "error", str(error))


def handler(event, context):
    print("Budget alert received")
    print(json.dumps(event, default=str))

    region = os.environ.get("AWS_REGION", "ap-northeast-1")
    app_name = os.environ.get("APP_NAME", "e-platch")
    service_arn = os.environ["SERVICE_ARN"]
    repository_name = os.environ["ECR_REPO_NAME"]

    results: list[dict[str, Any]] = []
    _disable_schedules(boto3.client("events", region_name=region), app_name, results)
    _delete_ecr_images(boto3.client("ecr", region_name=region), repository_name, results)
    _delete_apprunner_service(boto3.client("apprunner", region_name=region), service_arn, results)

    print(json.dumps(results, ensure_ascii=False))
    return {"status": "completed", "results": results}
