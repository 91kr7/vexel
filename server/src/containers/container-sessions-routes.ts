// Interactive-session WebSocket endpoint (REQ-34, REQ-35, REQ-36): upgrades
// `/api/containers/:id/exec` and `/api/containers/:id/attach` into a duplex
// channel. Binary frames carry raw terminal I/O both ways; JSON text frames
// carry the client's resize requests and the server's exit/error notices.
// The underlying exec/attach session is torn down as soon as the socket
// closes, from either end.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { startAttachSession } from "./container-attach-service.js";
import { startExecSession, type InteractiveSession } from "./container-exec-service.js";

const EXEC_PATTERN = /^\/api\/containers\/([^/]+)\/exec$/;
const ATTACH_PATTERN = /^\/api\/containers\/([^/]+)\/attach$/;

const wss = new WebSocketServer({ noServer: true });

/** Claims the upgrade request if it targets an exec/attach session, false otherwise. */
export function handleContainerSessionUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
  const url = new URL(request.url ?? "", "http://container-sessions");
  const execMatch = EXEC_PATTERN.exec(url.pathname);
  const attachMatch = ATTACH_PATTERN.exec(url.pathname);
  if (!execMatch && !attachMatch) return false;

  wss.handleUpgrade(request, socket, head, (ws) => {
    if (execMatch) void runExecSession(ws, decodeURIComponent(execMatch[1]), url.searchParams);
    else void runAttachSession(ws, decodeURIComponent(attachMatch![1]));
  });
  return true;
}

async function runExecSession(ws: WebSocket, containerId: string, params: URLSearchParams): Promise<void> {
  // Buffering starts immediately (before the exec instance even exists), so a
  // keystroke sent right after the client sees `open` is never lost while the
  // session is still being created.
  const relay = bufferClientFrames(ws);
  try {
    const cmd = params.getAll("cmd");
    const session = await startExecSession(
      containerId,
      { cmd: cmd.length > 0 ? cmd : ["/bin/sh"], user: params.get("user") ?? undefined, workingDir: params.get("workdir") ?? undefined },
      sessionHandlers(ws),
    );
    relay.bind(session);
  } catch (error) {
    failSession(ws, error);
  }
}

async function runAttachSession(ws: WebSocket, containerId: string): Promise<void> {
  const relay = bufferClientFrames(ws);
  try {
    const session = await startAttachSession(containerId, sessionHandlers(ws));
    relay.bind(session);
  } catch (error) {
    failSession(ws, error);
  }
}

function sessionHandlers(ws: WebSocket) {
  return {
    onData: (chunk: Buffer) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk);
    },
    onExit: (exitCode: number | null) => {
      sendControl(ws, { type: "exit", code: exitCode });
      ws.close();
    },
    onError: (message: string) => {
      sendControl(ws, { type: "error", message });
      ws.close();
    },
  };
}

interface PendingRelay {
  /** Hands the now-ready session every frame buffered so far, then relays live. */
  bind(session: InteractiveSession): void;
}

/**
 * Attaches the WebSocket's message/close listeners up front and queues
 * incoming frames until `bind(session)` is called, so nothing sent between
 * the handshake completing and the exec/attach session becoming ready is
 * dropped. A close seen before `bind` closes the session as soon as it binds.
 */
function bufferClientFrames(ws: WebSocket): PendingRelay {
  let session: InteractiveSession | undefined;
  let closed = false;
  const buffered: Array<{ data: RawData; isBinary: boolean }> = [];

  ws.on("message", (data, isBinary) => {
    if (session) handleMessage(session, data, isBinary);
    else buffered.push({ data, isBinary });
  });
  ws.on("close", () => {
    closed = true;
    session?.close();
  });

  return {
    bind: (readySession: InteractiveSession) => {
      session = readySession;
      if (closed) {
        readySession.close();
        return;
      }
      for (const { data, isBinary } of buffered) handleMessage(readySession, data, isBinary);
      buffered.length = 0;
    },
  };
}

function handleMessage(session: InteractiveSession, data: RawData, isBinary: boolean): void {
  if (!isBinary && tryHandleControlMessage(data.toString("utf8"), session)) return;
  session.write(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
}

function tryHandleControlMessage(text: string, session: InteractiveSession): boolean {
  try {
    const message = JSON.parse(text) as { type?: string; cols?: number; rows?: number };
    if (message.type !== "resize" || !message.cols || !message.rows) return false;
    session.resize(message.cols, message.rows);
    return true;
  } catch {
    return false;
  }
}

function failSession(ws: WebSocket, error: unknown): void {
  sendControl(ws, { type: "error", message: (error as Error).message });
  ws.close();
}

function sendControl(ws: WebSocket, message: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}
