# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Live mode with a stub model: the real BedrockModel, built from an SSO-style profile, with its Bedrock client's
# converse_stream replaced, so the test sees each request and nothing reaches AWS.

import json  # tool input as a JSON string

import pytest  # fixtures
from botocore.exceptions import ProfileNotFound  # boto's error for an unknown profile
from conftest import BASE_URL, config, parse  # shared helpers
from starlette.testclient import TestClient  # in-process HTTP client

from say_when_agent.app import create_app  # the HTTP interface
from say_when_agent.service import POLICY, AgentService  # the system prompt and the agent

PROFILE = "say-when-test"  # a profile that exists only in the test's AWS config file


@pytest.fixture  # AWS settings with one profile and no credentials anywhere
def aws(tmp_path, monkeypatch):  # isolated from the developer's own AWS set-up
    for name in ("AWS_PROFILE", "AWS_DEFAULT_PROFILE", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_BEARER_TOKEN_BEDROCK"):  # anything that could pick credentials or a region
        monkeypatch.delenv(name, raising=False)  # unset
    (tmp_path / "config").write_text(f"[profile {PROFILE}]\nregion = eu-west-1\n", encoding="utf-8")  # a profile, without credentials
    (tmp_path / "credentials").write_text("", encoding="utf-8")  # no credentials file entries
    monkeypatch.setenv("AWS_CONFIG_FILE", str(tmp_path / "config"))  # read this config
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", str(tmp_path / "credentials"))  # and these (empty) credentials
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")  # never ask the instance metadata service


def scripted(requests: list[dict], replies: list[list[dict]]):  # a converse_stream that records each request and plays a reply
    def converse_stream(**request):  # what BedrockModel sends to Bedrock
        requests.append(request)  # recorded
        return {"stream": replies[len(requests) - 1]}  # the next scripted reply
    return converse_stream  # the stub


def tool_use(name: str, raw_input: str) -> list[dict]:  # a model reply that calls a tool
    return [{"messageStart": {"role": "assistant"}}, {"contentBlockStart": {"start": {"toolUse": {"toolUseId": "tu-1", "name": name}}}}, {"contentBlockDelta": {"delta": {"toolUse": {"input": raw_input}}}}, {"contentBlockStop": {}}, {"messageStop": {"stopReason": "tool_use"}}]  # Bedrock's stream events


def text(words: str) -> list[dict]:  # a model reply that speaks
    return [{"messageStart": {"role": "assistant"}}, {"contentBlockDelta": {"delta": {"text": words}}}, {"contentBlockStop": {}}, {"messageStop": {"stopReason": "end_turn"}}]  # Bedrock's stream events


def test_live_mode_sends_the_policy_temperature_and_model_id(aws, stub):  # plan §4.5 and §4.6
    stub.messages = [{"text": "Tea", "time": "2026-10-19T10:05:00Z", "kind": "reply", "question_text": "Would you like tea or coffee?"}]  # Sam's answer
    agent = AgentService(config("live", PROFILE), stub.url)  # the real BedrockModel
    requests: list[dict] = []  # what reached the stub model
    agent.model.client.converse_stream = scripted(requests, [tool_use("get_recent_messages", '{"limit": 5}'), text("Sam said: Tea.")])  # no AWS call
    agent.start()  # the stub server's tools
    try:  # the turn
        with TestClient(create_app(agent), base_url=BASE_URL) as http:  # in-process
            events = parse(http.post("/agent/turn", json={"text": "What did Sam say?"}).text)  # one turn
    finally:  # always end the session
        agent.stop()  # DELETE /mcp
    assert agent.model.client.meta.region_name == "eu-central-1"  # AWS_REGION from the config, over the profile's region
    first = requests[0]  # the first model call
    assert first["modelId"] == "eu.amazon.nova-2-lite-v1:0"  # named explicitly, never a default
    assert first["inferenceConfig"] == {"temperature": 0.2}  # plan §4.5
    assert first["system"] == [{"text": POLICY}]  # the agent policy as the system prompt
    assert [t["toolSpec"]["name"] for t in first["toolConfig"]["tools"]] == ["ask_question", "get_answer", "get_recent_messages", "add_profile_fact"]  # the server's tools, from MCP
    assert requests[1]["messages"][-1]["content"][0]["toolResult"]["content"][0]["text"].startswith('{"messages":[{"text":"Tea"')  # the tool output reached the model
    assert stub.calls == [("get_recent_messages", {"limit": 5})]  # the call reached the server
    assert events == [("tool_call", {"name": "get_recent_messages", "input": {"limit": 5}}), ("tool_result", {"name": "get_recent_messages", "ok": True}), ("speech", {"text": "Sam said: Tea."}), ("done", {})]  # the same events as mock mode


def test_every_turn_starts_without_the_earlier_ones(aws, stub):  # a fresh Agent per turn: no memory, no shared lock
    agent = AgentService(config("live", PROFILE), stub.url)  # the real BedrockModel
    requests: list[dict] = []  # what reached the stub model
    agent.model.client.converse_stream = scripted(requests, [text("One."), text("Two.")])  # two plain replies
    agent.start()  # the stub server's tools
    try:  # two turns on one service
        with TestClient(create_app(agent), base_url=BASE_URL) as http:  # in-process
            http.post("/agent/turn", json={"text": "first"})  # turn one
            http.post("/agent/turn", json={"text": "second"})  # turn two
    finally:  # always end the session
        agent.stop()  # DELETE /mcp
    assert [r["messages"] for r in requests] == [[{"role": "user", "content": [{"text": "first"}]}], [{"role": "user", "content": [{"text": "second"}]}]]  # nothing carried over


def test_the_policy_carries_the_plan_rules():  # plan §4.6 and the agent brief
    for rule in ("call ask_question", "get_answer", "at most 20", "hasn't answered yet", '"Sam says: "', "word for word", "Never invent, guess", "second person", "options only when the caregiver named them", "passwords, health records or financial data"):  # each rule
        assert rule in POLICY  # present


def test_a_missing_profile_fails_at_start_up(aws):  # credentials only from AWS_PROFILE
    with pytest.raises(ProfileNotFound, match="could not be found"):  # names the profile
        AgentService(config("live", "no-such-profile"), "http://127.0.0.1:1/mcp")  # before any connection


def test_a_failing_model_ends_the_turn_with_an_error_event(aws, stub, capsys, caplog):  # an expired SSO token, Bedrock refusing, ...
    agent = AgentService(config("live", PROFILE), stub.url)  # the real BedrockModel

    def broken(**request):  # Bedrock fails, and its message quotes the caregiver
        raise RuntimeError(f"cannot process: {request['messages'][0]['content'][0]['text']}")  # caregiver text in the error
    agent.model.client.converse_stream = broken  # instead of Bedrock
    agent.start()  # the stub server's tools
    caplog.set_level("WARNING")  # what the service shows by default
    try:  # the turn
        with TestClient(create_app(agent), base_url=BASE_URL) as http:  # in-process
            events = parse(http.post("/agent/turn", json={"text": "Ask Sam about the pistachio ice cream"}).text)  # one turn
    finally:  # always end the session
        agent.stop()  # DELETE /mcp
    assert events == [("error", {"message": "The agent could not finish this turn."}), ("done", {})]  # the stream still ends cleanly
    out, err = capsys.readouterr()  # everything printed
    assert json.loads(out.splitlines()[-1])["outcome"] == "RuntimeError"  # the error's type is logged
    assert "istachio" not in out + err + caplog.text  # its message is not


def test_a_made_up_tool_name_is_logged_as_unknown(aws, stub, capsys, caplog):  # the model writes tool names; they can quote the caregiver
    agent = AgentService(config("live", PROFILE), stub.url)  # the real BedrockModel
    agent.model.client.converse_stream = scripted([], [tool_use("order_pistachio_ice_cream", "{}"), text("Sorry.")])  # a tool the server has not
    agent.start()  # the stub server's tools
    caplog.set_level("WARNING")  # what the service shows by default
    try:  # the turn
        with TestClient(create_app(agent), base_url=BASE_URL) as http:  # in-process
            events = parse(http.post("/agent/turn", json={"text": "Order Sam some ice cream"}).text)  # one turn
    finally:  # always end the session
        agent.stop()  # DELETE /mcp
    assert events[1] == ("tool_result", {"name": "order_pistachio_ice_cream", "ok": False})  # Strands refused it; the panel sees the name
    out, err = capsys.readouterr()  # everything printed
    assert json.loads(out.splitlines()[-1])["tools"] == ["unknown"]  # the log does not
    assert "istachio" not in out + err + caplog.text  # nor Strands' own error line


def test_model_written_tool_input_never_reaches_the_logs(aws, stub, capsys, caplog):  # Strands warns with up to 200 characters of it
    agent = AgentService(config("live", PROFILE), stub.url)  # the real BedrockModel
    agent.model.client.converse_stream = scripted([], [tool_use("ask_question", '{"question": "Fancy some pistachio ice cream'), text("Sorry.")])  # broken JSON
    agent.start()  # the stub server's tools
    caplog.set_level("WARNING")  # what the service shows by default
    try:  # the turn
        with TestClient(create_app(agent), base_url=BASE_URL) as http:  # in-process
            events = parse(http.post("/agent/turn", json={"text": "Ask Sam about dessert"}).text)  # one turn
    finally:  # always end the session
        agent.stop()  # DELETE /mcp
    assert events[1] == ("tool_result", {"name": "ask_question", "ok": False})  # the empty input was refused
    out, err = capsys.readouterr()  # everything printed
    assert "istachio" not in out + err + caplog.text  # never logged
    assert json.loads(out.splitlines()[-1])["msg"] == "turn.done"  # the turn's own log line is there
