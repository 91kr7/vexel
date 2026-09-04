// The ESLint configuration of the quality report alone: nothing else reads it,
// and the client is still linted by oxlint
// (`.sdd/modules/measurement/specs/quality-rule-configuration.md`).
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { scopeFiles, scopeIgnored } from "./quality-scope.mjs";

export const limits = {
  cognitiveComplexity: 15,
  fileLines: 400,
  functionLines: 80,
};

export default [
  { ignores: scopeIgnored },
  {
    files: scopeFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { sonarjs },
    rules: {
      ...sonarjs.configs.recommended.rules,
      // Zero, so every function reports its own figure and the report can state a
      // file's complexity instead of only its excesses; `limits` holds the limit.
      "sonarjs/cognitive-complexity": ["warn", 0],
      "max-lines": ["warn", { max: limits.fileLines, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: limits.functionLines, skipBlankLines: true, skipComments: true }],
    },
  },
];
