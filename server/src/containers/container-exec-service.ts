// Exec session over the Engine API (REQ-34, REQ-36): creates an exec instance
// for the chosen command/shell, user and working directory, hijacks its start
// into a raw duplex tty stream, relays terminal resize and tears the exec'd
// process down on close.
import { getEngineClient } from "../connectivity/connection-status-service.js";

// End-of-transmission: writing it to the exec's stdin before ending the
// socket is what actually makes the exec'd shell exit — `destroy()`/`end()`
// alone leave it running on the daemon forever (confirmed: `GET
// /exec/{id}/json` keeps reporting `Running: true` without it).
const END_OF_TRANSMISSION = Buffer.from([0x04]);

export interface ExecLaunchOptions {
  cmd: string[];
  user?: string;
  workingDir?: string;
}

export interface InteractiveSessionHandlers {
  onData: (chunk: Buffer) => void;
  onExit: (exitCode: number | null) => void;
  onError: (message: string) => void;
}

export interface InteractiveSession {
  write(data: Buffer): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

export async function startExecSession(
  containerId: string,
  options: ExecLaunchOptions,
  handlers: InteractiveSessionHandlers,
): Promise<InteractiveSession> {
  const engine = getEngineClient();
  const created = await engine.request(`/containers/${encodeURIComponent(containerId)}/exec`, {
    method: "POST",
    body: JSON.stringify({
      Cmd: options.cmd,
      User: options.user,
      WorkingDir: options.workingDir,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    }),
  });
  const execId = (JSON.parse(created.body) as { Id: string }).Id;

  const { socket } = await engine.hijack(`/exec/${encodeURIComponent(execId)}/start`, {
    body: JSON.stringify({ Detach: false, Tty: true }),
  });

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
    readExitCode(execId).then(handlers.onExit);
  });

  return {
    write: (data: Buffer) => {
      if (!closed) socket.write(data);
    },
    resize: (cols: number, rows: number) => {
      engine.request(`/exec/${encodeURIComponent(execId)}/resize?h=${rows}&w=${cols}`, { method: "POST" }).catch(() => undefined);
    },
    close: () => {
      if (closed) return;
      closed = true;
      if (socket.writable) {
        socket.write(END_OF_TRANSMISSION);
        socket.end();
      } else {
        socket.destroy();
      }
      handlers.onExit(null);
    },
  };
}

async function readExitCode(execId: string): Promise<number | null> {
  try {
    const response = await getEngineClient().request(`/exec/${encodeURIComponent(execId)}/json`);
    const payload = JSON.parse(response.body) as { ExitCode?: number | null };
    return payload.ExitCode ?? null;
  } catch {
    return null;
  }
}
