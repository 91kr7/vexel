---
module: coverage
component: Coverage map
type: configuration
---

# Coverage map

**Purpose** → the product's own declaration of what it covers of Docker: one entry per capability
area, each stating whether it has a dedicated screen, is reachable only through the raw console, or
is outside what this product is. Held as data so a change of coverage is one line here rather than
an edit to a screen.

## Contract

- `coverageAreas: CoverageArea[]` — the declaration, in the order it is displayed.
- `CoverageArea`: `{ id, name, summary, state, screenId?, command?, reason? }`
  - `id` — stable, unique key of the area.
  - `name` — the capability area named as an operator would name it.
  - `summary` — what the area covers, in one line.
  - `state`: `"dedicated-screen" | "console-only" | "not-applicable"`.
  - `screenId` — the screen covering the area, as a navigation screen id; present exactly when
    `state` is `dedicated-screen`.
  - `command` — the docker command that reaches the area from the raw console; present exactly when
    `state` is `console-only`.
  - `reason` — why the area has no screen of its own; present exactly when `state` is not
    `dedicated-screen`.
- `countCoverage(areas): CoverageCounts` — `{ total, dedicatedScreen, consoleOnly, notApplicable }`,
  the number of entries in each state; the three states sum to `total`.
- The declaration carries, at minimum, these `console-only` entries — the capabilities the product
  withdrew or never modelled, each with its reason:
  ```
  image building                    docker build · docker buildx build      (departure One)
  swarm stack deployment            docker stack deploy                     (departure Three)
  build-cache export and import     docker buildx build --cache-to/from     (departure Three)
  TCP+TLS context creation          docker context create --docker "…"      (departure Three)
  vulnerability scanning (Scout)    docker scout cves · docker sbom         (never modelled)
  ```

## Rules and invariants

- Every `screenId` names an entry of the navigation data: an area cannot claim a screen that does
  not exist.
- Every area whose `state` is not `dedicated-screen` carries a `reason`: a gap is never stated
  without why it is a gap. That is the whole point of the map — this screen is where the
  "100% of Docker" claim is either honest or a lie.
- Every capability area covered by one of the application's screens appears here with that screen:
  the map is the inventory of the product, not a subset of it.
- The map holds no daemon reading and no state: it is a constant of the application, true before
  anything is fetched, and identical whichever daemon is connected.
- The four capabilities withdrawn on 2026-08-07 (image building, swarm stack deployment,
  build-cache export/import, TCP+TLS context creation) are declared `console-only` and never
  `not-applicable`: each is genuinely reachable by typing its command in the raw console.
- `not-applicable` is reserved for what neither channel reaches at all (Docker Desktop's own
  application settings) or what has no meaning for a daemon manager (`docker init`, which
  interactively writes files into a working directory of the machine it runs on).

## Requirements served

- plan-docker_management_app/REQ-105
