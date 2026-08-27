---
id: volumes-list-polls-system-df
area: server
severity: high
cost: at-rest
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# The volumes list polls `/system/df` every 3 seconds

**What** → `listVolumes` fans one browser request out into three Engine calls, one of which is
`/system/df` — the heaviest endpoint the daemon exposes, since it walks the whole storage. The
volumes list is mounted in the shell, so this runs on every screen, always.

**Where** → `server/src/volumes/volumes-service.ts:58` (`readVolumeSizes`), called from
`:101` (`listVolumes`) and from `getVolumeInspect`.

**Evidence** → measured 73 ms per call on this machine, twenty times a minute, with no cache on
either side: eleven consecutive reads three seconds apart gave 70, 79, 71, 74, 71, 73, 73, 74, 75,
73, 72 ms.

**Why it matters** → the decision not to poll this endpoint was already taken elsewhere in the same
codebase, and written down. `client/src/data/use-disk-usage.ts` says in its own comment:
*"`/system/df` is an expensive reading on a large host, so unlike the list hooks this one does not
poll"*. The volumes list contradicts it one directory over — for the single datum that ages most
slowly, a volume's size.

**Direction** → separate the size reading from the volume listing and give it a cadence of its own,
or derive it on demand. Related: [[no-server-side-sampling-or-dedup]].
