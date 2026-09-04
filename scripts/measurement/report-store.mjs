// Where every measurement writes its report file, and the only place deciding
// how one is named and how many are kept.
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

const keptReports = 10;

function stamp(at) {
  const part = (value, width = 2) => String(value).padStart(width, "0");
  return [
    `${part(at.getFullYear(), 4)}-${part(at.getMonth() + 1)}-${part(at.getDate())}`,
    `${part(at.getHours())}${part(at.getMinutes())}${part(at.getSeconds())}`,
  ].join("-");
}

function keepTheMostRecent(directory) {
  const files = readdirSync(directory)
    .filter((name) => statSync(join(directory, name)).isFile())
    .sort()
    .reverse();
  for (const name of files.slice(keptReports)) {
    rmSync(join(directory, name), { force: true });
  }
}

export function writeReport(measurement, contents, { at = new Date(), extension = "md" } = {}) {
  const directory = join(repositoryRoot, "reports", measurement);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${measurement}-${stamp(at)}.${extension}`);
  writeFileSync(path, contents);
  keepTheMostRecent(directory);
  return relative(repositoryRoot, path);
}
