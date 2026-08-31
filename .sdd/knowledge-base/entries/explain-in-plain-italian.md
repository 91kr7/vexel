---
id: explain-in-plain-italian
kind: guideline
scope: any
date: 2026-08-30
source: chat, during the e2e repair of badge-list-pills
---

# Explain to the human in plain, careful Italian — never in terms of the code

**Rule** → Every explanation addressed to the human is written in careful Italian and stands on its
own without the code: name what the product does and what the operator sees, not the functions,
the classes or the fields that do it. Identifiers, file paths and code excerpts may follow, as a
reference for whoever wants to go and look, never as the explanation itself.

**And "careful" means plain, not literary.** Short sentences, ordinary words, one idea each.
Subject, verb, object. No long subordinate chains, no clauses nested behind dashes, no inversions,
no metaphor, no register borrowed from this repository's own prose. The comments and specs in this
codebase are written in an elaborate style; **that style is for the artifacts, never for the chat.**

**Why** → "sto lavorando in modalità di sviluppo full AI quindi io non so come hai scritto il
codice!" — said on 2026-08-30, after a diagnosis written as a chain of calls
("`listVolumes()` chiama `readMountedBy()` → `containerListCache.read()`…") which the human closed
with "questo per me non significa nulla". The human decides on the product, so a diagnosis they
cannot read is a diagnosis that cannot be decided on. Same turn: "con un italiano decente".

Refined on 2026-08-31, during the repair of the stopped-container sample: "cio' che hai scritto e'
incomprensibile!", and then again two answers later, "scusami ma continui a scrivere in un italiano
incomprensibile!". The second time the content was already about the product and not about the code
— what made it unreadable was the **writing**: long winding sentences in the register of this
repository's own comments. Being right about the subject does not make a paragraph readable.

**How to apply** → any phase, and above all when reporting a defect, a diagnosis or a choice to be
made: first the fact in plain words — what happens, what the operator sees, how long it lasts,
what it should do instead — measured where a measurement exists. Then, and only then, the
technical reference. An analogy is welcome when the mechanism is not obvious.

Reread before sending: any sentence that cannot be read once and understood is rewritten, split in
two, or deleted. A short answer the human reads beats a complete one they do not.
