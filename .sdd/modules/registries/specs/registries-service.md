---
module: registries
component: RegistriesService
type: backend service
---

# RegistriesService

**Purpose** → the registries the local Docker installation is configured for — host, account,
credential store, authentication state and whether the registry is reached over plain http — plus
logging in and out, both delegated to the host's Docker credential store (REQ-85, REQ-87).

## Contract

- `listRegistries(): Promise<RegistrySummary[]>`
  - `RegistrySummary`: `{ host, serverUrl, authenticated, account?, credentialStore?, secure,
    official }`.
  - `host` is the registry as the operator names it (`docker.io`, `ghcr.io`,
    `registry.internal:5000`): scheme and path dropped, lower-cased, every alias of the default
    index (`index.docker.io`, `registry-1.docker.io`, `registry.hub.docker.com`) collapsed onto
    `docker.io`.
  - `serverUrl` is the key Docker itself records the registry under — `https://index.docker.io/v1/`
    for the default index, the host for anything else.
  - `credentialStore` names the credential helper backing the registry (the per-registry
    `credHelpers` entry, else the global `credsStore`); absent when the credential sits in the
    Docker configuration file itself.
  - `authenticated` is true when a credential exists for the registry: either the configuration
    file holds one, or the configured credential store reports one.
  - `account?` is the username that credential is held under, when there is a name to report; absent
    otherwise — including for an identity-token credential, which Docker records under the
    placeholder `<token>` and which names nobody.
  - `secure` is false when the registry is reached over plain http: the daemon's own registry
    configuration says so, and a registry on the loopback interface (`localhost`, `*.localhost`,
    `127.*`, `::1`) is taken as insecure by default, exactly as Docker does.
  - `official` marks the default Docker index.
  - The default index is always part of the inventory, logged in or not, and **comes first** — the
    official group being compared before anything else. Within each group, entries are **ordered by
    host** under the list-order rule (`compareNames`); a registry carries no identifier other than
    its host, so the final comparison is **that same host compared exactly**, and the same
    configuration produces the same sequence on every read.
  - **No secret is ever part of the result**, in any field.
- `registryListCache` — the inventory as a held value of the refresh cache: key `registries`,
  period **30 000 ms** (a bare figure beside the kind, like every other registered kind's), **no
  daemon event type at all**.
  - `read()` → the held inventory; the local Docker configuration, the credential helpers and the
    daemon's index configuration are read once per period however many windows are open, and not at
    all while nobody is asking.
  - the daemon publishes no event for the Docker configuration or the credential store, which is
    where most of this reading lives: a `docker login` or a `docker logout` typed in a terminal is
    noticed within the period plus the screen's own poll, and at once on the operator's refresh
    (`plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-59`).
- `getRegistry(host): Promise<RegistrySummary>`
  - The inventory entry for `host`; a host the installation is not configured for resolves to an
    unauthenticated summary rather than a failure, so a registry can be browsed before any login.
  - **A direct read, never the held value**: it is what a log in and a log out answer with, and
    neither may answer with a state read before the operation.
- `loginToRegistry({ host, username, secret }): Promise<RegistrySummary>`
  - Logs in through the CLI channel, which hands the secret to the host's credential store.
  - Rejects with an empty username or an empty secret.
  - Rejects a host that names no registry — empty, blank, or reduced to nothing once its scheme and
    path are dropped — and one that starts with `-`. Such a host is **never** resolved to the
    default index: a blank host is a refusal, not a login to Docker Hub (REQ-87).
  - States that the held inventory has changed, so the listing the screen reads back describes the
    log in (`plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-57`).
  - Resolves with the registry's resulting state (authenticated, with its account).
  - A refusal by the registry rejects with the CLI's own message, **with every occurrence of the
    secret replaced by a fixed marker first**.
- `logoutFromRegistry(host): Promise<RegistrySummary>`
  - Drops the stored credential through the CLI channel, states that the held inventory has changed,
    and resolves with the resulting state (no longer authenticated).
  - Refuses the same hosts as `loginToRegistry`, on the same rule: the two agree on what a usable
    host is, so neither ever acts on a registry the caller did not name.
- `normalizeRegistryHost(value): string`, `isDockerHub(host): boolean` — the host normalization and
  the default-index test the whole area shares. `normalizeRegistryHost` resolves an empty value to
  the default index, because that is how Docker's own configuration writes it; the acting operations
  above therefore test what the caller named **before** normalizing, never after.

## Rules and invariants

- **The application never holds, stores or displays a credential** (REQ-87). It is written to the
  CLI's standard input on the way in and is never read back: the account name comes from the
  credential helper's `list` verb, which answers server URL → username and carries no secret at
  all — deliberately, rather than the helper's `get`, which would hand this process the password.
- A secret never appears in `argv` (where `ps` would show it), never in a log line, and never in an
  error message: everything leaving the CLI channel is redacted against the secret first.
- The username of a credential kept in the Docker configuration file is the part of the decoded
  `auth` value before the separator; the rest is dropped on the spot and nothing keeps a reference
  to it.
- An unreadable or malformed Docker configuration file yields an empty one: the inventory still
  lists the default index rather than failing.
- An unreachable daemon costs the `secure` reading its authoritative source, not the inventory: the
  registries of the configuration file are still listed.
- A credential helper that is absent from `PATH`, or refuses, contributes no account: an unknown
  account is not a failed inventory.
- The configuration is read from `DOCKER_CONFIG` when set, from `~/.docker` otherwise.
- Nothing is read while nobody is asking: registering the kind reads nothing, and a whole expiry
  window with no request stops the reading and drops what was held, so the next request reads fresh.
  Like every other held value, it is read again by the operator's manual reload when it is held,
  keeps its last inventory when a read fails (reported as staleness, not as a failure), and is
  dropped by a context switch.
- A non-zero exit or a spawn failure of the CLI rejects with a `DockerDaemonError`
  (`docker-access`, code `DaemonRejected`), so the REST layer maps it to `502`.

## Dependencies

- docker-access: CLI runner, Active endpoint, EngineClient (the daemon's `/info` registry
  configuration)
- list-order: List order (`byNameThenIdentity`, with the official flag as the group rank)
- refresh-cache: Refresh cache

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-87
- plan-docker_management_app-list_ordering/REQ-23
- plan-docker_management_app-list_ordering/REQ-24
- plan-docker_management_app-list_ordering/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-54
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-55
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-57
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-58
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-59
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-61
