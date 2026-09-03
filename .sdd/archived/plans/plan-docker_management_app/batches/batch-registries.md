---
batch: 26 · registries
feature: F23 — Registries
closed_req: [REQ-85, REQ-86, REQ-87]
depends: [2, 9]
---

# Batch 26 — Registries

Credentials are delegated to the host's Docker credential store: the application never displays
them back nor persists them itself.

Visual reference: `.sdd/analysis/ui-mock/registries.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Credential-form primitives: masked secret field with a reveal-disabled variant, and an authentication-state badge; plus a tag-chip group with an inline action for the repository listing. | REQ-85, REQ-86, REQ-87 | — |
| INT-2 | create | server, registries area | Registry inventory from the local Docker configuration: host, authenticated account, credential store in use, authentication state; login and logout delegated to the CLI/credential-store channel so the secret never transits through application storage. | REQ-85, REQ-87 | — |
| INT-3 | create | server, registries area | Repository and tag browsing/search against a configured registry, with each tag's size, and a pull triggered from a selected tag. | REQ-86 | INT-2 |
| INT-4 | create | client, data-access layer | Registry queries, login/logout mutations, repository/tag browsing and the pull trigger, with credential values never stored client-side. | REQ-85, REQ-86, REQ-87 | INT-2, INT-3 |
| INT-5 | create | client, registries feature area | Registries screen: configured registries with account, credential store and authentication state, log in / log out, repository and tag browser with search and sizes, and pull of a selected tag. | REQ-85, REQ-86, REQ-87 | INT-1, INT-4 |
| INT-6 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the Registries placeholder with the real screen. | REQ-85 | INT-5 |
