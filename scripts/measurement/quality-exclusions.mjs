// The findings that report a deliberate rule of this project, written from what
// the first run with no exclusion at all reported
// (`.sdd/modules/measurement/specs/quality-exclusion-list.md`).
export const exclusions = [
  {
    rule: "react-hooks/exhaustive-deps",
    paths: ["client/src"],
    reason: "The client is linted by oxlint, and these are oxlint's own disable directives. ESLint is a tool of this report alone, does not load that plugin, and reports each directive as a rule it does not know.",
  },
  {
    rule: "sonarjs/no-os-command-from-path",
    paths: ["server/src/docker/transport.ts"],
    reason: "The product reaches the daemon through the operator's own `docker` and `ssh`, resolved from their PATH. Pinning a path would be pinning the operator's installation.",
  },
  {
    rule: "sonarjs/no-clear-text-protocols",
    paths: ["server/src/containers/container-sessions-routes.ts", "server/src/containers/container-stats-subscription-routes.ts"],
    reason: "A placeholder base for parsing the path of an upgrade request. The client calls the API origin-relative, so what arrives is a path and never a URL, and nothing is transferred over that base.",
  },
  {
    rule: "sonarjs/hashing",
    paths: ["server/src/image-analysis/changeset-service.ts", "server/src/image-analysis/image-diff-service.ts"],
    reason: "A content digest, telling two entries of a layer apart. Nothing is authenticated or stored with it.",
  },
  {
    rule: "sonarjs/pseudo-random",
    paths: ["client/src/data/use-console.ts", "client/src/ui/feedback/Toast.tsx"],
    reason: "The id of a console entry and of a toast, unique within one browser tab. Neither is a secret nor leaves the tab.",
  },
  {
    rule: "sonarjs/no-hardcoded-ip",
    paths: ["client/src/volumes-networks/NetworksPanel.tsx"],
    reason: "Example subnets in the placeholder text of the network form: GUI text shown to the operator, not an address the application uses.",
  },
];

export function excludedBy(finding) {
  return exclusions.find((exclusion) =>
    exclusion.rule === finding.rule && exclusion.paths.some((path) => finding.path === path || finding.path.startsWith(`${path}/`)));
}
