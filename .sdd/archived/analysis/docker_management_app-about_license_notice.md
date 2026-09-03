---
request_slug: docker_management_app-about_license_notice
date: 2026-08-09
type: evolution
reference: .sdd/analysis/docker_management_app.md
---

## Request

> Tema: obbligo di attribuzione e nota di licenza nell'interfaccia di Vexel, e rinomina della
> schermata "Coverage matrix" in "About".
>
> Contesto fattuale (già in repo, commit 7354211):
> - Vexel è ora rilasciato sotto GNU AGPL-3.0 (`LICENSE`, testo canonico FSF).
> - `LICENSE-ADDITIONAL-TERMS.md` aggiunge tre termini permessi dalla sezione 7 dell'AGPL: 7(b)
>   conservazione dell'attribuzione d'autore, 7(c) marcatura delle versioni modificate, 7(e) nessuna
>   concessione di diritti sul nome "Vexel".
> - `NOTICE` porta la nota di copyright che deve accompagnare il software.
> - Titolare del copyright: Christian Mariani, 2026. Sorgente: https://github.com/91kr7/vexel
>
> Problema di business da analizzare:
> L'interfaccia dell'applicazione oggi non mostra alcuna nota di licenza, copyright o link al
> sorgente. Questo ha due conseguenze concrete:
>
> 1. La sezione 13 dell'AGPL — la clausola specifica per il software esposto in rete — richiede che
>    chi interagisce con l'applicazione attraverso la rete possa ottenere il sorgente della versione
>    che sta usando. Un'interfaccia che non offre alcun percorso verso il sorgente non soddisfa
>    questa condizione.
>
> 2. La sezione 5(d) dell'AGPL stabilisce che se l'interfaccia originale non mostra le "Appropriate
>    Legal Notices", chi la modifica non è tenuto ad aggiungerle. Di conseguenza il termine di
>    attribuzione 7(b) — che impone di *conservare* la nota — resta inefficace finché una nota non
>    esiste. In pratica: senza nota in interfaccia, nessun fork sarà mai obbligato a citare l'autore,
>    e l'obiettivo per cui la licenza è stata scelta viene meno.
>
> Direzione già decisa dal committente:
> - La nota deve vivere nella schermata che l'applicazione dedica a se stessa. Oggi è la voce di
>   navigazione con id `coverage-matrix`, etichettata "Coverage matrix" (gruppo "Full coverage",
>   ultima voce): è già la schermata che ospita le card della shell — disponibilità delle CLI, event
>   stream del daemon, cache di analisi — più la matrice di copertura funzionale. Va rinominata
>   "About", perché diventa a tutti gli effetti la schermata di identità del prodotto.
> - L'identificativo interno della schermata deve restare invariato (`coverage-matrix`): è persistito
>   come ultima schermata attiva (REQ-115) e usato dagli helper di test e2e. Cambia solo ciò che
>   l'operatore vede.
> - Il requisito esistente F29 (`.sdd/plans/plan-docker_management_app/requirements.md`), oggi
>   intitolato "Coverage matrix", va considerato: cambia il nome della schermata che descrive.
>
> Contenuti che la nota deve esprimere: nome del prodotto, copyright dell'autore, licenza con
> rimando al testo completo, percorso verso il codice sorgente, assenza di garanzia, e l'avvertenza
> che una versione modificata esposta in rete deve offrire il proprio sorgente.
>
> Analizza la cosa dal punto di vista di business: che valore ha per il proprietario del progetto,
> quali aspettative ha chi installa o forka un progetto open source rispetto alla visibilità
> dell'attribuzione, e quali sono le pratiche correnti nei prodotti self-hosted comparabili (pannelli
> About, footer di licenza, link al sorgente).
>
> Nota per te: l'analisi di business esistente del prodotto è in
> `.sdd/analysis/docker_management_app.md`. Questa è un'evoluzione, non un prodotto nuovo.

## Reference

Previous analysis: [`.sdd/analysis/docker_management_app.md`](docker_management_app.md).

**Starting point.** Vexel is a single-operator client that exposes the full functional surface of a
Docker installation — containers, images, volumes, networks, Compose, Swarm, registries, builds,
contexts, system administration, plugins, plus deep layer/filesystem inspection — behind a
consistently applied "liquid glass" interface. The reference analysis explicitly recorded that **no
licensing model had been stated**: it listed "licensing model" under Assumptions as "not applicable
at this stage, left for later phases once the distribution model is set", and placed
"licensing/monetization model" under Out of scope. It also established a standing non-functional
theme that is directly relevant here — *transparency of the completeness promise* — which is what
the screen being renamed exists to serve today (the functional coverage matrix, plus the shell
status cards for CLI availability, daemon event stream and analysis cache).

**Changes:**

- The licensing model is no longer undecided. It has been settled outside this analysis and is now a
  fact of the product: AGPL-3.0 with three additional terms permitted by section 7, copyright
  Christian Mariani 2026, public source at https://github.com/91kr7/vexel. The reference analysis's
  assumption "no licensing model stated" and its "licensing/monetization model" exclusion are
  **superseded** for the licensing half; monetization remains out of scope.
- A new business objective enters the product: the interface must carry the product's own legal
  identity, so that the attribution the licence was chosen to secure actually binds downstream.
- The screen that today shows the coverage matrix and the shell status cards is re-purposed as the
  product's identity screen and re-labelled "About" for the operator, keeping its internal identity
  unchanged.
- The existing requirement reported as F29 ("Coverage matrix") describes a screen whose
  operator-visible name changes and whose content grows; it must be retitled and extended rather
  than duplicated.
- Nothing else in the reference analysis's scope, requirements, risks or constraints is withdrawn.

## Summary

Give Vexel an in-application identity and legal notice — product name, author copyright, licence,
route to the full licence text, route to the source code, absence of warranty, and the
network-modified-version warning — hosted on the screen the application already dedicates to itself,
which is re-labelled from "Coverage matrix" to "About" while keeping its internal identity.

## Business goal

The owner chose AGPL-3.0 plus section 7 additional terms in order to obtain one specific outcome:
**anyone who takes Vexel, changes it and runs it for others must keep saying who wrote it, and must
hand their users a route back to the source.** Today that outcome is not achieved, and the reason is
mechanical rather than a matter of goodwill.

Three clauses of the licence interlock, and the interface is the missing link between them:

- Section 0 defines *Appropriate Legal Notices* for an interactive interface as a display that
  "(1) displays an appropriate copyright notice, and (2) tells the user that there is no warranty for
  the work […], that licensees may convey the work under this License, and how to view a copy of this
  License."
- Section 5(d) then says: "If the work has interactive user interfaces, each must display Appropriate
  Legal Notices; **however, if the Program has interactive interfaces that do not display Appropriate
  Legal Notices, your work need not make them do so.**"
- Section 7(b) — the additional term the owner adopted — permits requiring "preservation of specified
  reasonable legal notices or author attributions in that material **or in the Appropriate Legal
  Notices displayed by works containing it**."

Read together, 7(b) is a *preservation* right, not a *creation* right. It can compel a fork to keep a
notice; it cannot compel a fork to invent one. Because Vexel's interface currently displays no
Appropriate Legal Notices, 5(d) grants every downstream modifier an explicit exemption from adding
them, and 7(b) therefore has nothing to bite on at the interface level. The additional terms file
exists, but the lever it was meant to pull is not connected. Adding the notice connects it: from that
release onward, a fork's interface inherits an existing notice, 5(d)'s exemption no longer applies to
it, and 7(b) turns "keep the author's name" into a licence condition rather than an appeal to
courtesy.

The second driver is section 13 (Remote Network Interaction): "If you modify the Program, your
modified version must prominently offer all users interacting with it remotely through a computer
network (if your version supports such interaction) an opportunity to receive the Corresponding
Source of your version […]". Two business consequences follow, and they are different in nature:

- The obligation is conditioned on modification and lands on **whoever modifies and exposes** the
  program. For the original author publishing unmodified Vexel from a public repository, section 13
  is not a breach to remedy today. So the notice is not primarily a compliance fix for the owner.
- It is a **pattern the downstream inherits**. Vexel is a client-server application reached through a
  browser: every deployment of a modified Vexel is precisely the network-interaction case section 13
  was written for. An interface that already carries a visible, one-step route to the source
  establishes the customary means the clause asks for, and a fork that keeps the surrounding notice
  (as 7(b) now requires) keeps that route with it. An interface that carries nothing leaves each
  forker to build the mechanism from zero — which, in practice, means none of them will.

The value to the owner is therefore threefold. **Attribution that actually holds**: the author's name
travels with the software instead of depending on a forker reading a file at the repository root that
their users will never see. **Credibility and trust for the operator**: a self-hosted tool that states
plainly what it is, who wrote it, under what terms and where its code lives is auditable at a glance —
material for anyone deciding whether to point an administrative tool with destructive powers at their
own daemon. **A coherent product identity**: the screen already answers "what can this application
do"; it now also answers "what is this application, and whose is it", which is the natural companion
question and needs no new navigation surface.

There is also a modest cost avoided. Retrofitting a notice later would mean every version shipped in
the interim is forkable under the 5(d) exemption in perpetuity — the exemption attaches to the version
a forker starts from, so each release without the notice is a permanent hole in the attribution chain.

## Requirements

### Functional

- **The application presents a screen dedicated to itself, labelled "About" to the operator.** The
  entry currently labelled "Coverage matrix" — last item of the "Full coverage" navigation group —
  carries the new label. Its position in the navigation and its group membership are unchanged.
- **Only the operator-visible label changes; the screen's internal identity is unchanged.** A
  persisted "last active screen" written by an earlier version must still resolve to this screen after
  the rename, with no migration step and nothing the operator has to redo. Existing automated checks
  that address the screen by its internal identity keep working.
- **The screen keeps everything it shows today** — CLI availability, daemon event stream status,
  analysis cache status, and the functional coverage matrix — and gains the identity/legal notice.
  Nothing existing is removed or relocated as part of this change.
- **The notice states the product name** ("Vexel").
- **The notice states the copyright of the author** — Christian Mariani, 2026 — identifying the
  natural person who holds it, consistently with the `NOTICE` file.
- **The notice states the licence** (GNU Affero General Public License, version 3) and **tells the
  operator how to view the full text**, including the additional terms adopted under section 7.
- **The notice states that the software comes with no warranty.**
- **The notice states that the operator may convey the work under this licence** — the second half of
  the section 0 definition, and the half most easily dropped when a notice is written informally.
- **The notice offers a route to the source code** — https://github.com/91kr7/vexel — actionable from
  the interface in a single step, and legible as plain text so it remains usable when it cannot be
  followed (see Assumptions on offline installs).
- **The notice identifies the running version of the application** next to the route to the source, so
  that "the source of the version you are using" is answerable rather than merely gestured at.
- **The notice carries the network-modification warning**: whoever modifies Vexel and exposes it over
  a network must offer their users the source of *their* version, and must keep the author
  attribution. This is the operative sentence a forker reads; it must be present in the interface, not
  only in the repository files.
- **The notice mentions that no rights in the name "Vexel" are granted** (the section 7(e) term), so a
  forker learns the constraint at the point where they are most likely to be deciding what to call
  their build.
- **The notice is a single, self-contained, visually identifiable block.** A forker must be able to see
  what "the notice" is and preserve it as a unit; a notice scattered across a screen is one a
  well-meaning fork will break by accident and a hostile one will dismantle by design.
- **The notice is always available while the application is in use** — reachable from the permanent
  navigation, not behind a transient state, a modal that can be dismissed forever, or a first-run-only
  screen.
- **The existing requirement reported as F29 ("Coverage matrix") is retitled to the screen's new name
  and extended to cover the notice**, rather than being left describing a screen name that no longer
  exists or being duplicated by a parallel requirement for the same screen.

### Non-functional

- **Legibility over aesthetics.** The notice is legal text on a translucent surface; it must be
  comfortably readable at rest, which the reference analysis already flags as a standing tension of
  the liquid-glass language. An unreadable notice is, for 5(d) purposes, arguably not a display at
  all.
- **Consistency with the shipped licence files.** The names, the year, the licence identifier and the
  source URL shown in the interface must agree with `LICENSE`, `LICENSE-ADDITIONAL-TERMS.md` and
  `NOTICE`. Any divergence between what the interface claims and what the repository says is a defect,
  because it is precisely the kind of contradiction that undermines the notice's evidentiary value.
- **Informative, not promotional.** The notice must read as a legal and identity statement, not as
  advertising for the author. Beyond taste, section 7(b) attribution is bounded by a reasonableness
  standard; a notice that behaves like a banner invites the argument that the requirement is
  unreasonable and gives a forker a pretext to strip it.
- **No network dependency to render.** The notice must be complete from what the application already
  has locally. It must not fetch anything, must not check for updates, and must not report the
  installation anywhere — the reference analysis established local-first control and no telemetry, and
  a legal notice is the last place to introduce a phone-home.
- **Not an obstacle.** The notice must never gate, interrupt or delay operational work: no blocking
  modal, no acknowledgement to click through, no first-run wall.
- **Not operator-configurable.** There is no setting to hide, empty or edit the notice. A removable
  notice reopens the 5(d) gap this change exists to close.
- **English only**, consistent with the project's language convention.
- **Durable wording.** The notice must stay correct without editing as the product evolves — no
  statement that depends on a feature list, a release date or anything that will silently rot.

## Assumptions

- **This is an evolution of the existing product analysis, not a new product and not a fix.** Stated
  explicitly by the human in the request; recorded here so no reader has to re-derive it.
- **The licence decision itself is settled and not under analysis.** AGPL-3.0, the three section 7
  terms, the copyright holder and the source URL are given as facts of the repository. This analysis
  takes them as input and reasons only about their consequence for the interface.
- **The notice lives on the About screen only; there is no per-screen footer.** The direction is the
  human's, and it holds up: Vexel is a single-operator administrative tool whose navigation is
  permanently on screen, so a standing navigation entry is continuously available in the way a footer
  would be, without spending vertical space on every dense operational screen. The FSF's own
  instructions for applying the licence point at an "About box" as the canonical location for the
  short notice in a graphical program, so this is the conventional choice rather than a weakening of
  it.
- **The full licence texts are reached by a route to the repository, not embedded as an in-app
  reader.** The section 0 definition asks the interface to tell the user "how to view a copy of this
  License" — a route, not a viewer. The repository is the canonical location for those texts and is
  the same destination section 13 points at, so one route serves both and there is no second copy to
  keep in step.
- **A version identifier is shown.** The request lists "route to the source" without naming a version,
  but the stated purpose — the source *of the version being used* — is not served by a bare repository
  link once more than one release exists. This is read as making the requested content do its stated
  job, not as widening scope. (Raised as an open question below; if the owner prefers otherwise, the
  requirement drops without affecting the rest.)
- **No update-availability check accompanies the version.** Displaying a version invites comparing it
  to the latest release; that would be a network call and a telemetry surface, both excluded above.
- **Section 13 is not currently being breached by the owner.** The clause is conditioned on
  modification and binds the party who modifies and exposes the program; the original author
  publishing unmodified Vexel from a public repository is not that party. The notice is therefore
  pursued for its downstream effect and for operator trust, not to remedy a present violation. Stated
  because it changes how the change should be prioritised and how it should be described in release
  notes — as a deliberate strengthening, not a scramble.
- **The section 7(c) marking obligation is left to forks as a stated obligation, with no product
  mechanism.** No field where a fork declares itself modified, no build-time flag. Rationale: the term
  binds the forker's own build, and any slot Vexel provides is one the forker can ignore or repurpose,
  so it adds surface without adding force.
- **Forks of releases published before the notice keep the 5(d) exemption.** Nothing in this change is
  retroactive. This is why the notice is worth shipping promptly rather than being deferred.
- **No third-party dependency attribution list is part of this change.** A page listing the licences of
  bundled components is a common About-panel feature and a reasonable future ask, but the request does
  not mention it and it is a materially larger, separate exercise.
- **The screen's existing content needs no rework.** The coverage matrix and the shell status cards
  stay as they are; the notice is added alongside them. Whether the notice sits above or below the
  existing cards is a presentation decision for the later phases.
- **This analysis is not legal advice.** It reads the licence text as written and quotes the operative
  clauses so every claim is checkable against the shipped `LICENSE`; whether to seek review is the
  owner's call and no review is assumed to have taken place.

## Constraints

- **Licence constraint — the notice's minimum content is fixed by section 0.** Copyright notice, no
  warranty, that licensees may convey the work, and how to view a copy of the licence. A notice
  missing any of these is not an "Appropriate Legal Notices" display, and the 5(d) mechanism that
  motivates the whole change does not engage.
- **Licence constraint — section 7 is a closed list.** Only the categories enumerated in section 7
  may be added; the owner has taken 7(b), 7(c) and 7(e). The interface can state those three and
  nothing further — no extra condition, no usage restriction, no "please credit us on your website"
  can ride along in the notice without being a licence violation in its own right.
- **Licence constraint — 7(b) preserves, it does not create.** Its reach is bounded by what the
  original interface displays at the moment a fork is taken.
- **Licence constraint — 7(b) attribution means the author, and must stay reasonable.** The FSF's
  guidance reads "author attribution" as identifying the natural person who wrote the work, and warns
  that section 7 terms must not become an obstacle to running, modifying or distributing the program;
  it also notes that modifiers retain latitude over *how* a preserved notice is displayed, only not
  over whether. The notice must be sized accordingly.
- **Licence constraint — section 13 asks for "prominently" and for "standard or customary means".**
  Both are qualitative. The design must be defensible as prominent to an ordinary user of the
  interface, which is an argument the choice of a permanent navigation entry has to carry.
- **Product constraint — the screen's internal identity is frozen.** It is persisted as the last
  active screen (reported as REQ-115) and used by end-to-end test helpers. The rename is
  operator-visible only; this is a hard boundary, not a preference.
- **Product constraint — the notice is rendered in the product's existing visual language.** It is not
  exempt from the interface's design rules by virtue of being legal text.
- **Documentation constraint — the screen is referenced by name in existing requirements.** The
  reported F29 titled "Coverage matrix" describes the screen being renamed; leaving it untouched
  creates a naming split between what the product shows and what its own specification calls it.
- **Domain constraint — the operator's environment may be offline or air-gapped.** A Docker
  administration tool is frequently run on hosts with no outbound internet. A route to the source that
  is only clickable is unusable there, which is why the URL must also be legible as text.

## Market trends

Relevant, and researched: self-hosted open-source infrastructure tooling is a real market with
established conventions for exactly this surface, and AGPL is mainstream within it.

- **An "About box" is the licence's own suggested home for this notice.** The FSF's instructions for
  applying the GNU licences tell authors of interactive programs to print a short notice at startup
  giving copyright, absence of warranty and how to view the licence — and state that "for a GUI
  interface, you would use an 'about box'". Putting the notice on an About screen is therefore the
  documented convention, not an improvisation, which matters because "prominently" and "reasonable"
  are judged against what is customary.
  ([FSF, GPLv3 Howto](https://gplv3.fsf.org/wiki/index.php/Howto);
  [GNU AGPL-3.0 text](https://www.gnu.org/licenses/agpl-3.0.en.html))
- **The customary section 13 implementation is a "Source" link inside the interface.** The widely
  cited guidance is that a web application satisfies the clause by displaying a link leading to the
  code — commonly at the bottom of every page — and that this is what "standard or customary means of
  facilitating copying of software" is understood to mean in practice. Vexel's chosen placement is a
  variation on this, trading per-page repetition for a permanent navigation entry.
  ([Opensource.com, Do I need to provide access to source code under AGPLv3?](https://opensource.com/article/17/1/providing-corresponding-source-agplv3-license);
  [Kyle Mitchell, Reading AGPL](https://writing.kemitchell.com/2021/01/24/Reading-AGPL))
- **The obligation is triggered by modification, and it lands on the operator who modified.** The same
  guidance is explicit that section 13 applies where the software "has been modified by 'you'" — the
  entity providing the network service — and that Corresponding Source extends to everything needed to
  build and run the derivative work, not just the changed files. This is what makes the clause bite
  hard on forks of a self-hosted product specifically, and it is the leverage the notice is meant to
  activate.
  ([Opensource.com](https://opensource.com/article/17/1/providing-corresponding-source-agplv3-license))
- **Section 7(b) attribution has a settled, narrow reading.** The FSF's own commentary treats "author
  attribution" as identification of the natural person who authored the work, cautions that links and
  logos generally do not qualify as attribution in themselves, and stresses that a modifier keeps
  discretion over presentation while losing the option of removal. A notice built around the author's
  name and copyright is squarely inside that reading; one built around branding is not.
  ([FSF, GPL-compliant reasonable legal notices and author attributions](https://www.fsf.org/blogs/community/gpl-compliant-legal-notices-author-attributions))
- **AGPL is a normal, expected licence for self-hosted infrastructure products.** Nextcloud, Mastodon
  and Grafana all ship under it, so operators of self-hosted tooling routinely encounter its
  expectations — including that the running instance is the thing whose source they are entitled to.
  A Docker management client asking to be trusted with a production daemon sits in the same
  expectation set.
  ([Wikipedia, GNU AGPL](https://en.wikipedia.org/wiki/GNU_Affero_General_Public_License);
  [Wikipedia, Grafana](https://en.wikipedia.org/wiki/Grafana);
  [Wikipedia, Mastodon](https://en.wikipedia.org/wiki/Mastodon_(social_network)))
- **In-interface attribution is common practice, and its friction is well documented.** Gitea, a
  comparable self-hosted server product, ships attribution and its version in the page footer; the
  wording of that footer, and whether it should be removable, have been openly contested by downstream
  operators (Codeberg publicly asked for "Powered by Gitea" to be removed from its landing page, and a
  separate issue argued the footer's copyright line was misleading). Two lessons transfer directly:
  attribution in the interface is normal and expected, **and** anything that reads as branding rather
  than as a legal statement attracts pressure to remove it. This is the concrete evidence behind the
  "informative, not promotional" requirement above.
  ([Codeberg, Remove "Powered by Gitea" on the Landing Page](https://codeberg.org/Codeberg/Community/issues/884);
  [go-gitea/gitea #8725, Copyright in footer is misleading](https://github.com/go-gitea/gitea/issues/8725))
- **Showing the running version alongside attribution is established practice** in this product
  category — Gitea's footer carries it — and it serves an operational need independent of licensing
  (bug reports, upgrade decisions, support requests). It is the cheapest way to make "the source of
  *your* version" a real answer rather than a formal one.
  ([Wikipedia, Gitea](https://en.wikipedia.org/wiki/Gitea))

## Risks

- **A notice that misses part of the section 0 definition achieves nothing.** If the display omits, for
  instance, that licensees may convey the work, a fork can argue Vexel's interface never displayed
  Appropriate Legal Notices, keep the 5(d) exemption, and drop the attribution — the exact outcome
  this change exists to prevent, reached while believing it had been prevented. This is the single
  highest-consequence risk, and it is entirely avoidable by checking the notice against the definition
  clause by clause.
- **A notice that reads as promotion invites removal.** The Gitea footer disputes show what happens
  when in-interface attribution feels like branding: downstream operators push back, and the
  reasonableness standard of section 7 gives them an argument. Overreaching here is not neutral — it
  actively weakens the term.
- **Drift between the interface and the licence files.** If the year, the holder's name, the licence
  identifier or the source URL in the interface stops matching `LICENSE`, `NOTICE` and
  `LICENSE-ADDITIONAL-TERMS.md`, the product makes two contradictory legal statements about itself,
  which is worse evidentially than making one.
- **A version identifier that does not track releases.** A hardcoded string that nobody remembers to
  bump will confidently point a user at the wrong source, which is more misleading than showing no
  version at all.
- **A source route that breaks silently.** If the repository is renamed, moved or made private, the
  interface keeps displaying a dead route and the section 13 mechanism fails with no visible symptom.
  The URL's stability becomes a standing obligation of the project, not a one-off decision.
- **Label and internal identity diverge.** With the screen shown as "About" but internally still the
  coverage-matrix screen, documentation, specifications, test names and screenshots that say "Coverage
  matrix" become ambiguous. The reported F29 is the known instance; others are likely, and each one
  left behind costs a future reader time.
- **The functional coverage matrix loses prominence.** The screen is being asked to answer two
  questions — "what does this cover" and "what is this" — under a name that only signals the second. An
  operator looking for the coverage matrix may no longer guess where it lives, which quietly erodes the
  transparency commitment the reference analysis set as a non-functional requirement.
- **Overestimating the protection gained.** A notice is evidence and a licence condition; it is not
  enforcement. A determined fork can strip it and the owner's only recourse is the one every copyleft
  author has. The realistic expectation is that the notice makes attribution the default outcome for
  the honest majority and makes removal a demonstrable, deliberate act for the rest.
- **Offline installations.** On an air-gapped host, the route to the source is a URL the operator can
  read but not follow. Acceptable, and unavoidable without shipping an in-app licence reader, but it
  means the notice must be self-sufficient as text.
- **Loose wording of the trademark term.** Stating the 7(e) reservation carelessly can read as claiming
  more control over forks than the licence permits, which contradicts the AGPL's grant and damages
  trust with exactly the audience the notice is addressed to.

## Scope

**In scope:** re-labelling the application's self-dedicated screen from "Coverage matrix" to "About"
for the operator, keeping its internal identity, its navigation position and its existing content
(CLI availability, daemon event stream, analysis cache, functional coverage matrix); adding to that
screen a single, self-contained, always-reachable identity and legal notice stating the product name,
the author's copyright, the AGPL-3.0 licence with a route to its full text and to the section 7
additional terms, the absence of warranty, the freedom to convey the work, the running version, a
one-step and text-legible route to the source repository, the warning that a modified version exposed
over a network must offer its own source and preserve the author attribution, and the reservation of
the "Vexel" name; and retitling and extending the existing requirement reported as F29 so the
specification names the same screen the product does.

**Out of scope** (unless a future evolution request extends it): a licence or attribution footer
repeated on every screen; an in-application reader for the full licence texts or offline copies of
them; a first-run or blocking licence acknowledgement; any operator setting to hide, empty or edit the
notice; a third-party dependency licence/attribution listing (an SBOM-style page); any mechanism for a
fork to declare itself a modified version under 7(c); an update-availability check, release-notes
feed, telemetry or any other network call attached to the version display; changes to the licence
itself or to the additional terms; trademark registration or any other legal action outside the
product; contributor licensing (CLA/DCO) and repository-side governance files; translation of the
notice into other languages; and any rework of the screen's existing cards or of the coverage matrix
beyond what hosting the notice requires. Monetization remains out of scope as in the reference
analysis.
