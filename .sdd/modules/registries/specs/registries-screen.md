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
- Two panels side by side, as drawn in `.sdd/analysis/ui-mock/registries.png`, collapsing to one
  column when the screen is too narrow to carry both. On the left, "Registries & credentials", the
  registries listed with the object list's comfortable variant. On the right,
  "Repositories · <host>", the repositories of the selected registry listed the same way, each over
  a row of tag chips.

Shows:
- One row per configured registry, in columns:
  - a leading dot — green when the session is authenticated, muted when it is not;
  - the host, over a second line that is **the account when there is one and the state in words when
    there is not**: `octocat` for a named credential, "authenticated" when the store reports a
    credential but no name, "not authenticated" when there is none — with "plain http" appended for
    a registry reached without TLS. The two are one value, not two: which is what keeps the line
    always present and always one line (see REQ-37 below);
  - the credential store — the helper's name, or "docker config file" when the credential lives in
    the configuration file, and nothing at all (the column's "–") when the registry is not
    authenticated.
  **No column ever shows a credential**, only whether there is one and in whose name.
- "Log out" on an authenticated registry's row, "Log in" on one that is not — actions of the row's
  cluster, the log in weighing more than the log out.
- "Reading registries…" before the first read settles; "No registries configured" once it has, with
  the line that says where a registry comes from; and an error banner with retry when the inventory
  cannot be read.
- The right panel's title as `Repositories · <host>`, extended with `/<term>` while a term is
  typed — the mockup's `Repositories · docker.io/myorg`.
- Next to that title, whether the browsing is authenticated: "authenticated as <account>", or
  "anonymous".
- One row per repository found: its name over its description when the registry publishes one, and
  its pull count when it publishes one, abbreviated ("48k pulls", "1.8B pulls").
- Under each repository, one chip per tag: the tag name, the size it weighs, and an inline "pull".
  "Reading tags…" while they load, the failure's message in their place when the listing failed, and
  "No tags reachable" when there are none.
- In place of the repositories, one of five states — each a title, an explanation where the title
  does not say everything, and the control that resolves it where one would:
  - no registry selected → "Select a registry", with the line inviting one to be picked;
  - the default index with no term → "Search Docker Hub", with "Docker Hub has no catalog to list:
    type a term to search it." and a control that puts the cursor in the search box;
  - a search in flight → "Searching…";
  - the first read of a registry's catalog not settled → "Reading repositories…";
  - nothing matched → "No repositories match": with a term typed, the line names it and a control
    clears it; with none, the line says the registry published no repository to list and no control
    would change that.
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
- A tag chip's "pull" → opens a dialog naming the exact reference that will be pulled, as selectable
  text; confirming starts the pull and shows per-layer progress. Success closes the dialog and
  announces the pull; a failure keeps the dialog open with the daemon's message.

## Rules and invariants

- **No credential is ever displayed, kept or echoed** (REQ-87): the secret lives only in the login
  form's state, is dropped the moment the form closes whichever way it did, is masked with no reveal
  control while typed, and is never part of a toast, a banner or a title.
- The pull goes through the images area's existing pull stream and per-layer progress surface: this
  screen never implements a transfer of its own.
- The reference a tag is pulled by is the one the server computed for that tag; the screen never
  assembles it from parts.
- **Every registry row is the same height as every other** (REQ-37), whatever its state line would
  have said: an authenticated registry naming an account and a credential store occupies exactly as
  many lines as one that is merely "not authenticated". The row's values are columns of one line
  each, so no value can add a line to the row that carries it.
- **No affordance of this screen is a one-off**: logging in and out are actions of the row's cluster
  and nothing else on a row is clickable but the row itself; the search is the screen's one toolbar;
  the empty results are the library's empty state.

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
- **The state line became columns rather than a shorter line** (REQ-36, REQ-37). The delivered row
  joined four values into one monospace sentence, which is what made a row's height depend on what
  its registry happened to be. The values are the same and in the same order; what changed is that
  the one whose *presence* depends on the state — the credential store — is a column of its own,
  where its absence is the column's "–" and costs no line. The account and the state word stay one
  value on one line, for the same reason: two of them would be a line that comes and goes.
- **Known, and left for batch 19 to decide** (`plan-ui-coherence-optimisation/REQ-81`): on a row
  whose second line is an account, "authenticated" is said by the dot's colour alone —
  `StatusDotCell` renders an empty `<span>` whose tone reaches the DOM only as a class setting a
  `background`. A row that states "not authenticated" in words but states "authenticated" only in a
  colour is an asymmetry the merge above makes visible; the only textual trace for the authenticated
  case is the row action reading "Log out". It is a library-level question, not this screen's.
- **The screen carries one toolbar** (the repositories panel's search), the registries panel having
  no page-level action of its own: everything an operator does to a registry is done to one
  registry, and therefore from that registry's row.
- **The two panels stay side by side and collapse together.** The reveal here is not a detail panel
  but the other panel — picking a registry is what the browser reads — so the pair is the layout,
  not an obstacle to one, and it is asked for by name (the library's `pair` arrangement) rather than
  as a fixed template that never collapses.

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable (comfortable variant) with StatusDotCell,
  TwoLineCell, MetaCell and BadgeListCell, ActionButtonGroup, ChipGroup, Chip (meta reading),
  SearchField, SecretField, TextField, FormField, FormDialog, DefinitionList, StatusPill, Button,
  StepProgressList, ErrorBanner, EmptyState, Grid, Stack, useToast
- registries: useRegistries, useRegistryRepositories
- images: images client (pull stream URL), useImageTransferStream
- app-shell: useConfirmation, useProgress, useErrorReporter

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-87
- plan-ui-coherence-optimisation/REQ-36
- plan-ui-coherence-optimisation/REQ-37
- plan-ui-coherence-optimisation/REQ-38
