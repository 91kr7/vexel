# check-budgets — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Check-budget conformance check | build check | `client/scripts/check-budget-conformance.mjs` | Build-time guard that no check declares a step budget larger than the budget of the test that runs it, measured against the default budget read from `client/playwright.config.ts` | `specs/check-budget-conformance-check.md` |
| Clean-daemon conformance check | build check | `scripts/check-clean-daemon-conformance.mjs` | Build-time guard, over both test trees, that every daemon-backed test file empties Docker before it runs: an end-to-end spec calls `cleanDaemonBeforeAll()` at its top level with no `test` call ahead of it, and `test:api` still preloads `server/test/support/api-lifecycle.ts`; no exception marker, and the tree to scan is its first argument | `specs/clean-daemon-conformance-check.md` |
