// What the duplication pass scans and how small a repeated block still counts
// (`.sdd/modules/measurement/specs/quality-duplication-configuration.md`).
import { scopeExtensions, scopeIgnored, scopeRoots } from "./quality-scope.mjs";

export const minimumTokens = 50;

export const duplicationReportName = "jscpd-report.json";

export function duplicationArguments(outputDirectory) {
  return [
    // Absolute, because a path relative to the scanned root cannot tell
    // `client/src/builders` from `server/src/builders`.
    "--absolute",
    "--min-tokens", String(minimumTokens),
    "--pattern", `**/*.{${scopeExtensions.join(",")}}`,
    "--ignore", scopeIgnored.join(","),
    "--reporters", "json,silent",
    "--output", outputDirectory,
    ...scopeRoots,
  ];
}
