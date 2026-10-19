# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# The HTTP interface (plan §4.5): POST /agent/turn as SSE, the Host and Origin allow-lists, CORS for the studio only,
# input checks, and logs without caregiver text or answers.

import threading  # a safety release

import pytest  # test framework

STUDIO = "http://localhost:5173"  # the studio's origin, the only one allowed


def test_a_turn_streams_server_sent_events(client):  # the response type
    response = client.post("/agent/turn", json={"text": "hello"})  # any text
    assert response.status_code == 200  # streamed
    assert response.headers["content-type"].startswith("text/event-stream")  # SSE
    assert response.headers["cache-control"] == "no-cache"  # never cached
    assert response.text.endswith("event: done\ndata: {}\n\n")  # the last frame


def test_frames_go_out_while_the_turn_runs(client, stub):  # the panel shows the chips during get_answer's wait
    stub.hold = True  # get_answer waits until released
    safety = threading.Timer(5, lambda: setattr(stub, "hold", False))  # releases it anyway if the frames were buffered
    safety.start()  # armed
    with client.stream("POST", "/agent/turn", json={"text": "ask Sam if he wants tea or coffee"}) as response:  # read as it arrives
        lines = response.iter_lines()  # line by line
        first = [next(lines) for _ in range(9)]  # three frames: ask_question's call and result, then get_answer's call
        held = stub.hold  # still waiting for Sam when they arrived
        stub.hold = False  # Sam answers
        rest = list(lines)  # the remaining frames
    safety.cancel()  # not needed
    assert held  # the frames were not buffered until the end
    assert first[6:8] == ["event: tool_call", 'data: {"name": "get_answer", "input": {"question_id": "q-1", "wait_seconds": 20}}']  # sent before the answer
    assert 'data: {"text": "Sam says: Tea."}' in rest  # then the answer


@pytest.mark.parametrize("host", ["localhost:8790", "127.0.0.1:8790", "localhost"])  # loopback names, any port
def test_loopback_hosts_are_allowed(client, host):  # the Host allow-list
    assert client.post("/agent/turn", json={"text": "hello"}, headers={"host": host}).status_code == 200  # accepted


@pytest.mark.parametrize("host", ["evil.example:8790", "192.168.1.20:8790", "localhost.evil.example"])  # DNS rebinding and LAN names
def test_other_hosts_get_403(client, stub, host):  # refused before the agent runs
    assert client.post("/agent/turn", json={"text": "remember that Sam loves gardening"}, headers={"host": host}).status_code == 403  # forbidden
    assert stub.calls == []  # the server saw nothing


def test_a_foreign_origin_gets_403(client, stub):  # a page on another site must not drive the agent
    response = client.post("/agent/turn", json={"text": "remember that Sam loves gardening"}, headers={"origin": "http://evil.example"})  # cross-site
    assert response.status_code == 403  # forbidden
    assert "access-control-allow-origin" not in response.headers  # no CORS grant
    assert stub.calls == []  # the server saw nothing


def test_a_foreign_preflight_gets_403(client):  # the browser's CORS check from another site
    response = client.options("/agent/turn", headers={"origin": "http://evil.example", "access-control-request-method": "POST"})  # preflight
    assert response.status_code == 403  # forbidden


def test_the_studio_gets_cors_headers(client):  # the studio's own origin
    response = client.post("/agent/turn", json={"text": "hello"}, headers={"origin": STUDIO})  # from the studio
    assert response.status_code == 200  # allowed
    assert response.headers["access-control-allow-origin"] == STUDIO  # for that origin only


def test_the_studio_preflight_is_answered(client):  # the browser's CORS check before a JSON POST
    response = client.options("/agent/turn", headers={"origin": STUDIO, "access-control-request-method": "POST", "access-control-request-headers": "content-type"})  # preflight
    assert response.status_code == 200  # allowed
    assert response.headers["access-control-allow-origin"] == STUDIO  # that origin
    assert "POST" in response.headers["access-control-allow-methods"]  # the method
    assert "content-type" in response.headers["access-control-allow-headers"].lower()  # the JSON header


@pytest.mark.parametrize("body", [b"not json", b"[]", b'{"text": 3}', b'{"text": "  "}', b'{"other": "x"}', ('{"text": "' + "x" * 501 + '"}').encode()])  # every refused shape
def test_bad_bodies_get_400(client, stub, body):  # input checked at the edge
    response = client.post("/agent/turn", content=body, headers={"content-type": "application/json"})  # the raw body
    assert response.status_code == 400  # refused
    assert response.json() == {"error": 'Send JSON {"text": "..."}: a non-empty string of at most 500 characters'}  # says what is expected
    assert stub.calls == []  # the agent never ran


def test_deeply_nested_json_gets_400(client):  # json.loads raises RecursionError, not ValueError
    assert client.post("/agent/turn", content=b"[" * 3000, headers={"content-type": "application/json"}).status_code == 400  # refused, not a 500


def test_a_body_over_4_kib_gets_413(client, stub):  # never buffered whole
    response = client.post("/agent/turn", content=b'{"text": "' + b"x" * 5000 + b'"}', headers={"content-type": "application/json"})  # 5 KB
    assert response.status_code == 413  # too large
    assert stub.calls == []  # the agent never ran


def test_other_methods_and_paths_are_refused(client):  # one route, one method
    assert client.get("/agent/turn").status_code == 405  # POST only
    assert client.post("/other", json={"text": "hello"}).status_code == 404  # no other route


def test_logs_never_contain_caregiver_text_or_answers(client, stub, capsys, caplog):  # privacy (plan §4.3, observability)
    stub.answer = "Pistachio ice cream"  # a distinctive answer
    caplog.set_level("WARNING")  # what the service shows by default
    events = client.post("/agent/turn", json={"text": "Ask Sam if he wants pistachio ice cream or lemon sorbet"}).text  # a distinctive question
    assert "Sam says: Pistachio ice cream." in events  # the answer reached the caregiver
    out, err = capsys.readouterr()  # everything the service printed
    logs = out + err + caplog.text  # and logged
    assert '"msg": "turn.done"' in out  # the turn was logged
    for secret in ("istachio", "sorbet", "Sam says"):  # caregiver text and the answer
        assert secret not in logs  # never logged
