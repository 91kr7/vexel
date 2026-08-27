---
id: teachings-go-in-the-knowledge-base
kind: guideline
scope: any
date: 2026-08-27
source: chat, during the UX review of the container detail Config tab
---

# The assistant's own memory is forbidden; teachings go in the knowledge base

**Rule** → Never write to the assistant's own memory. Everything the human teaches goes in
`.sdd/knowledge-base/`, and nowhere else.

**Why** → "ti ho espressamente vietato di usare la tua memory!!!! perchè ci puoi scrivere dentro
cose che contraddicono l'sdd-flow! nei nuovi markdown ti ho scritto che devi usare una cartella
-knolege-base dentro a progetto". A note the human cannot see, review or version can drift out of
step with the sdd artifacts and then quietly contradict them; the knowledge base sits in the
repository, under the same review and the same commit as the work.

**How to apply** → any phase: when the human teaches something in chat, write the entry in that same
turn under `entries/`, add its row to `index.md`, and say so in the reply. Never record it as an
assistant memory, and never treat one as a source. If a memory already exists from an earlier
session, remove it rather than migrate it silently.
