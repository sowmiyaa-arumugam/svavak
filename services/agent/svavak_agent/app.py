# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# The HTTP interface (plan §4.5): POST /agent/turn streams the turn as server-sent events to the studio's caregiver
# panel, on 127.0.0.1:8790, with Host and Origin allow-lists; and main(), the entry point.

import json  # SSE data
import sys  # exit with a message
from collections.abc import AsyncIterator  # the SSE generator's type
from typing import Any  # ASGI values

import uvicorn  # the ASGI server
from botocore.exceptions import BotoCoreError  # an unknown or signed-out AWS profile in live mode
from starlette.applications import Starlette  # the app
from starlette.datastructures import Headers  # request headers in the guard
from starlette.middleware import Middleware  # middleware entries
from starlette.middleware.cors import CORSMiddleware  # CORS for the studio
from starlette.requests import Request  # the endpoint's request
from starlette.responses import JSONResponse, PlainTextResponse, Response, StreamingResponse  # responses
from starlette.routing import Route  # the one route

from .config import HOST, MCP_URL, PORT, load_config, read_env  # settings
from .service import AgentService, StartupError, log  # the agent

ALLOWED_HOSTS = ("localhost", "127.0.0.1")  # Host names accepted, any port (DNS-rebinding protection)
STUDIO = "http://localhost:5173"  # the studio, the only browser origin allowed
MAX_TEXT = 500  # longest caregiver text accepted
BAD_BODY = 'Send JSON {"text": "..."}: a non-empty string of at most 500 characters'  # the 400's message


class Guard:  # pure ASGI, so the SSE stream passes through unbuffered
    def __init__(self, app: Any) -> None:  # wraps the rest of the app
        self.app = app  # the next layer

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:  # every request
        if scope["type"] == "http":  # not lifespan
            headers = Headers(scope=scope)  # the request's headers
            host = headers.get("host", "").partition(":")[0]  # "127.0.0.1:8790" to "127.0.0.1"
            origin = headers.get("origin")  # browsers send it; other clients usually do not
            if host not in ALLOWED_HOSTS or origin not in (None, STUDIO):  # another name, or another site's page
                await PlainTextResponse("Forbidden", status_code=403)(scope, receive, send)  # refused before CORS or the agent
                return  # done
        await self.app(scope, receive, send)  # allowed


def create_app(service: AgentService) -> Starlette:  # the app around a started service
    async def turn(request: Request) -> Response:  # POST /agent/turn
        try:  # the body must be JSON
            body = await request.json()  # parsed
        except (ValueError, RecursionError):  # not JSON, or nested too deeply
            body = None  # refused below
        text = body.get("text") if isinstance(body, dict) else None  # the caregiver's words
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:  # missing, empty or too long
            return JSONResponse({"error": BAD_BODY}, status_code=400)  # says what is expected
        return StreamingResponse(sse(service.turn(text)), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})  # one frame per event

    return Starlette(  # one route behind the guard and CORS
        routes=[Route("/agent/turn", turn, methods=["POST"])],  # POST only
        middleware=[  # first is outermost
            Middleware(Guard),  # Host and Origin: 403 before anything else
            Middleware(CORSMiddleware, allow_origins=[STUDIO], allow_methods=["POST"], allow_headers=["Content-Type"]),  # the studio only
        ],  # end of the middleware
        max_body_size=4096,  # 413 beyond 4 KiB, ample for 500 characters; never buffered whole
    )  # end of the app


async def sse(events: AsyncIterator[tuple[str, dict[str, Any]]]) -> AsyncIterator[str]:  # (event, data) pairs to SSE frames
    async for name, data in events:  # tool_call, tool_result, speech, error, done
        yield f"event: {name}\ndata: {json.dumps(data)}\n\n"  # json.dumps never writes a newline


def main() -> None:  # python -m svavak_agent
    try:  # settings, model and MCP session
        config = load_config(read_env())  # from the repository's .env and the environment
        service = AgentService(config, MCP_URL)  # live mode resolves the AWS profile here
        tools = service.start()  # connects and lists the tools
    except (ValueError, StartupError, BotoCoreError) as error:  # a setting, the server or the profile
        sys.exit(f"svavak-agent: {error}")  # the reason, without a traceback
    log("agent.started", url=f"http://{HOST}:{PORT}", mode=config.mode, tools=tools)  # never the token
    try:  # serve until Ctrl+C
        uvicorn.run(create_app(service), host=HOST, port=PORT)  # loopback only
    finally:  # always
        service.stop()  # ends the MCP session
