# check-budgets — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Check-budget conformance check | build check | `client/scripts/check-budget-conformance.mjs` | Build-time guard that no check declares a step budget larger than the budget of the test that runs it, measured against the default budget read from `client/playwright.config.ts` | `specs/check-budget-conformance-check.md` |
