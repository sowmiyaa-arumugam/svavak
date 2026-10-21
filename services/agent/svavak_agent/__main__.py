# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Entry point: `uv run python -m svavak_agent` from services/agent.

from .app import main  # starts the agent

main()  # serve on 127.0.0.1:8790
