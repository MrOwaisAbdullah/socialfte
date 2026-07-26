"""R2 storage client — Week 2, Story 6.

Mirrors apps/dashboard/lib/r2.ts's key convention and public-URL shape exactly.
See specs/002-week2-dashboard-render/contracts/r2-client.md.
"""
import os

import boto3


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("R2_ENDPOINT"),
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
        region_name="auto",  # R2's convention
    )


def upload_buffer(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(
        Bucket=os.environ["R2_BUCKET"],
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def get_public_url(key: str) -> str:
    return f"{os.environ['R2_PUBLIC_URL']}/{key}"
