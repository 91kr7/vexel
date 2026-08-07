/**
 * Removes the containers left behind by test runs — including runs that were
 * killed before their own cleanup could execute.
 *
 * Scoped to the ownership label the fixtures stamp, so an object the operator
 * created is never a candidate: a run that finds nothing labelled removes
 * nothing at all.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { OWNER_LABEL } from "./fixtures.js";

const execFileAsync = promisify(execFile);

const { stdout } = await execFileAsync("docker", ["ps", "-aq", "--filter", `label=${OWNER_LABEL}`]).catch(() => ({
  stdout: "",
}));

const ids = stdout.split("\n").filter((id) => id.length > 0);
if (ids.length > 0) {
  await execFileAsync("docker", ["rm", "-f", ...ids]).catch(() => undefined);
  console.log(`swept ${ids.length} leftover test container(s)`);
}
