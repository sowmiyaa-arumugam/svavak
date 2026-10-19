# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# The agent's core (plan §4.5, §4.6): the MCP connection, the model for the mode, and one Strands agent per caregiver
# turn, turned into the events the caregiver panel shows. Logs carry no caregiver text and no answers.

import json  # log lines
import logging  # Strands' log level
import time  # turn durations
from collections.abc import AsyncIterator  # turn()'s type
from datetime import UTC, datetime  # log timestamps
from typing import Any  # loose dict values

import boto3  # the SSO profile's session, live mode only
import httpx  # the MCP transport's errors
from strands import Agent  # the agent loop
from strands.models import BedrockModel, Model  # the live model, and the provider type
from strands.tools.mcp import MCPClient  # MCP over Streamable HTTP
from strands.types.exceptions import MCPClientInitializationError  # how every start-up failure surfaces

from .config import MCP_URL, Config  # settings
from .mock_model import ASKED_BY, MockModel  # mock mode

logging.getLogger("strands").setLevel(logging.CRITICAL)  # off: its lines can quote model-written tool input or tool names; the service reports failures itself

POLICY = " ".join((  # the system prompt: plan §4.6's agent policy
    "You are a simulated Alexa+ assistant for a caregiver.",  # the role
    "Sam answers questions on a TV by pressing a single switch; you can only reach Sam through your tools.",  # who Sam is
    f'To ask Sam something, call ask_question with asked_by "{ASKED_BY}", then call get_answer with its question_id and a wait_seconds of at most 20.',  # ask, then wait
    "If the answer is still pending, say that Sam hasn't answered yet.",  # no waiting forever
    'Report an answer word for word, as "Sam says: " followed by its answer_text.',  # verbatim and attributed
    "Never invent, guess or complete an answer: only Sam's own selection is ever reported.",  # the model proposes, Sam decides
    'Keep questions short and ask them in the second person, such as "Would you like tea or coffee?".',  # how to ask
    "Pass options only when the caregiver named them.",  # otherwise the server suggests replies
    "To say what Sam said recently, call get_recent_messages; to remember something about Sam, call add_profile_fact.",  # the other tools
    "Never ask for passwords, health records or financial data.",  # plan §4.4's safety rule
    "Answer in one or two short sentences, as they will be spoken.",  # a voice assistant
))  # end of the policy
TEMPERATURE = 0.2  # plan §4.5: set explicitly, never a default


class StartupError(Exception):  # the MCP server cannot be reached, or refused the token
    pass  # the message says which


def log(msg: str, **fields: Any) -> None:  # one JSON line, as the server logs; never caregiver text or answers
    print(json.dumps({"at": datetime.now(UTC).isoformat(timespec="milliseconds"), "msg": msg, **fields}), flush=True)  # to stdout


def model_for(config: Config) -> Model:  # the model the mode asks for
    if config.mode == "mock":  # no AWS at all
        return MockModel()  # the deterministic planner
    session = boto3.Session(profile_name=config.aws_profile, region_name=config.aws_region)  # SSO profile; never access keys
    return BedrockModel(boto_session=session, model_id=config.model_id, temperature=TEMPERATURE)  # Nova 2 Lite, named explicitly


class AgentService:  # the MCP session and the turns
    def __init__(self, config: Config, mcp_url: str = MCP_URL) -> None:  # builds the model; nothing connects yet
        self.config = config  # settings
        self.mcp_url = mcp_url  # the server's /mcp
        self.model = model_for(config)  # shared by every turn; it keeps no conversation state
        self.client = MCPClient(url=mcp_url, headers={"Authorization": f"Bearer {config.agent_token}"})  # Streamable HTTP, agent token
        self.tools: list[Any] = []  # the server's tools, listed at start-up

    def start(self) -> list[str]:  # connects and lists the tools; raises StartupError with a clear message
        try:  # initialize, then tools/list
            self.client.start()  # opens the session in Strands' background thread
            self.tools = self.client.list_tools_sync()  # one page: the server lists all four at once
        except MCPClientInitializationError as error:  # unreachable, or refused; the cause is inside
            raise StartupError(explain(error, self.mcp_url)) from None  # the cause, in words
        return [tool.tool_name for tool in self.tools]  # their names, for the start-up log

    def stop(self) -> None:  # ends the MCP session
        try:  # DELETE /mcp and the background thread
            self.client.stop(None, None, None)  # no exception to report
        except RuntimeError:  # the connection had already closed
            pass  # nothing left to end

    async def turn(self, text: str) -> AsyncIterator[tuple[str, dict[str, Any]]]:  # one caregiver turn as (event, data) pairs
        started = time.monotonic()  # for the log
        names: dict[str, str] = {}  # tool names by toolUseId
        listed = {tool.tool_name for tool in self.tools}  # the only names the log may carry
        called: list[str] = []  # the tools called, for the log
        outcome = "cancelled"  # until the loop ends: the client may go away first
        agent = Agent(model=self.model, tools=self.tools, system_prompt=POLICY, callback_handler=None)  # fresh per turn; prints nothing
        try:  # the log line, however the turn ends
            try:  # the Strands loop
                async for event in agent.stream_async(text):  # model calls and tool runs
                    for block in event["message"]["content"] if "message" in event else []:  # a new message: the model's or the tools'
                        if "toolUse" in block:  # the model calls a tool; it runs after this
                            use = block["toolUse"]  # name, id and input
                            names[use["toolUseId"]] = use["name"]  # for its result
                            called.append(use["name"] if use["name"] in listed else "unknown")  # for the log: the model may make a name up
                            yield ("tool_call", {"name": use["name"], "input": use["input"]})  # shown as a chip
                        elif "toolResult" in block:  # the tool finished
                            result = block["toolResult"]  # its status
                            yield ("tool_result", {"name": names[result["toolUseId"]], "ok": result["status"] == "success"})  # never its content
                    if "result" in event:  # the final answer
                        speech = "".join(b.get("text", "") for b in event["result"].message["content"]).strip()  # its text blocks
                        if speech:  # something to say
                            yield ("speech", {"text": speech})  # for the caregiver
                outcome = "ok"  # the loop ended
            except Exception as error:  # noqa: BLE001 - any failure of the model or a tool ends the turn with an error event
                outcome = type(error).__name__  # the type only: messages may quote the caregiver
                yield ("error", {"message": "The agent could not finish this turn."})  # the panel shows it
            yield ("done", {})  # always last
        finally:  # finished, failed or cancelled
            log("turn.done", mode=self.config.mode, tools=called, outcome=outcome, duration_ms=round((time.monotonic() - started) * 1000))  # no text


def explain(error: BaseException, url: str) -> str:  # a start-up failure in words
    status = find(error, httpx.HTTPStatusError)  # the server answered with an error
    if status is not None and status.response.status_code in (401, 403):  # the token: missing, wrong, or the device token
        return f"the MCP server at {url} refused SAY_WHEN_AGENT_TOKEN (HTTP {status.response.status_code}): use the server's agent token from the repository's .env"  # what to do
    if status is not None:  # any other error status
        return f"the MCP server at {url} answered HTTP {status.response.status_code} at initialize"  # what it was
    if find(error, httpx.TransportError) is not None:  # refused connection, timeout or DNS
        return f"the MCP server at {url} is unreachable: is it running? (yarn workspace server start)"  # what to do
    return f"could not start the MCP session at {url}: {error}"  # anything else, as Strands words it


def find(error: BaseException | None, kind: type[BaseException]) -> Any:  # the first exception of a kind in a cause chain
    if error is None or isinstance(error, kind):  # end of the chain, or found
        return error  # None or the match
    for inner in getattr(error, "exceptions", ()):  # an ExceptionGroup's members
        if (match := find(inner, kind)) is not None:  # found inside
            return match  # the match
    return find(error.__cause__ or error.__context__, kind)  # Strands wraps the transport's ExceptionGroup
