# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Mock mode through the real Strands tool loop: each phrase gives the expected tool calls, on the stub MCP server too,
# and the expected speech.

import asyncio  # drives a turn directly
import json  # log lines

from say_when_agent.mock_model import FAILED, HELP  # the mock's fixed sentences

TEA = {"question": "Would you like tea or coffee?", "asked_by": "Alex", "options": ["Tea", "Coffee"]}  # ask_question's input


def test_tea_or_coffee_asks_waits_and_reports_the_answer(stub, turn):  # the demo question, answered
    stub.answer = "Tea"  # Sam chooses Tea
    assert turn("Ask Sam if he wants tea or coffee") == [  # the whole stream, in order
        ("tool_call", {"name": "ask_question", "input": TEA}),  # asked in the second person, with the named options
        ("tool_result", {"name": "ask_question", "ok": True}),  # delivered
        ("tool_call", {"name": "get_answer", "input": {"question_id": "q-1", "wait_seconds": 20}}),  # waits at most 20 s
        ("tool_result", {"name": "get_answer", "ok": True}),  # answered
        ("speech", {"text": "Sam says: Tea."}),  # verbatim and attributed
        ("done", {}),  # end of the turn
    ]  # end of the stream
    assert stub.calls == [("ask_question", {**TEA, "urgency": "normal"}), ("get_answer", {"question_id": "q-1", "wait_seconds": 20})]  # what the server received, with its default urgency


def test_a_pending_answer_is_never_guessed(stub, turn):  # nobody pressed yet
    stub.answer = None  # get_answer stays pending
    assert turn("ask Sam if he wants tea or coffee?")[-2:] == [("speech", {"text": "Sam hasn't answered yet."}), ("done", {})]  # no invented answer


def test_an_open_question_has_no_options(stub, turn):  # "what" questions get the server's replies, not ours
    stub.answer = "The news"  # Sam's choice
    events = turn("ask Sam what he wants to watch")  # the open question
    assert events[0] == ("tool_call", {"name": "ask_question", "input": {"question": "What would you like to watch?", "asked_by": "Alex"}})  # no options
    assert events[2][1]["name"] == "get_answer"  # then the wait
    assert events[-2] == ("speech", {"text": "Sam says: The news."})  # and the answer


def test_options_are_split_at_commas_too(stub, turn):  # three named choices
    events = turn("ask Sam if they want tea, coffee or juice")  # a list
    assert events[0][1]["input"] == {"question": "Would you like tea, coffee or juice?", "asked_by": "Alex", "options": ["Tea", "Coffee", "Juice"]}  # each one an option


def test_a_yes_no_question_has_no_options(stub, turn):  # no " or ": the server adds Yes and No
    stub.answer = "Yes"  # Sam's choice
    events = turn("Ask Sam if she wants a walk")  # a yes/no question
    assert events[0][1]["input"] == {"question": "Would you like a walk?", "asked_by": "Alex"}  # no options


def test_what_did_sam_say_summarises_the_recent_messages(stub, turn):  # the history
    stub.messages = [{"text": "Not now", "time": "2026-10-19T10:00:00Z", "kind": "reply", "question_text": "Shall we go out?"}, {"text": "Tea", "time": "2026-10-19T10:05:00Z", "kind": "reply", "question_text": "Would you like tea or coffee?"}]  # oldest first
    assert turn("What did Sam say?") == [  # the whole stream
        ("tool_call", {"name": "get_recent_messages", "input": {"limit": 5}}),  # the five latest
        ("tool_result", {"name": "get_recent_messages", "ok": True}),  # listed
        ("speech", {"text": "Sam said: Not now. Tea."}),  # short and spoken
        ("done", {}),  # end of the turn
    ]  # end of the stream


def test_what_did_sam_say_with_no_messages(stub, turn):  # nothing yet
    stub.messages = []  # an empty history
    assert turn("what did Sam say")[-2] == ("speech", {"text": "Sam hasn't said anything recently."})  # says so


def test_remember_adds_a_profile_fact(stub, turn):  # context for Sam's reply suggestions
    assert turn("Remember that Sam loves gardening") == [  # the whole stream
        ("tool_call", {"name": "add_profile_fact", "input": {"fact": "Sam loves gardening", "category": "likes"}}),  # filed under likes
        ("tool_result", {"name": "add_profile_fact", "ok": True}),  # stored
        ("speech", {"text": "Noted."}),  # acknowledged
        ("done", {}),  # end of the turn
    ]  # end of the stream
    assert stub.calls == [("add_profile_fact", {"fact": "Sam loves gardening", "category": "likes"})]  # what the server received


def test_remember_files_dislikes_and_other_facts(stub, turn):  # the category follows the verb
    turn("remember that Sam hates mushrooms")  # a dislike
    turn("remember Sam's sister is Priya.")  # anything else
    turn("Remember that Sam doesn't like loud music")  # a negated like
    assert stub.calls == [("add_profile_fact", {"fact": "Sam hates mushrooms", "category": "dislikes"}), ("add_profile_fact", {"fact": "Sam's sister is Priya", "category": "other"}), ("add_profile_fact", {"fact": "Sam doesn't like loud music", "category": "dislikes"})]  # all filed


def test_anything_else_says_what_mock_mode_can_do(stub, turn):  # no tool call at all
    assert turn("Play some music") == [("speech", {"text": HELP}), ("done", {})]  # one sentence
    assert stub.calls == []  # the server saw nothing


def test_a_refused_tool_call_is_reported_without_guessing(stub, turn):  # the server's validation refuses it
    events = turn("ask Sam if he wants " + "a very long question " * 10)  # over 200 characters
    assert events[1] == ("tool_result", {"name": "ask_question", "ok": False})  # a tool error
    assert events[-2:] == [("speech", {"text": FAILED}), ("done", {})]  # no answer is made up


def test_a_turn_closed_early_is_still_logged(service, stub, capsys):  # the caregiver panel went away mid-turn
    async def first_then_close():  # read one event, then close the stream as Starlette does on a disconnect
        events = service.turn("remember that Sam loves gardening")  # the turn
        first = await anext(events)  # its first event
        await events.aclose()  # the client is gone
        return first  # for the check
    assert asyncio.run(first_then_close())[1]["name"] == "add_profile_fact"  # the call was announced
    assert stub.calls == []  # but never made
    logged = json.loads(capsys.readouterr().out.splitlines()[-1])  # the last log line
    assert (logged["msg"], logged["tools"], logged["outcome"]) == ("turn.done", ["add_profile_fact"], "cancelled")  # logged all the same
