# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# MCP sessions: start-up and every turn open and close their own, so a server restart or the server's 30-minute idle
# timeout needs no agent restart, and a turn while the server is down ends with an error event.

import asyncio  # drives a turn directly
import json  # log lines
import time  # a deadline

import pytest  # test framework
from conftest import TOKEN  # the agent token
from stub_server import StubServer  # the stub of the server's /mcp

ERROR = ("error", {"message": "The agent could not finish this turn."})  # the turn's error event
NOTED = [("speech", {"text": "Noted."}), ("done", {})]  # the end of a turn that stored a profile fact


def sessions(stub: StubServer) -> set[str]:  # every MCP session the stub has seen
    return {session for _, session in stub.requests if session}  # the Mcp-Session-Id values


def closed(stub: StubServer) -> set[str]:  # the sessions the agent ended
    return {session for method, session in stub.requests if method == "DELETE"}  # DELETE /mcp


def test_start_up_closes_its_session(service, stub):  # no idle session is left behind after the check
    assert len(sessions(stub)) == 1  # one session for the tool list
    assert closed(stub) == sessions(stub)  # and it was ended


def test_each_turn_opens_and_closes_its_own_session(stub, turn):  # an initialize and a tools/list per turn
    assert turn("Remember that Sam loves gardening")[-2:] == NOTED  # turn one
    assert turn("Remember that Sam hates mushrooms")[-2:] == NOTED  # turn two
    assert len(sessions(stub)) == 3  # start-up's, then one per turn
    assert closed(stub) == sessions(stub)  # each one ended with its turn


def test_a_server_restart_between_turns_needs_no_agent_restart(stub, turn):  # the server forgets all sessions when it restarts
    assert turn("Remember that Sam loves gardening")[-2:] == NOTED  # before the restart
    stub.__exit__()  # the server stops
    with StubServer(TOKEN, port=stub.port) as restarted:  # and starts again on its port
        assert turn("Remember that Sam hates mushrooms")[-2:] == NOTED  # the same agent carries on
    assert restarted.calls == [("add_profile_fact", {"fact": "Sam hates mushrooms", "category": "dislikes"})]  # the call reached the new server


def test_a_turn_while_the_server_is_down_ends_with_an_error_and_the_next_one_works(stub, turn, capsys, caplog):  # unreachable at turn time
    caplog.set_level("WARNING")  # what the service shows by default
    stub.__exit__()  # the server stops
    assert turn("Remember that Sam loves gardening") == [ERROR, ("done", {})]  # the stream still ends cleanly
    out, err = capsys.readouterr()  # everything printed
    logged = json.loads(out.splitlines()[-1])  # the turn's log line
    assert (logged["msg"], logged["tools"], logged["outcome"]) == ("turn.done", [], "MCPClientInitializationError")  # the error's type, never its text
    assert "gardening" not in out + err + caplog.text  # no caregiver text
    with StubServer(TOKEN, port=stub.port) as back:  # the server is back on its port
        assert turn("Remember that Sam loves gardening")[-2:] == NOTED  # the next turn simply tries again
    assert back.calls == [("add_profile_fact", {"fact": "Sam loves gardening", "category": "likes"})]  # and reached it


def test_a_token_refused_at_turn_time_ends_the_turn_with_an_error(stub, turn, capsys, caplog):  # the server restarted with another token
    caplog.set_level("WARNING")  # what the service shows by default
    stub.__exit__()  # the server stops
    with StubServer("another-token-0123456789", port=stub.port):  # and comes back expecting a different token
        assert turn("Remember that Sam loves gardening") == [ERROR, ("done", {})]  # refused: the turn ends
    out, err = capsys.readouterr()  # everything printed
    assert json.loads(out.splitlines()[-1])["outcome"] == "MCPClientInitializationError"  # the error's type
    assert TOKEN not in out + err + caplog.text  # never the token


def test_a_turn_cancelled_while_connecting_still_closes_its_session(service, stub):  # the caregiver panel went away during initialize
    async def cancel_while_connecting():  # starts a turn and cancels it once its initialize reached the stub
        before = len(stub.requests)  # start-up's requests
        task = asyncio.ensure_future(anext(service.turn("hello")))  # the turn starts connecting
        deadline = time.monotonic() + 10  # budget
        while len(stub.requests) == before:  # until the turn's first request arrives
            assert time.monotonic() < deadline, "the turn never connected"  # fail rather than hang
            await asyncio.sleep(0.001)  # poll
        task.cancel()  # the client is gone while the session is still opening
        with pytest.raises(asyncio.CancelledError):  # the turn ends cancelled
            await task  # after its clean-up
    asyncio.run(cancel_while_connecting())  # one event loop
    assert len(sessions(stub)) == 2  # start-up's and the turn's
    assert closed(stub) == sessions(stub)  # the turn's was closed once it had opened
