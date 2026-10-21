# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Shared fixtures: the stub MCP server, a started agent service in mock mode, and a client for its HTTP interface.

import json  # SSE data
from collections.abc import Callable, Iterator  # fixture types

import pytest  # fixtures
from starlette.testclient import TestClient  # in-process HTTP client
from stub_server import StubServer  # the stub of the server's /mcp

from svavak_agent.app import create_app  # the HTTP interface
from svavak_agent.config import Config  # settings
from svavak_agent.service import AgentService  # the agent

TOKEN = "agent-token-for-tests-0123"  # a synthetic agent token
BASE_URL = "http://127.0.0.1:8790"  # so requests carry Host 127.0.0.1:8790, as a real client's do


def config(mode: str = "mock", profile: str | None = None) -> Config:  # settings for a test
    return Config(mode=mode, agent_token=TOKEN, aws_profile=profile, aws_region="eu-central-1", model_id="eu.amazon.nova-2-lite-v1:0")  # the defaults


def parse(body: str) -> list[tuple[str, dict]]:  # SSE frames to (event, data) pairs
    frames = [frame.split("\n") for frame in body.split("\n\n") if frame]  # one frame per event
    return [(lines[0].removeprefix("event: "), json.loads(lines[1].removeprefix("data: "))) for lines in frames]  # name and JSON


@pytest.fixture  # a fresh stub per test
def stub() -> Iterator[StubServer]:  # the server side
    with StubServer(TOKEN) as server:  # listening on a free port
        yield server  # for the test


@pytest.fixture  # a started service per test
def service(stub: StubServer) -> Iterator[AgentService]:  # mock mode against the stub
    agent = AgentService(config(), stub.url)  # mock model
    agent.start()  # connects and lists the tools
    yield agent  # for the test
    agent.stop()  # ends the MCP session before the stub stops


@pytest.fixture  # the HTTP interface
def client(service: AgentService) -> Iterator[TestClient]:  # in-process
    with TestClient(create_app(service), base_url=BASE_URL) as http:  # one event loop for the whole test
        yield http  # for the test


@pytest.fixture  # one caregiver turn
def turn(client: TestClient) -> Callable[[str], list[tuple[str, dict]]]:  # text in, events out
    def run(text: str) -> list[tuple[str, dict]]:  # POST /agent/turn
        response = client.post("/agent/turn", json={"text": text})  # the whole stream
        assert response.status_code == 200  # streamed
        return parse(response.text)  # its events
    return run  # the helper
