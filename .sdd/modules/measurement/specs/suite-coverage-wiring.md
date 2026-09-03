---
module: measurement
component: Suite coverage wiring
type: configuration
---

# Suite coverage wiring

**Purpose** → what makes each suite record the lines it executes, and only when the coverage run asks
for it.

## Contract

- `VEXEL_COVERAGE_DIR` set (the coverage run is the only thing that sets it):
  - the client unit run writes the V8 coverage of `client/src` into
    `<VEXEL_COVERAGE_DIR>/client-unit`;
  - the browser-driven run starts its web server through the *Coverage server entry*, with the
    server's recording directory set to `<VEXEL_COVERAGE_DIR>/e2e-server`;
  - every test of the browser-driven run records what the browser executed, around the test, into
    `<VEXEL_COVERAGE_DIR>/e2e-browser`: one file per test, holding the scripts that came from the
    built client and no other.
- `VEXEL_COVERAGE_DIR` unset: every one of them behaves exactly as it did before this existed — the
  unit run records nothing, the web server is started by the operator's own command with the
  environment it has always had, and no test asks for a browser page it would not otherwise have
  used.

## Rules and invariants

- The suites themselves are never modified for the measurement: what changes is what they record,
  never what they run, in what order, or what they assert.
- A recorded browser script is named by the file on disk it was served from, so the coverage of the
  bundle can be mapped back to `client/src`.

## Dependencies

- *Coverage server entry* (same module) — the web server the browser-driven run starts under
  coverage.
- *Coverage runner* (same module) — the only thing that sets `VEXEL_COVERAGE_DIR`.

## Requirements served

- plan-test_coverage_code_quality/REQ-1
- plan-test_coverage_code_quality/REQ-3
- plan-test_coverage_code_quality/REQ-17
