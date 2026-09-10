"""Shared-secret auth for the conversion endpoint.

This service is meant to sit behind a private network only (Tailscale,
another VPN, or an internal-only LAN segment) — never the public internet.
The API key is a second layer on top of that: it stops any other device or
process that can merely *reach* this host on the network from silently
using it, and stops a malicious page open in a browser on the same machine
from calling it cross-origin (CORS in main.py is the first layer for that,
but CORS is a browser-enforced convention, not a real access control).
"""
import hmac
import os

from fastapi import Header, HTTPException, status

_API_KEY = os.environ.get("API_KEY", "")


def require_api_key(x_api_key: str = Header(default="")) -> None:
    if not _API_KEY:
        # Fail closed: treat an unset key as "not configured for use," not
        # as "no auth required." Prevents ever accidentally deploying this
        # open by forgetting to set API_KEY.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Server misconfigured: API_KEY is not set.",
        )
    # Constant-time comparison — a plain `!=` leaks key length/prefix via
    # response timing.
    if not hmac.compare_digest(x_api_key, _API_KEY):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing API key.")
