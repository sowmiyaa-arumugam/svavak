// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// WsNotifier: sends every stream event to every client connected to GET /v1/stream.

import { WebSocket, type WebSocketServer } from 'ws'; // the WebSocket server
import type { StreamEvent } from '../domain/model.ts'; // event shapes
import type { NotifierPort } from '../ports/index.ts'; // the port

/** Broadcasts JSON events over the WebSocket server's open connections. */
export class WsNotifier implements NotifierPort { // fan-out adapter
  private readonly wss: WebSocketServer; // tracks the connected clients

  constructor(wss: WebSocketServer) { // the server whose clients receive events
    this.wss = wss; // keep it
  } // end of constructor

  publish(event: StreamEvent): number { // to every open connection
    const data = JSON.stringify(event); // one JSON message
    let sent = 0; // connections it went to
    for (const client of this.wss.clients) if (client.readyState === WebSocket.OPEN) { client.send(data); sent++; } // skip closing ones
    return sent; // 0 when no TV is connected
  } // end of publish
} // end of WsNotifier
