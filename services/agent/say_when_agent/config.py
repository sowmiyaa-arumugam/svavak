# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Agent configuration from the repository's .env and the environment (names and placeholders in .env.example).

import os  # the process environment
import re  # the token's characters
from collections.abc import Mapping  # the settings' type
from dataclasses import dataclass, field  # an immutable settings record
from pathlib import Path  # the .env location

from dotenv import dotenv_values  # parses the .env file

HOST = "127.0.0.1"  # loopback only (plan Table 21)
PORT = 8790  # the agent's port (plan Table 21)
MCP_URL = "http://127.0.0.1:8787/mcp"  # the server's MCP endpoint
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"  # the repository's .env: three folders up from this file


@dataclass(frozen=True)  # read-only once loaded
class Config:  # what the agent needs; AWS credentials are never part of it
    mode: str  # SAY_WHEN_MODE: "mock" (no AWS at all) or "live" (Bedrock)
    agent_token: str = field(repr=False)  # SAY_WHEN_AGENT_TOKEN for /mcp; left out of repr, so it is never printed
    aws_profile: str | None  # AWS_PROFILE: the IAM Identity Center (SSO) profile, live mode only
    aws_region: str  # AWS_REGION: the Bedrock region (plan §8.1)
    model_id: str  # SAY_WHEN_MODEL_ID: the Bedrock model or inference profile id


def read_env() -> dict[str, str | None]:  # the settings to load
    return {**dotenv_values(ENV_FILE), **os.environ}  # the .env file, overridden by the process environment (as Node's --env-file)


def load_config(env: Mapping[str, str | None]) -> Config:  # checks the settings; raises ValueError with a readable message
    mode = env.get("SAY_WHEN_MODE") or "mock"  # mock by default
    if mode not in ("mock", "live"):  # a typo
        raise ValueError(f'SAY_WHEN_MODE must be "mock" or "live", not "{mode}"')  # name the setting
    token = env.get("SAY_WHEN_AGENT_TOKEN") or ""  # fail closed: no token, no agent
    if not re.fullmatch(r"[!-~]{16,}", token):  # too short (the .env.example placeholder too), or not a valid header value
        raise ValueError("SAY_WHEN_AGENT_TOKEN must be set to at least 16 visible ASCII characters, without spaces (see .env.example)")  # never echoes it
    profile = env.get("AWS_PROFILE") or None  # empty counts as unset
    if mode == "live" and profile is None:  # live mode signs in with SSO only
        raise ValueError("SAY_WHEN_MODE=live needs AWS_PROFILE, an IAM Identity Center (SSO) profile")  # never access keys
    if mode == "live" and env.get("AWS_BEARER_TOKEN_BEDROCK"):  # botocore would send this Bedrock API key instead of signing with the profile
        raise ValueError("SAY_WHEN_MODE=live signs in with AWS_PROFILE only: unset AWS_BEARER_TOKEN_BEDROCK")  # a long-term key; never its value
    return Config(  # the settings
        mode=mode,  # mock or live
        agent_token=token,  # the bearer token for /mcp
        aws_profile=profile,  # SSO profile name, or None
        aws_region=env.get("AWS_REGION") or "eu-central-1",  # Frankfurt (plan §8.1)
        model_id=env.get("SAY_WHEN_MODEL_ID") or "eu.amazon.nova-2-lite-v1:0",  # Nova 2 Lite, EU geo inference profile (plan §8.1)
    )  # end of the settings
