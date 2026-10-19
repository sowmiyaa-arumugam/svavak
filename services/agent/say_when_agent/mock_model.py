# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Mock mode (plan §4.5): a deterministic Strands model provider that maps a few caregiver phrases to the server's
# tools, so the real Strands tool loop runs without an AWS account.

import json  # tool inputs and outputs
import re  # phrase matching
from collections.abc import AsyncIterator  # stream()'s type
from typing import Any  # loose dict values

from strands.models import Model  # the custom model provider base class
from strands.types.content import Messages  # the conversation so far
from strands.types.streaming import StreamEvent  # what stream() yields

ASKED_BY = "Alex"  # the caregiver persona, as on the TV's fixture questions
HELP = "In mock mode I can ask Sam a question, tell you what Sam said, or remember something about Sam."  # anything else
NOT_YET = "Sam hasn't answered yet."  # get_answer still pending (or replaced by a newer question)
FAILED = "Sorry, that didn't work."  # a tool refused the call
LIKES = re.compile(r"\b(loves?|likes?|enjoys?)\b", re.IGNORECASE)  # a fact about something Sam likes
DISLIKES = re.compile(r"\b(hates?|dislikes?|(doesn't|does not|never) (like|love|enjoy)s?)\b", re.IGNORECASE)  # a dislike, negated likes included


def first_step(text: str) -> tuple[str, dict[str, Any]] | str:  # the caregiver's words to a tool call, or a sentence
    t = re.sub(r"\s+", " ", text).strip().rstrip(".?!").strip()  # one line, without closing punctuation
    if m := re.fullmatch(r"ask sam (?:if|whether) (?:he|she|they) wants? (.+)", t, re.IGNORECASE):  # "ask Sam if he wants tea or coffee"
        args: dict[str, Any] = {"question": f"Would you like {m[1]}?", "asked_by": ASKED_BY}  # in the second person
        items = re.split(r",? or |, ", m[1])  # "tea or coffee", "tea, coffee or juice"
        if len(items) > 1:  # a choice the caregiver named
            args["options"] = [i[:1].upper() + i[1:] for i in items]  # "Tea", "Coffee"
        return ("ask_question", args)  # a yes/no question has no options
    if m := re.fullmatch(r"ask sam what (?:he|she|they) wants? (.+)", t, re.IGNORECASE):  # "ask Sam what he wants to watch"
        return ("ask_question", {"question": f"What would you like {m[1]}?", "asked_by": ASKED_BY})  # an open question
    if re.fullmatch(r"what did sam say", t, re.IGNORECASE):  # "what did Sam say"
        return ("get_recent_messages", {"limit": 5})  # the five latest messages
    if m := re.fullmatch(r"remember (?:that )?(.+)", t, re.IGNORECASE):  # "remember that Sam loves gardening"
        category = "dislikes" if DISLIKES.search(m[1]) else "likes" if LIKES.search(m[1]) else "other"  # from the verb; dislikes first
        return ("add_profile_fact", {"fact": m[1], "category": category})  # the fact as said
    return HELP  # not understood


def next_step(tool: str, ok: bool, output: dict[str, Any]) -> tuple[str, dict[str, Any]] | str:  # after a tool's result
    if not ok:  # refused (invalid input, unknown question, too many facts)
        return FAILED  # never guess
    if tool == "ask_question":  # asked: now wait for the answer
        return ("get_answer", {"question_id": output["question_id"], "wait_seconds": 20})  # at most 20 s (plan §4.6)
    if tool == "get_answer":  # answered, or not yet
        return f"Sam says: {sentence(output['answer_text'])}" if output["status"] == "answered" else NOT_YET  # verbatim, attributed
    if tool == "get_recent_messages":  # what Sam said lately
        texts = [sentence(m["text"]) for m in output["messages"]]  # oldest first
        return f"Sam said: {' '.join(texts)}" if texts else "Sam hasn't said anything recently."  # a short spoken summary
    return "Noted."  # add_profile_fact


def sentence(text: str) -> str:  # Sam's words, closed with a full stop when they have no closing punctuation
    return text if text.endswith((".", "!", "?")) else f"{text}."  # "Tea" to "Tea."


def plan(messages: Messages) -> tuple[str, dict[str, Any]] | str:  # the next step for this conversation
    names: dict[str, str] = {}  # tool names by toolUseId
    last: tuple[str, bool, dict[str, Any]] | None = None  # the latest tool result since the caregiver spoke
    text = ""  # the caregiver's latest words
    for message in messages:  # oldest first
        for block in message["content"]:  # text, toolUse or toolResult blocks
            if "toolUse" in block:  # a call the model made
                names[block["toolUse"]["toolUseId"]] = block["toolUse"]["name"]  # remember its name
            elif "toolResult" in block:  # its result; Strands keeps the MCP structuredContent on it
                result = block["toolResult"]  # status, content and structuredContent
                last = (names[result["toolUseId"]], result["status"] == "success", result.get("structuredContent") or {})  # newest wins
            elif "text" in block and message["role"] == "user":  # the caregiver spoke
                text, last = block["text"], None  # a new turn starts over
    return first_step(text) if last is None else next_step(*last)  # first move, or the follow-up


class MockModel(Model):  # a Strands model provider that never calls a model
    def __init__(self) -> None:  # no settings to take
        self.config: dict[str, Any] = {"model_id": "mock"}  # for get_config

    def update_config(self, **model_config: Any) -> None:  # part of the Model interface
        self.config.update(model_config)  # kept, unused

    def get_config(self) -> dict[str, Any]:  # part of the Model interface
        return self.config  # the settings

    def structured_output(self, output_model, prompt, system_prompt=None, **kwargs):  # part of the Model interface
        raise NotImplementedError("mock mode has no structured output")  # the agent never asks for it

    async def stream(self, messages: Messages, tool_specs=None, system_prompt=None, **kwargs: Any) -> AsyncIterator[StreamEvent]:  # one model turn
        step = plan(messages)  # what to do next
        yield {"messageStart": {"role": "assistant"}}  # an assistant message begins
        if isinstance(step, str):  # a spoken sentence: the turn ends
            yield {"contentBlockStart": {"start": {}}}  # a text block
            yield {"contentBlockDelta": {"delta": {"text": step}}}  # the whole sentence
            yield {"contentBlockStop": {}}  # end of the block
            yield {"messageStop": {"stopReason": "end_turn"}}  # done
            return  # nothing more
        name, args = step  # a tool call
        uses = sum(1 for m in messages for b in m["content"] if "toolUse" in b)  # earlier calls in this conversation
        yield {"contentBlockStart": {"start": {"toolUse": {"name": name, "toolUseId": f"mock-{uses + 1}"}}}}  # deterministic id
        yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}  # the input as a JSON string
        yield {"contentBlockStop": {}}  # end of the block
        yield {"messageStop": {"stopReason": "tool_use"}}  # Strands runs the tool, then calls stream() again
