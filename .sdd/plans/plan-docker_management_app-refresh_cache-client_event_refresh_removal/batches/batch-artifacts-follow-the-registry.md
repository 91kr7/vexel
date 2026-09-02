---
batch: batch-artifacts-follow-the-registry
feature: The artifacts describe what the run's registry actually holds
closed_req: [REQ-76, REQ-77, REQ-78]
depends: [batch-clean-daemon-recorded]
---

# Batch — The artifacts describe what the run's registry actually holds

Three divergences, all text against code, found by the closing pass of the batch before this one.
**No behaviour changes here.** Two of the five interventions touch a source file, and both touch a
comment inside it and nothing else.

Read the code before writing about it: the seeding and the build of the single-layer image are
`server/test/support/base-images.ts`, and the reset that calls the seeding first is
`resetDaemon()` in `server/test/support/lifecycle.ts`.

## The three divergences, as the pass found them

- **The single-layer image is never published.** `ensureOnce` builds it `FROM scratch` and stops
  there; the running registry's catalog holds `alpine`, `moby/buildkit` and `vexel-test-pullable`,
  and not it. Nothing pulls it, so nothing has to — the claim is simply wider than the truth.
  `.sdd/.archi` states the build correctly but is wrong about the published fixture — see INT-9.
- **The seeding step can reach Docker Hub, and it now runs inside every reset.** `resetDaemon()`
  opens on `ensureRunRegistrySeeded()`, which pulls what the daemon does not hold in order to mirror
  it. On a cold machine the first reset of a run therefore goes to the network — observed during the
  pass, `alpine:3.20` arriving with Hub's own manifest digest. The rule as written says no test
  reaches Docker Hub; what it accurately describes is the restore at the end of a reset.
- **Three sentences left behind by work already done.**

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `CLAUDE.md`, the passage on where each image comes from | The single-layer image is built and not published, and nothing pulls it. The sentence that every image a test uses comes out of the registry, and the one that the daemon after a reset holds exactly what the registry put there, both stop being true as written. | REQ-76 | — |
| INT-2 | modify | `CLAUDE.md` and `.sdd/.archi`, the passages on reaching Docker Hub | Separate the two halves the rule conflates: the restore never goes to the network, and the seeding is the one step that can, once, on a machine holding none of the base images — and it now happens inside every reset rather than ahead of a pass. | REQ-77 | — |
| INT-3 | modify | `server/package.json`, the `//test:registry` note | It says the e2e suite runs that command from its global setup. There is no global setup. | REQ-78 | — |
| INT-4 | modify | `server/test/api/contexts-routes.test.ts`, the comment naming the pass's concurrency | It says the API files run in parallel; the pass is serial. Comment only — no assertion, no fixture, no budget is touched. | REQ-78 | — |
| INT-5 | modify | `CLAUDE.md`, the paragraph on what the reset does not empty | It opens on "One thing is **not** emptied" and then spends its first sentence on contexts, which are emptied. The count and the order were left behind by the correction that moved contexts out of that list. | REQ-78 | — |
| INT-6 | modify | `server/test/api/contexts-routes.test.ts`, lines 60–64 and its imports | An orphan doc comment describing a closing hook that was removed, its `*/` running into the next comment with no declaration after it, and the `after` import it was the last user of. Found while carrying out INT-4, in the same file. | REQ-78 | INT-4 |
| INT-7 | modify | `server/test/api/contexts-use-routes.test.ts`, the comment on why the file is apart | It quotes a sentence `CLAUDE.md` no longer contains — destructive files living apart — and names a concurrently running test file on a pass that is serial. Say why the file is what it is in terms that hold: `docker context use` rewrites machine-wide state, and no label scopes it. | REQ-78 | — |
| INT-8 | modify | `server/package.json`, the `//test:registry` note | Its opening clause still calls it the one step allowed to talk to a registry on the internet, which `//test:images` and `.archi` both contradict now that the seeding runs inside every reset. INT-3 corrected the closing sentence only. | REQ-77, REQ-78 | INT-3 |
| INT-9 | modify | `.sdd/.archi`, the `test:registry` bullet | It says a copy of the single-layer image is published for the tests that contract "a reference missing locally is fetched first". The published fixture is a separately built image with deliberately different content, not a copy. The batch's own text said `.archi` needed no edit for REQ-76; it was written before this sentence was known. | REQ-76 | — |
| INT-10 | modify | `server/test/api/prune-routes.test.ts`, `system-prune-routes.test.ts`, `volumes-prune-routes.test.ts`, `networks-prune-routes.test.ts`, `build-cache-prune-routes.test.ts`, `builders-active-routes.test.ts`, and `client/e2e/prune.spec.ts`, `volumes-prune.spec.ts`, `build-cache-prune.spec.ts`, `system-prune-confirmed.spec.ts` | Each says its file lives apart, or runs alone, or names the second Playwright project and the dependency between the two. The split ended in `909d63c`: there is one project, no `exclusive` directory, and every file resets the daemon itself. `builders-active-routes.test.ts` quotes a sentence `CLAUDE.md` no longer contains; `prune.spec.ts` names the project dependency whose silent skip is the reason the split was removed. | REQ-78 | — |
| INT-11 | modify | `server/test/api/system-overview-routes.test.ts`, `system-routes.test.ts`, `image-filesystem-routes.test.ts`, `images-push-routes.test.ts` | Each says the api pass runs its files in parallel, or reasons from that. It runs them one at a time (`--test-concurrency=1`). Same defect as INT-4. | REQ-78 | — |
| INT-12 | modify | `client/e2e/images.spec.ts`, `layer-explorer.spec.ts`, `image-transport.spec.ts`, `filesystem-browser.spec.ts`, `container-detail-property-columns.spec.ts`, `container-create-run.spec.ts` | Each names the global setup as something that runs. There is none. `container-create-run.spec.ts` is not merely stale but false: it says the reference its tests fetch is published by the global setup, and it is published by the file's own `beforeAll` five lines below. | REQ-78 | — |
| INT-13 | modify | `server/test/support/base-images.ts` | It says `test:images` prepares everything before a whole server pass. No pass runs it, which the `//test:api` note in `server/package.json` states two files away. | REQ-77, REQ-78 | — |
| INT-14 | modify | `server/test/api/builders-routes.test.ts`, `refresh-cache-routes.test.ts` (two sites), `server/test/unit/analysis-cache-store.test.ts` | Three more of the same, found while carrying out INT-10 to INT-13: two cases said to "run alone", two mentions of the "parallel API pass", and one unit test standing in for two processes sharing a data directory that calls the api pass its example — `node --test` does give each file a process, but one at a time. | REQ-78 | INT-10, INT-11 |
| INT-15 | modify | `client/e2e/`, `client/test/`, `server/test/`, `client/scripts/`, `server/scripts/`, `scripts/`, and the three manifests | A sweep, because two rounds have each turned up more sites than the round before: find every remaining comment claiming a file lives apart or runs alone, a pass running its files at once, a global setup, an `exclusive` directory, a second Playwright project, or a preparation step ahead of a pass — and correct or report each. REQ-78 closes on the sweep finding nothing left, not on a list. | REQ-78 | INT-14 |

> **INT-6, INT-7 and INT-8 were found while carrying out INT-3 and INT-4**, in the files those two
> name and in one beside them. They are the same defect — a comment naming something that was
> removed — so they are interventions of this batch rather than a batch of their own.
>
> **The heading `### No test reaches Docker Hub` keeps its name**, decided on 2026-09-02: three
> end-to-end files cite it by that exact string, and the body underneath now states the exception.
>
> **REQ-78 is read as its rule, not as its three examples** — decided on 2026-09-02, after the
> closing run found the same defect in twenty-one further sites. INT-10 to INT-13 are those sites.
> The three the requirement names were what was known when it was written, not the extent of it.
>
> **Nothing in this batch is a spec or an index.** No component's observable behaviour changes, so
> none of their contracts move. If reading the code shows otherwise, say so rather than inventing a
> spec edit to fill the shape of a batch.

## Human acceptance

### Scenario: the rule about the network says what holds

- REQ → REQ-77
- Given → a machine that holds none of the base images
- When → the human starts a run and watches what it fetches
- Then → the first reset fetches them once, and every later restore comes from the run's own registry; both are what the documents describe

### Scenario: no comment names something that was removed

- REQ → REQ-76, REQ-78
- Given → the passages this batch touched
- When → the human looks for each file, command and arrangement they name
- Then → every one of them exists
