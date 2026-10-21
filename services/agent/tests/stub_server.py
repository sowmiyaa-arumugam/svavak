# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# A stub of the server's MCP endpoint for the tests: the Python SDK's FastMCP with the same four tool names, input types,
# limits and required fields (services/server/src/interfaces/mcp.ts), a bearer-token check, on a free loopback port in a thread.

import asyncio  # get_answer's hold
import hmac  # constant-time token comparison
import itertools  # question ids
import json  # tool outputs as JSON text
import threading  # the server's thread
import time  # start-up wait
from typing import Annotated, Any, Literal, Self  # parameter types

import uvicorn  # runs the stub
from mcp.server.fastmcp import FastMCP  # the SDK's server
from mcp.types import CallToolResult, TextContent, ToolAnnotations  # tool results and hints
from pydantic import AwareDatetime, Field, StringConstraints  # input constraints, as the server's zod schemas
from pydantic.json_schema import SkipJsonSchema  # an optional input without a null branch, as zod's .optional()
from starlette.datastructures import Headers  # request headers
from starlette.responses import JSONResponse  # the 401

Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]  # question: trimmed, 1 to 200
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]  # asked_by and each option: 1 to 40
Fact = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120, pattern=r"^[^<>]*$")]  # 1 to 120, no < or >


def ok(output: dict[str, Any]) -> CallToolResult:  # the server's result shape: JSON text plus structuredContent
    return CallToolResult(content=[TextContent(type="text", text=json.dumps(output, separators=(",", ":")))], structuredContent=output)  # as JSON.stringify


def refused(message: str) -> CallToolResult:  # a tool error with exactly this text
    return CallToolResult(content=[TextContent(type="text", text=message)], isError=True)  # as the server's NotFoundError


class StubServer:  # `with StubServer(token) as stub:` serves on stub.url
    def __init__(self, token: str, port: int = 0) -> None:  # builds the server; nothing listens yet; port 0 lets the OS choose, a given one restarts a stopped stub
        self.calls: list[tuple[str, dict[str, Any]]] = []  # every tool call, with its parsed arguments (None left out)
        self.requests: list[tuple[str, str | None]] = []  # every HTTP request: its method and Mcp-Session-Id (None for initialize)
        self.answer: str | None = "Tea"  # get_answer's answer_text; None keeps it pending
        self.hold = False  # True makes get_answer wait until it is False again, as the server's long-poll waits for a press
        self.messages: list[dict[str, Any]] = []  # get_recent_messages' list, oldest first
        self.ids = itertools.count(1)  # q-1, q-2, ...
        self.questions: set[str] = set()  # issued question ids
        self.expected = f"Bearer {token}".encode()  # the only Authorization accepted
        settings = uvicorn.Config(self.asgi, host="127.0.0.1", port=port, interface="asgi3", lifespan="on", log_level="warning", timeout_graceful_shutdown=1)  # a bound method needs the interface named
        self.server = uvicorn.Server(settings)  # stopped through should_exit
        self.thread = threading.Thread(target=self.server.run, name="stub-mcp", daemon=True)  # off the test's thread
        self.app = self.tools().streamable_http_app()  # a fresh FastMCP: its session manager runs once per instance
        self.port = port  # set once listening
        self.url = ""  # set once listening

    def record(self, name: str, **args: Any) -> None:  # notes a call
        self.calls.append((name, {k: v for k, v in args.items() if v is not None}))  # unset optional inputs left out

    def tools(self) -> FastMCP:  # the four tools of plan Table 16, as the server declares them
        mcp = FastMCP("svavak-stub", log_level="WARNING")  # loopback host: FastMCP allows Host 127.0.0.1:<any port>

        @mcp.tool(title="Ask a question on the TV", annotations=ToolAnnotations(readOnlyHint=False, idempotentHint=False))  # as the server
        def ask_question(  # puts a question on the TV
            question: Annotated[Question, Field(description="The question, at most 200 characters")],  # the text
            asked_by: Annotated[Short, Field(description='Who is asking, shown as "<asked_by> asks"')],  # the asker
            options: Annotated[list[Short], Field(min_length=1, max_length=6, description="Up to 6 answers to choose from, each at most 40 characters")] | SkipJsonSchema[None] = None,  # optional choices
            urgency: Annotated[Literal["normal", "high"], Field(description="normal or high")] = "normal",  # how urgent
        ) -> CallToolResult:  # the result as the server sends it
            """Shows a short question on the TV of the person who answers with a single switch."""  # the tool description
            self.record("ask_question", question=question, asked_by=asked_by, options=options, urgency=urgency)  # noted
            question_id = f"q-{next(self.ids)}"  # a new id
            self.questions.add(question_id)  # known from now on
            return ok({"question_id": question_id, "delivered": True})  # a TV is connected

        @mcp.tool(title="Get the answer", annotations=ToolAnnotations(readOnlyHint=True))  # as the server
        async def get_answer(  # the answer; async, so a hold does not block the stub's event loop
            question_id: Annotated[str, Field(min_length=1, max_length=64, description="The question_id from ask_question")],  # which question
            wait_seconds: Annotated[int, Field(ge=0, le=25, strict=True, description="How long to wait for the answer, 0 to 25 whole seconds")] = 0,  # whole seconds
        ) -> CallToolResult:  # the result as the server sends it
            """Waits for or fetches the answer to a question from ask_question."""  # the tool description
            self.record("get_answer", question_id=question_id, wait_seconds=wait_seconds)  # noted
            while self.hold:  # a test is reading the frames sent so far
                await asyncio.sleep(0.01)  # wait for the release
            if question_id not in self.questions:  # never issued
                return refused(f"question {question_id} not found")  # as the server's NotFoundError
            if self.answer is None:  # nobody pressed
                return ok({"status": "pending", "answer_text": None, "answered_at": None, "clicks": None})  # still open
            return ok({"status": "answered", "answer_text": self.answer, "answered_at": "2026-10-19T10:05:00.000Z", "clicks": 1})  # Sam's choice

        @mcp.tool(title="Get recent messages", annotations=ToolAnnotations(readOnlyHint=True))  # as the server
        def get_recent_messages(  # what Sam said lately
            since: Annotated[AwareDatetime, Field(description="Only messages after this time (ISO 8601)")] | SkipJsonSchema[None] = None,  # optional filter
            limit: Annotated[int, Field(ge=1, le=20, strict=True, description="At most this many of the latest messages, 1 to 20")] = 20,  # optional cap
        ) -> CallToolResult:  # the result as the server sends it
            """Lists what the person said recently, oldest first."""  # the tool description
            self.record("get_recent_messages", since=since, limit=limit)  # noted
            return ok({"messages": self.messages[-limit:]})  # the latest, oldest first

        @mcp.tool(title="Add a profile fact")  # as the server: no hints
        def add_profile_fact(  # context for the reply suggestions
            fact: Annotated[Fact, Field(description="The fact, at most 120 characters")],  # the text
            category: Annotated[Literal["likes", "dislikes", "people", "routines", "other"], Field(description="likes, dislikes, people, routines or other")],  # what kind
        ) -> CallToolResult:  # the result as the server sends it
            """Remembers a fact about the person that helps suggest replies."""  # the tool description
            self.record("add_profile_fact", fact=fact, category=category)  # noted
            return ok({"fact_id": f"f-{len(self.calls)}"})  # a new id

        return mcp  # ready to serve

    async def asgi(self, scope: Any, receive: Any, send: Any) -> None:  # the token check in front of FastMCP's app
        if scope["type"] == "http":  # lifespan passes through, or FastMCP's session manager never starts
            headers = Headers(scope=scope)  # the request's headers
            self.requests.append((scope["method"], headers.get("mcp-session-id")))  # noted, for the session tests
            supplied = (headers.get("authorization") or "").encode()  # the bearer header
            if not hmac.compare_digest(supplied, self.expected):  # missing or wrong token
                problem = {"type": "about:blank", "title": "Unauthorized", "status": 401, "detail": "missing or wrong agent token"}  # as the server
                await JSONResponse(problem, status_code=401, headers={"WWW-Authenticate": "Bearer"}, media_type="application/problem+json")(scope, receive, send)  # 401
                return  # refused
        await self.app(scope, receive, send)  # FastMCP

    def __enter__(self) -> Self:  # starts listening
        self.thread.start()  # uvicorn in the background
        deadline = time.monotonic() + 10  # start-up budget
        while not self.server.started:  # set after lifespan start-up and the bind
            if not self.thread.is_alive() or time.monotonic() > deadline:  # crashed or stuck
                raise RuntimeError("the stub MCP server did not start")  # fail the test
            time.sleep(0.01)  # poll
        self.port = self.server.servers[0].sockets[0].getsockname()[1]  # the port given, or the one the OS chose
        self.url = f"http://127.0.0.1:{self.port}/mcp"  # where clients connect
        return self  # for `as`

    def __exit__(self, *exc_info: object) -> None:  # stops it
        self.server.should_exit = True  # uvicorn polls this every 0.1 s
        self.thread.join(timeout=15)  # open streams get timeout_graceful_shutdown
