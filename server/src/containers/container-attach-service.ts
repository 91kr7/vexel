// Attach session over the Engine API (REQ-35, REQ-36): hijacks the running
// container's own stdio into a raw duplex stream, relays terminal resize, and
// detaches by destroying only the hijacked socket — never stopping or killing
// the container.
import { getEngineClient } from "../connectivity/connection-status-service.js";
import type { InteractiveSession, InteractiveSessionHandlers } from "./container-exec-service.js";

export async function startAttachSession(containerId: string, handlers: InteractiveSessionHandlers): Promise<InteractiveSession> {
  const engine = getEngineClient();
  const { socket } = await engine.hijack(`/containers/${encodeURIComponent(containerId)}/attach?stream=1&stdin=1&stdout=1&stderr=1`);

  let closed = false;
  socket.on("data", (chunk: Buffer) => {
    if (!closed) handlers.onData(chunk);
  });
  socket.on("error", (error: Error) => {
    if (!closed) handlers.onError(error.message);
  });
  socket.on("close", () => {
    if (closed) return;
    closed = true;
    handlers.onExit(null);
  });

  return {
    write: (data: Buffer) => {
      if (!closed) socket.write(data);
    },
    resize: (cols: number, rows: number) => {
      engine.request(`/containers/${encodeURIComponent(containerId)}/resize?h=${rows}&w=${cols}`, { method: "POST" }).catch(() => undefined);
    },
    close: () => {
      // Detaching must never stop the container: only our side of the
      // hijacked socket is destroyed, no stop/kill request is ever issued.
      if (closed) return;
      closed = true;
      socket.destroy();
      handlers.onExit(null);
    },
  };
}
