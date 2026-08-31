---
module: timing-scale
component: Suite timing configuration
type: configuration
---

# Suite timing configuration

**Purpose** → the factor each automated pass runs the product at. One line per pass, beside the
other variables that already configure the process a pass starts.

## Contract

- the Playwright suite's web server (`client/playwright.config.ts`, `webServer.env`) → started with
  `VEXEL_TIMING_SCALE` at `0.2`, beside `PORT`, `VEXEL_DATA_DIR` and `VEXEL_DOCKER_LOG`
  - the browser gets the same `0.2` from the endpoint, so both processes of a run share one clock
- the daemon-backed server passes (`server/package.json`, `test:api` and `test:exclusive`) → run with
  `VEXEL_TIMING_SCALE=0.2` inline, beside `VEXEL_DOCKER_LOG` and `VEXEL_DATA_DIR`
- the server unit pass (`test:unit`) → **the factor is left unset**, so it runs at `1`

## Rules and invariants

- `test:unit` is deliberately the exception: the tests that pin a shipped cadence value — the
  sampling interval asserted at `10000` — exist to measure the shipped value, and a scaled pass
  would have them measure something else. They stay green with no edit of their own.
- The factor is configured on the process a suite starts, never inside a spec. No check writes a
  scaled figure of its own, so changing the factor is one edit per pass rather than a search through
  the specs.
- The scaled passes exercise the delivered artefacts: the client bundle is identical whatever the
  factor, and only the configuration of the process serving it differs.

## Requirements served

- plan-docker_management_app-timing_scale/REQ-18
- plan-docker_management_app-timing_scale/REQ-19
- plan-docker_management_app-timing_scale/REQ-20
