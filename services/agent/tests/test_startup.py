# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Start-up: the MCP tools are listed, and an unreachable server or a refused token stops the agent with a clear
# message; main() wires the settings, the MCP session and uvicorn on 127.0.0.1:8790.

import json  # log lines
import socket  # a port where nothing listens

import httpx  # the transport's HTTP errors
import pytest  # fixtures
from conftest import TOKEN, config  # shared helpers
from stub_server import StubServer  # the stub of the server's /mcp

from say_when_agent import app  # main()
from say_when_agent.service import AgentService, StartupError, explain  # the agent and its start-up messages


def free_url() -> str:  # an MCP URL on a loopback port with nothing listening
    with socket.socket() as s:  # bind to port 0
        s.bind(("127.0.0.1", 0))  # the OS picks a free port
        port = s.getsockname()[1]  # remember it
    return f"http://127.0.0.1:{port}/mcp"  # closed again


def test_start_lists_the_server_tools(stub):  # the four tools at start-up
    agent = AgentService(config(), stub.url)  # mock mode
    assert agent.start() == ["ask_question", "get_answer", "get_recent_messages", "add_profile_fact"]  # their names
    agent.stop()  # end the session


def test_an_unreachable_server_fails_with_a_clear_message():  # nothing listening
    url = free_url()  # a closed port
    with pytest.raises(StartupError, match=rf"^the MCP server at {url} is unreachable: is it running\? \(yarn workspace server start\)$"):  # says what to do
        AgentService(config(), url).start()  # connect


def test_a_refused_token_fails_with_a_clear_message():  # the server's token differs
    with StubServer("another-token-0123456789") as stub, pytest.raises(StartupError, match=rf"^the MCP server at {stub.url} refused SAY_WHEN_AGENT_TOKEN \(HTTP 401\): use the server's agent token from the repository's \.env$"):  # a different token; says what to do
        AgentService(config(), stub.url).start()  # connect


@pytest.mark.parametrize(("status", "message"), [  # the server's answer and the start of the message
    (403, "refused SAY_WHEN_AGENT_TOKEN (HTTP 403)"),  # the device token on /mcp
    (500, "answered HTTP 500 at initialize"),  # not the token's fault
])  # end of the cases
def test_only_401_and_403_blame_the_token(status, message):  # any other HTTP error says what it was
    url = "http://127.0.0.1:8787/mcp"  # the server's /mcp
    error = httpx.HTTPStatusError("refused", request=httpx.Request("POST", url), response=httpx.Response(status))  # what the transport raises
    assert explain(error, url).startswith(f"the MCP server at {url} {message}")  # the right words


def test_other_start_up_failures_keep_strands_words():  # neither an HTTP status nor a transport error
    assert explain(RuntimeError("the client initialization failed: boom"), "http://127.0.0.1:8787/mcp") == "could not start the MCP session at http://127.0.0.1:8787/mcp: the client initialization failed: boom"  # as raised


def test_main_serves_on_loopback_and_closes_the_session(stub, monkeypatch, capsys):  # the entry point
    served = {}  # what uvicorn.run got
    monkeypatch.setattr(app, "read_env", lambda: {"SAY_WHEN_AGENT_TOKEN": TOKEN})  # mock mode, this token
    monkeypatch.setattr(app, "MCP_URL", stub.url)  # the stub instead of the server
    monkeypatch.setattr(app.uvicorn, "run", lambda asgi, **options: served.update(options))  # no real server
    stopped = []  # stop() calls
    real_stop = AgentService.stop  # the real one
    monkeypatch.setattr(AgentService, "stop", lambda self: (stopped.append(True), real_stop(self)))  # recorded, then run
    app.main()  # start, "serve", stop
    assert served == {"host": "127.0.0.1", "port": 8790}  # loopback, the agent's port
    assert stopped == [True]  # the MCP session was ended once uvicorn returned
    started = json.loads(capsys.readouterr().out.splitlines()[0])  # the first log line
    assert (started["msg"], started["mode"], started["tools"]) == ("agent.started", "mock", ["ask_question", "get_answer", "get_recent_messages", "add_profile_fact"])  # mode and tools, never the token
    assert TOKEN not in json.dumps(started)  # the token is never printed


@pytest.mark.parametrize(("env", "message"), [  # each start-up failure and its message
    ({}, "SAY_WHEN_AGENT_TOKEN must be set"),  # no token
    ({"SAY_WHEN_AGENT_TOKEN": TOKEN}, "is unreachable"),  # no server
])  # end of the cases
def test_main_exits_with_a_clear_message(monkeypatch, capsys, caplog, env, message):  # no traceback, a reason
    monkeypatch.setattr(app, "read_env", lambda: env)  # the settings
    monkeypatch.setattr(app, "MCP_URL", free_url())  # nothing listening
    with pytest.raises(SystemExit, match=f"^say-when-agent: .*{message}"):  # exits non-zero with the message
        app.main()  # start
    out, err = capsys.readouterr()  # everything printed
    assert "Traceback" not in out + err + caplog.text  # only the one line (under pytest, log records go to caplog)


def test_a_refused_start_prints_no_traceback_and_no_token(monkeypatch, capsys, caplog):  # Strands logs start-up failures with a traceback
    with StubServer("another-token-0123456789") as stub:  # expects a different token
        monkeypatch.setattr(app, "read_env", lambda: {"SAY_WHEN_AGENT_TOKEN": TOKEN})  # mock mode, this token
        monkeypatch.setattr(app, "MCP_URL", stub.url)  # the stub
        with pytest.raises(SystemExit, match="refused SAY_WHEN_AGENT_TOKEN"):  # the one-line reason
            app.main()  # start
    out, err = capsys.readouterr()  # everything printed
    logs = out + err + caplog.text  # and logged (under pytest, records go to its handler instead of stderr)
    assert "Traceback" not in logs  # no traceback
    assert TOKEN not in logs  # and never the token


def test_main_exits_when_the_live_profile_is_missing(monkeypatch, tmp_path):  # live mode, wrong AWS_PROFILE
    (tmp_path / "config").write_text("", encoding="utf-8")  # an AWS config without that profile
    monkeypatch.setenv("AWS_CONFIG_FILE", str(tmp_path / "config"))  # read it
    monkeypatch.setattr(app, "read_env", lambda: {"SAY_WHEN_AGENT_TOKEN": TOKEN, "SAY_WHEN_MODE": "live", "AWS_PROFILE": "no-such-profile"})  # the settings
    with pytest.raises(SystemExit, match=r"^say-when-agent: The config profile \(no-such-profile\) could not be found$"):  # boto's message
        app.main()  # start
