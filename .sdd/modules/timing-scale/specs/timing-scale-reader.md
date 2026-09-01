---
module: timing-scale
component: Timing-scale reader
type: client data client
---

# Timing-scale reader

**Purpose** → asks the serving process what clock it is on, at bootstrap, under a bounded wait.

## Contract

- `readTimingScale() → Promise<number>` → the factor to run this page at
  - the endpoint answers a positive, finite `scale` → that number
  - the endpoint refuses (any non-`2xx`) → `1`
  - the request fails, or the body carries no usable number → `1`
  - the answer takes longer than **2 s** → the request is abandoned and the result is `1`
- It never rejects and never throws: every path ends in a number.

## Rules and invariants

- **The 2 s wait is a tolerance and is never multiplied by the factor.** The factor is the very
  thing being read, so scaling this wait by it would have an unknown value shorten its own wait,
  and on the failure path there is no factor to scale by at all. The bound exists for one case: a
  server that accepts the request and never answers must not leave a blank page.
- A server that is not answering is best replied to by the product running its own rhythm, so every
  failure path is `1` rather than an error the operator has to read.
- On one origin and one port the successful case costs a couple of milliseconds, which is the cost
  the bootstrap pays before first paint.

## Requirements served

- plan-docker_management_app-timing_scale/REQ-8
- plan-docker_management_app-timing_scale/REQ-9
- plan-docker_management_app-timing_scale/REQ-21
