---
module: registries
component: RegistriesScreen
type: UI component
---

# RegistriesScreen

**Purpose** → the Registries screen (REQ-85, REQ-86, REQ-87): the configured registries with their
account, credential store and authentication state, log in and log out, and a browser over the
selected registry's repositories and tags with each tag's size and a pull straight from it.

Description:
- Two side-by-side panels, as drawn in `.sdd/analysis/ui-mock/registries.png`. On the left,
  "Registries & credentials", one card row per registry. On the right, "Repositories · <host>", the
  repositories of the selected registry, each over a row of tag chips.

Shows:
- One row per configured registry: the host as title, a leading dot — green when the session is
  authenticated, muted when it is not — and, in monospace below, the state line:
  - authenticated → the account (or just "authenticated" when the store reports no name), then
    "credential store: <helper>" (or "credential store: docker config file" when the credential
    lives in the configuration file);
  - not authenticated → "not authenticated";
  - a registry reached over plain http adds "plain http" as a last part.
  Parts are joined with " · ". **The line never shows a credential**, only whether there is one and
  in whose name.
- A trailing "Log out" on an authenticated registry, a "Log in" on one that is not.
- "Reading registries…" before the first read settles, "No registries configured" when there are
  none, and an error banner with retry when the inventory cannot be read.
- The right panel's title as `Repositories · <host>`, extended with `/<term>` while a term is
  typed — the mockup's `Repositories · docker.io/myorg`.
- Next to that title, whether the browsing is authenticated: "authenticated as <account>", or
  "anonymous".
- One card row per repository found: its name, its description when the registry publishes one, and
  its pull count when it publishes one, abbreviated ("48k pulls", "1.8B pulls").
- Under each repository, one chip per tag: the tag name, the size it weighs, and an inline "pull".
  "Reading tags…" while they load, the failure's message in their place when the listing failed, and
  "No tags reachable" when there are none.
- In place of the repositories: "Select a registry" while none is selected, "Search Docker Hub"
  (with "Docker Hub has no catalog to list: type a term to search it.") on the default index with
  no term, "Searching…" while a search is in flight, and "No repositories match" otherwise.
- An error banner with retry when the registry could not be browsed — including when it refuses an
  anonymous client, which says so in the message.

Actions:
- Selecting a registry row → the right panel browses that registry; the first registry read selects
  one on its own, so the browser always has a registry to work against.
- "Log in" → opens a form asking for a username and a masked password/access token, stating that the
  credential goes to the host's Docker credential store and is never kept, shown or logged. Submitting
  logs in, closes the form and the row turns authenticated; a refusal is reported and the form stays
  open. The form cannot be submitted with an empty username or an empty secret.
- "Log out" → asks for confirmation, naming the registry and stating that the stored credential goes
  from the host's credential store; once confirmed, the row turns unauthenticated.
- Typing in the search box → searches (default index) or filters (any other registry) the
  repositories.
- A tag chip's "pull" → opens a dialog naming the exact reference that will be pulled, with a copy
  affordance; confirming starts the pull and shows per-layer progress. Success closes the dialog and
  announces the pull; a failure keeps the dialog open with the daemon's message.

## Rules and invariants

- **No credential is ever displayed, kept or echoed** (REQ-87): the secret lives only in the login
  form's state, is dropped the moment the form closes whichever way it did, is masked with no reveal
  control while typed, and is never part of a toast, a banner or a title.
- The pull goes through the images area's existing pull stream and per-layer progress surface: this
  screen never implements a transfer of its own.
- The reference a tag is pulled by is the one the server computed for that tag; the screen never
  assembles it from parts.

## Decisions recorded

- **The "authentication-state badge" of the batch reuses the library's existing `StatusPill`**
  (dot + label) rather than adding a near-duplicate control: the standing rule is to extend or reuse
  a primitive that already fits. It sits next to the repositories panel's title, where it tells the
  operator whether what they are browsing is being read as an authenticated client or anonymously —
  information the mockup's registry rows do not already carry, unlike the row's own state dot.
- **The mockup has no search box; REQ-86 requires search.** One is added at the top of the
  repositories panel, the only addition to the content area: everything else follows the mockup as
  drawn.
- **Browsing is anonymous.** REQ-87 forbids the application from reading credentials back, so a
  private repository that the registry hides from an anonymous client is not reachable here; the
  refusal is surfaced as such rather than hidden behind an empty list.
- **The default index is browsed by search, not by catalog**: Docker Hub exposes no catalog, so an
  empty term shows an invitation to search rather than an empty list that would read as "nothing
  there".

## Dependencies

- ui-library: Card, SectionHeader, CardList (leading state dot), ChipGroup, Chip (meta reading),
  SearchField, SecretField, TextField, FormField, FormDialog, DefinitionList, StatusPill, Button,
  StepProgressList, ErrorBanner, EmptyState, Grid, Stack, useToast
- registries: useRegistries, useRegistryRepositories
- images: images client (pull stream URL), useImageTransferStream
- app-shell: useConfirmation, useProgress, useErrorReporter

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-87
