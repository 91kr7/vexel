// What the quality report measures: the hand-written TypeScript sources of the
// two workspaces (`.sdd/modules/measurement/specs/quality-scope.md`).
export const scopeRoots = ["client/src", "server/src"];

export const scopeExtensions = ["ts", "tsx"];

export const scopeFiles = scopeRoots.flatMap((root) => scopeExtensions.map((extension) => `${root}/**/*.${extension}`));

// Type declarations carry no logic to measure, and no author wrote the build's.
export const scopeIgnored = ["**/*.d.ts"];
