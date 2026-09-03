---
slug: docker_management_app-timing_scale
date: 2026-09-01
spec: .sdd/analysis/docker_management_app-timing_scale.md
status: validated
---

# Requirements — timing scale

One factor, `VEXEL_TIMING_SCALE`, multiplies every cadence of the product. It multiplies no
tolerance. The operator's process does not set it and gets `1`.

## Feature 1 — The server process runs on a configured clock

| ID | Requirement |
|----|-------------|
| REQ-1 | The server reads `VEXEL_TIMING_SCALE` once, at start-up, and uses `1` when the variable is unset or empty. |
| REQ-2 | The server refuses to start when `VEXEL_TIMING_SCALE` is not a number or falls outside the range 0.1 to 10, and the error names both the variable and the rejected value. |
| REQ-3 | A scaled cadence is never shorter than one millisecond, whatever the factor. |
| REQ-4 | The event grouping window, the demand expiry and the stats sampling interval all run at their declared value multiplied by the factor. |
| REQ-5 | With the variable unset, those three cadences hold exactly the values they hold today, and the unit tests that pin them stay green without being edited. |
| REQ-6 | The server declares the factor in one module, and every scaled cadence in the workspace derives its value from that module. |

## Feature 2 — The browser runs on the same clock

| ID | Requirement |
|----|-------------|
| REQ-7 | The server answers the factor its own process is using, over an API endpoint the browser can call. |
| REQ-8 | The client obtains the factor at bootstrap, before any cadence of the application is evaluated, so the first poll of every list already runs at the scaled interval. |
| REQ-9 | When the factor cannot be obtained, the client runs at `1` and the application still renders. |
| REQ-10 | The eleven client polling cadences run at their declared value multiplied by the factor the client obtained. |
| REQ-11 | With the server at factor `1`, those eleven cadences hold exactly the values they hold today. |
| REQ-12 | The client declares the factor in one module, and every scaled cadence in the workspace derives its value from that module. |
| REQ-13 | The client bundle is the same whatever the factor: the factor is read at runtime and never at build time. |

## Feature 3 — Tolerances stay absolute

| ID | Requirement |
|----|-------------|
| REQ-14 | The seven server tolerances keep the values they hold today, whatever the factor. |
| REQ-15 | Each of those seven declarations states that it is a tolerance and why scaling it would be wrong. |
| REQ-16 | The client's reconnect tolerances keep the values they hold today, whatever the factor. |
| REQ-17 | Each client reconnect tolerance declaration states that it is a tolerance and why scaling it would be wrong. |
| REQ-21 | The wait the client puts on its read of the factor is never multiplied by the factor, and its declaration states that it is a tolerance and why scaling it would be wrong. |

REQ-21 covers the one tolerance this work introduces. It sits in this feature and not in Feature 2
because Feature 2 states what the operator sees (REQ-9: the client renders at `1` when the factor
cannot be obtained), while the census of what is a tolerance, and stays absolute, is kept here.

## Feature 4 — The test suites run on the scaled clock

| ID | Requirement |
|----|-------------|
| REQ-18 | The Playwright suite starts its web server with the factor set, and no spec writes a scaled figure of its own. |
| REQ-19 | The daemon-backed server passes run with the factor set. |
| REQ-20 | The server unit pass runs with the factor unset, so the tests that pin the shipped cadence values still measure the shipped values. |
