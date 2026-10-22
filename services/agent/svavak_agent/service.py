# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# The agent's core: the MCP sessions, the model for the mode, and one Strands agent and MCP session per
# caregiver turn, turned into the events the caregiver panel shows. Logs carry no caregiver text and no answers.

import asyncio  # waits for the session's blocking calls without blocking the event loop
import json  # log lines
import logging  # Strands' log level
import re  # thinking spans and the attribution form in the model's speech
import time  # turn durations
from collections.abc import AsyncIterator  # turn()'s type
from concurrent.futures import ThreadPoolExecutor  # one thread per turn for its session's blocking calls, in order
from datetime import UTC, datetime  # log timestamps
from typing import Any  # loose dict values

import boto3  # the SSO profile's session, live mode only
import httpx  # the MCP transport's errors
from strands import Agent  # the agent loop
from strands.models import BedrockModel, Model  # the live model, and the provider type
from strands.tools.mcp import MCPClient  # MCP over Streamable HTTP
from strands.types.exceptions import MCPClientInitializationError  # how every start-up failure surfaces

from .config import MCP_URL, Config  # settings
from .mock_model import ASKED_BY, NOT_YET, MockModel, next_step  # mock mode, and the sentences that speak Sam's words

logging.getLogger("strands").setLevel(logging.CRITICAL)  # off: its lines can quote model-written tool input or tool names; the service reports failures itself

POLICY = " ".join((  # the system prompt: the agent policy
    "You are a simulated Alexa+ assistant for a caregiver.",  # the role
    "Sam answers questions on a TV by pressing a single switch; you can only reach Sam through your tools.",  # who Sam is
    f'To ask Sam something, call ask_question with asked_by "{ASKED_BY}", then call get_answer with its question_id and a wait_seconds of at most 20.',  # ask, then wait
    "If the answer is still pending, say that Sam hasn't answered yet.",  # no waiting forever
    'Report an answer word for word, as "Sam says: " followed by its answer_text.',  # verbatim and attributed
    "Never invent, guess or complete an answer: only Sam's own selection is ever reported.",  # the model proposes, Sam decides
    'Keep questions short and ask them in the second person, such as "Would you like tea or coffee?".',  # how to ask
    'Pass options only when the caregiver named them, as in "tea or coffee". Never make options up: for an open question, such as what Sam would like to watch, leave options out, and the server suggests replies from what it knows about Sam.',  # a live run's model invented options, which hid the server's replies
    "To say what Sam said recently, call get_recent_messages; to remember something about Sam, call add_profile_fact.",  # the other tools
    'When add_profile_fact succeeds, say only "Noted: " followed by the fact, such as "Noted: Sam loves gardening.", and nothing else.',  # a live run's model added two sentences of its own
    "If a tool fails, say \"Sorry, that didn't work.\"",  # never "Noted" for a fact that was not stored; mock mode says the same
    "Never ask for passwords, health records or financial data.",  # the MCP tools' safety rule
    "Every reply is at most two short sentences, as a voice assistant speaks: no explanations or offers of more help.",  # spoken aloud
))  # end of the policy
TEMPERATURE = 0.2  # set explicitly, never a default
THINKING = re.compile(r"<thinking>.*?</thinking>", re.DOTALL)  # Nova's reasoning in its text blocks, across lines: never spoken
ATTRIBUTION = re.compile(r"\bSam (?:says|said)\s*:", re.IGNORECASE)  # the reporting form, "Sam says:" or "Sam said:"
SAM_TOOLS = ("get_answer", "get_recent_messages")  # the tools whose results carry Sam's words


class StartupError(Exception):  # the MCP server cannot be reached, or refused the token
    pass  # the message says which


def log(msg: str, **fields: Any) -> None:  # one JSON line, as the server logs; never caregiver text or answers
    print(json.dumps({"at": datetime.now(UTC).isoformat(timespec="milliseconds"), "msg": msg, **fields}), flush=True)  # to stdout


def model_for(config: Config) -> Model:  # the model the mode asks for
    if config.mode == "mock":  # no AWS at all
        return MockModel()  # the deterministic planner
    session = boto3.Session(profile_name=config.aws_profile, region_name=config.aws_region)  # SSO profile; never access keys
    return BedrockModel(boto_session=session, model_id=config.model_id, temperature=TEMPERATURE)  # Nova 2 Lite, named explicitly


class AgentService:  # the start-up check and the turns, each over its own MCP session
    def __init__(self, config: Config, mcp_url: str = MCP_URL) -> None:  # builds the model; nothing connects yet
        self.config = config  # settings
        self.mcp_url = mcp_url  # the server's /mcp
        self.model = model_for(config)  # shared by every turn; it keeps no conversation state
        self.headers = {"Authorization": f"Bearer {config.agent_token}"}  # the agent token, on every MCP request
        self.client = MCPClient(url=mcp_url, headers=self.headers)  # the start-up check's session: Streamable HTTP, agent token

    def start(self) -> list[str]:  # connects, lists the tools and closes again; raises StartupError with a clear message
        try:  # initialize, then tools/list
            tools = connect(self.client)  # fails fast when the server is down or refuses the token
        except MCPClientInitializationError as error:  # unreachable, or refused; the cause is inside
            raise StartupError(explain(error, self.mcp_url)) from None  # the cause, in words
        finally:  # listed or not
            close(self.client)  # no idle session is left behind: every turn opens its own
        return [tool.tool_name for tool in tools]  # their names, for the start-up log

    def stop(self) -> None:  # ends the start-up session if it is still open; safe to call again
        close(self.client)  # DELETE /mcp and the background thread, or nothing

    async def turn(self, text: str) -> AsyncIterator[tuple[str, dict[str, Any]]]:  # one caregiver turn as (event, data) pairs, over its own MCP session
        started = time.monotonic()  # for the log
        names: dict[str, str] = {}  # tool names by toolUseId
        called: list[str] = []  # the tools called, for the log
        heard: tuple[str, bool, dict[str, Any]] | None = None  # the latest get_answer or get_recent_messages result: the only source of Sam's words
        outcome = "cancelled"  # until the loop ends: the client may go away first
        usage = {"inputTokens": 0, "outputTokens": 0}  # the turn's tokens; zero without a result (cancelled or failed)
        client = MCPClient(url=self.mcp_url, headers=self.headers)  # a fresh session: a server restart or idle timeout only ends old ones
        calls = ThreadPoolExecutor(max_workers=1)  # the session's blocking start and stop, one after the other, off the event loop
        try:  # the session's end and the log line, however the turn ends
            try:  # the session and the Strands loop
                tools = await asyncio.wrap_future(calls.submit(connect, client))  # initialize and tools/list; raises when the server is down or refuses
                listed = {tool.tool_name for tool in tools}  # the only names the log may carry
                agent = Agent(model=self.model, tools=tools, system_prompt=POLICY, callback_handler=None)  # fresh per turn; prints nothing
                async for event in agent.stream_async(text):  # model calls and tool runs
                    for block in event["message"]["content"] if "message" in event else []:  # a new message: the model's or the tools'
                        if "toolUse" in block:  # the model calls a tool; it runs after this
                            use = block["toolUse"]  # name, id and input
                            names[use["toolUseId"]] = use["name"]  # for its result
                            called.append(use["name"] if use["name"] in listed else "unknown")  # for the log: the model may make a name up
                            yield ("tool_call", {"name": use["name"], "input": use["input"]})  # shown as a chip
                        elif "toolResult" in block:  # the tool finished
                            result = block["toolResult"]  # its status
                            name, ok = names[result["toolUseId"]], result["status"] == "success"  # which tool, and whether it worked
                            if name in SAM_TOOLS:  # Sam's words, or that there are none
                                heard = (name, ok, result.get("structuredContent") or {})  # newest wins, as in mock_model.plan()
                            yield ("tool_result", {"name": name, "ok": ok})  # never its content
                    if "result" in event:  # the final answer
                        usage = event["result"].metrics.accumulated_usage  # every model call of this fresh Agent, so the whole turn
                        speech = speak("".join(b.get("text", "") for b in event["result"].message["content"]), heard)  # its text blocks, guarded
                        if speech:  # something to say
                            yield ("speech", {"text": speech})  # for the caregiver
                outcome = "ok"  # the loop ended
            except Exception as error:  # noqa: BLE001 - any failure of the session, the model or a tool ends the turn with an error event
                outcome = type(error).__name__  # the type only: messages may quote the caregiver
                yield ("error", {"message": "The agent could not finish this turn."})  # the panel shows it
            yield ("done", {})  # always last
        finally:  # finished, failed or cancelled
            closing = asyncio.wrap_future(calls.submit(close, client))  # queued after connect, so a session still opening is closed too
            calls.shutdown(wait=False)  # its thread ends after the close
            log("turn.done", mode=self.config.mode, tools=called, outcome=outcome, input_tokens=usage["inputTokens"], output_tokens=usage["outputTokens"], duration_ms=round((time.monotonic() - started) * 1000))  # no text; before the wait below, which a cancelled turn may not finish
            await asyncio.shield(closing)  # the session ends before the stream does; a cancelled turn stops waiting, but the close still runs


def connect(client: MCPClient) -> list[Any]:  # opens a session and lists its tools; it blocks, so turns run it in their thread
    client.start()  # initialize, in Strands' background thread
    return client.list_tools_sync()  # one page: the server lists all four at once


def close(client: MCPClient) -> None:  # ends a session; safe when it is closed already or never opened
    try:  # DELETE /mcp and the background thread
        client.stop(None, None, None)  # no exception to report
    except RuntimeError:  # the connection had already closed
        pass  # nothing left to end


def speak(said: str, heard: tuple[str, bool, dict[str, Any]] | None) -> str:  # what the agent may say: never an answer the TV didn't commit
    if heard is not None:  # a tool returned Sam's words, or that there are none
        return next_step(*heard)  # composed by code from that result, never in the model's own words
    said = THINKING.sub("", said).strip()  # the model's speech without its reasoning
    return NOT_YET if ATTRIBUTION.search(said) else said  # an attribution with no result behind it is never spoken


def explain(error: BaseException, url: str) -> str:  # a start-up failure in words
    status = find(error, httpx.HTTPStatusError)  # the server answered with an error
    if status is not None and status.response.status_code in (401, 403):  # the token: missing, wrong, or the device token
        return f"the MCP server at {url} refused SVAVAK_AGENT_TOKEN (HTTP {status.response.status_code}): use the server's agent token from the repository's .env"  # what to do
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
