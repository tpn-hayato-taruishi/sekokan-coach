import json
import os
from datetime import datetime, timedelta, timezone

import boto3
from botocore.exceptions import ClientError


JST = timezone(timedelta(hours=9))
VALID_ACTIONS = {"resume", "pause", "enforce"}


def _today_jst() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d")


def _holidays() -> set[str]:
    raw_value = os.environ.get("HOLIDAYS", "[]")
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError:
        return set()
    return {str(day) for day in parsed}


def _is_operating_time(now: datetime, holidays: set[str]) -> bool:
    if now.strftime("%Y-%m-%d") in holidays:
        return False
    # 毎日 9:00-24:00 (深夜 0:00 で停止)
    return 9 <= now.hour < 24


def _service_status(client, service_arn: str) -> str:
    service = client.describe_service(ServiceArn=service_arn).get("Service", {})
    return str(service.get("Status", "UNKNOWN"))


def handler(event, context):
    action = str(event.get("action", "pause")).lower()
    if action not in VALID_ACTIONS:
        return {"status": "ignored", "reason": f"unsupported action: {action}"}

    service_arn = os.environ["SERVICE_ARN"]
    today = _today_jst()
    holidays = _holidays()

    if action == "resume" and today in holidays:
        print(f"Skipping resume because {today} is configured as a holiday.")
        return {"status": "skipped", "reason": "holiday", "date": today}

    if action == "enforce":
        now = datetime.now(JST)
        if _is_operating_time(now, holidays):
            print(f"Skipping enforce because {now.isoformat()} is inside operating hours.")
            return {"status": "skipped", "reason": "inside_operating_hours", "date": today}
        action = "pause"

    client = boto3.client("apprunner")
    try:
        current_status = _service_status(client, service_arn)
        if action == "pause" and current_status != "RUNNING":
            print(f"Skipping pause because service status is {current_status}.")
            return {"status": "already_done", "action": action, "service_status": current_status}
        if action == "resume" and current_status != "PAUSED":
            print(f"Skipping resume because service status is {current_status}.")
            return {"status": "already_done", "action": action, "service_status": current_status}

        if action == "resume":
            response = client.resume_service(ServiceArn=service_arn)
        else:
            response = client.pause_service(ServiceArn=service_arn)
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code", "")
        if code == "InvalidStateException":
            print(f"App Runner service is already compatible with action={action}.")
            return {"status": "already_done", "action": action}
        raise

    status = response.get("Service", {}).get("Status", "UNKNOWN")
    print(f"App Runner {action} requested. status={status}")
    return {"status": "ok", "action": action, "service_status": status}
