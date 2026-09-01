---
id: images-list-inspects-every-image
area: server
severity: medium
cost: at-rest
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# The images list costs one inspect per image, every 3 seconds

**What** → `listImages` reads the listing, then issues one `/images/{id}/json` per image to resolve
a platform string. The cost is `1 + M` Engine calls where M is the number of images on the daemon —
the only list whose cost grows with what the operator has on disk.

**Where** → `server/src/images/images-service.ts:151` (`platforms: await resolvePlatforms(raw.Id)`),
`:158` (`resolvePlatforms`).

**Evidence** → 4 calls with 3 images; 41 with 40. At the 3-second cadence, forty images alone are
**800 Engine calls a minute**.

**Why it matters** → the value being fetched — `linux/arm64` and the like — cannot change for a
given image id. An image id is a content digest: a different platform is a different id. This is the
clearest case in the codebase of paying repeatedly for something immutable.

**Direction** → remember the resolved platform per image id. Nothing needs to invalidate it, which
is what makes this the cheapest large saving available. Sampling reduces how often it is paid but
not what it costs per pass, so this stands on its own.

**Reduced on 2026-09-01, not closed.** the refresh cache (`plan-docker_management_app-refresh_cache`) registers this listing at a 60-second
period, so the `1 + M` pass is paid twenty times less often than the evidence above counted, and
once for every client rather than once each. What it costs per pass is unchanged, which is the
part this entry is about; severity drops from high to medium.
