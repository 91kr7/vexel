/**
 * Removes the Docker objects left behind by test runs — including runs that were
 * killed before their own cleanup could execute.
 *
 * Scoped to the ownership label the fixtures stamp, so an object the operator
 * created is never a candidate: a run that finds nothing labelled removes
 * nothing at all. Containers go first, so the volumes, networks and images they
 * hold are free by the time their turn comes.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { OWNER_LABEL } from "./fixtures.js";

const execFileAsync = promisify(execFile);

async function listOwned(args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("docker", [...args, "-q", "--filter", `label=${OWNER_LABEL}`]).catch(() => ({
    stdout: "",
  }));
  return stdout.split("\n").filter((id) => id.length > 0);
}

async function sweep(kind: string, listArgs: string[], removeArgs: string[]): Promise<void> {
  const ids = await listOwned(listArgs);
  if (ids.length === 0) return;
  // One at a time for the kinds a single refusal would otherwise abort: a volume
  // still mounted, or an image still referenced by a container outside the run.
  for (const id of ids) {
    await execFileAsync("docker", [...removeArgs, id]).catch(() => undefined);
  }
  console.log(`swept ${ids.length} leftover test ${kind}(s)`);
}

// `-v` so a container's anonymous volumes go with it: Docker attaches one per
// `VOLUME` an image declares, and it carries no label of ours, so nothing else
// could ever recognise it as ours.
await sweep("container", ["ps", "-a"], ["rm", "-fv"]);
await sweep("volume", ["volume", "ls"], ["volume", "rm"]);
await sweep("network", ["network", "ls"], ["network", "rm"]);
await sweep("image", ["images"], ["rmi", "-f"]);
