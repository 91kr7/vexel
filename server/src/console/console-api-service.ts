// API channel of the raw console (REQ-101): issues an arbitrary Engine API
// call against the active daemon and hands back the status and body exactly as
// the daemon answered them — no parsing, no reformatting, no error mapping.
import { getEngineClient } from "../docker/engine-client.js";
import { parseApiCommandLine } from "./console-command.js";

export interface ConsoleApiResult {
  method: string;
  /** The path actually dialed, version prefix included. */
  path: string;
  status: number;
  body: string;
  contentType?: string;
}

export async function callEngineApi(commandLine: string): Promise<ConsoleApiResult> {
  const request = parseApiCommandLine(commandLine);
  const response = await getEngineClient().requestRaw(request.path, {
    method: request.method,
    ...(request.body ? { body: request.body } : {}),
  });
  return {
    method: request.method,
    path: response.path,
    status: response.statusCode,
    body: response.body,
    ...(response.contentType ? { contentType: response.contentType } : {}),
  };
}
