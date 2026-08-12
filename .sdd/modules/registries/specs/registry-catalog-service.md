---
module: registries
component: RegistryCatalogService
type: backend service
---

# RegistryCatalogService

**Purpose** → browsing a configured registry (REQ-86): the repositories it exposes, searched by
term, the tags of a repository with the size each one weighs, and the reference a selected tag is
pulled by.

## Contract

- `searchRepositories(registry, query, limit): Promise<RepositorySummary[]>`
  - `RepositorySummary`: `{ name, description?, pullCount? }`; `name` is the repository path inside
    the registry (`library/nginx`, `myorg/api`).
  - Docker Hub → searched on the term; it has no catalog to list, so an **empty term yields an
    empty list**, not an error. `pullCount` and `description` are reported there. **The result keeps
    the order Docker Hub returned it in** — that order is a relevance ranking for the term the
    operator typed, so a search for `nginx` still answers with `nginx` first, and it is deliberately
    not alphabetised.
  - Any other registry → its catalog is listed and filtered on the term (case-insensitive
    substring); an empty term lists the whole catalog. No pull count is reported: no Distribution
    registry publishes one. Such a catalog carries no ranking of its own, so it is **ordered by
    repository name** under the list-order rule (`compareNames`), with that name compared exactly as
    the final comparison.
  - At most `limit` repositories are returned; the ordering is applied **before** that cut, so which
    repositories the limit keeps does not depend on the order the registry answered in either.
- `listRepositoryTags(registry, repository, limit): Promise<TagSummary[]>`
  - `TagSummary`: `{ name, sizeBytes?, updatedAt?, pullReference }`.
  - Docker Hub → the tags of the repository with the size and last-update time it publishes; an
    official image is looked up under `library/…` even when it is named bare.
  - Any other registry → the tag list, each tag's size summed from its manifest: the config blob
    plus every layer. A multi-platform index is measured on its first manifest.
  - A tag whose manifest cannot be read keeps its place in the list **with no size**, rather than
    failing the whole listing.
  - **Ordered by tag name** under the list-order rule (`compareNames`), for every registry, Docker
    Hub included: `1.25` before `1.26` before `latest`. A tag carries no identifier other than its
    name, so the final comparison is **that same name compared exactly**.
  - Rejects on an empty repository.
  - At most `limit` tags are returned; where that cut is made locally, the ordering is applied
    before it, so which tags the limit keeps does not depend on the order the registry answered in.
- `pullReferenceFor(host, repository, tag): string`
  - Docker Hub → `repository:tag`, with no host prefix and with the `library/` prefix of an official
    image dropped (`nginx:1.27`).
  - Any other registry → `host/repository:tag` (`ghcr.io/myorg/api:latest`).

## Rules and invariants

- **Every read is anonymous** (REQ-87): no credential of the operator's is used to widen what is
  browsable, because the application never reads one back out of the credential store. What a
  registry hides from an anonymous client stays out of reach and says so — "…could not be browsed:
  it requires credentials this application does not hold".
- A registry that answers a bearer challenge is followed once, anonymously, to its token service;
  the request is then retried with that token.
- A registry is dialed over `https` unless its summary says it is insecure, in which case `http`.
- Every failure — refusal, unreachable host, non-JSON answer — is reported as a
  `DockerDaemonError` (`docker-access`, code `DaemonRejected`) naming the host and the reason, so
  the REST layer maps it to `502`.
- Every outbound request is bounded by a timeout: a registry that never answers fails the request
  instead of holding it open.
- Tag sizes are read a few at a time, never all at once: a burst of manifest reads is how a browse
  turns into a rate-limited refusal.
- **This service never pulls**: it names the reference, and the pull itself goes through the images
  area's existing pull stream (see the decision below).

## Decisions recorded

- The batch asks for "a pull triggered from a selected tag" in this area. It is delivered as the
  `pullReference` each tag carries, consumed by the images area's existing pull service and its
  per-layer progress stream — rather than a second pull implementation here. The server still
  decides what gets pulled (the reference is computed here, not guessed by the client), and there
  is exactly one pull path in the application.

## Dependencies

- registries: RegistriesService (host normalization, the registry summary being browsed)
- images: image transfer service (the pull the `pullReference` is handed to, through its endpoint)
- list-order: List order (`byNameThenIdentity`)

## Requirements served

- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-87
- plan-docker_management_app-list_ordering/REQ-39
- plan-docker_management_app-list_ordering/REQ-40
- plan-docker_management_app-list_ordering/REQ-41
- plan-docker_management_app-list_ordering/REQ-43
