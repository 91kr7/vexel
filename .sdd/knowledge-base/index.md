# Knowledge base — index

What the human has taught, one entry per row. Consult the entries whose `scope` covers your phase
(or is `any`); this index locates them, it does not explain them.

| Entry | Kind | Scope | Rule | File |
|-------|------|-------|------|------|
| teachings-go-in-the-knowledge-base | guideline | any | The assistant's own memory is forbidden; everything the human teaches goes here | `entries/teachings-go-in-the-knowledge-base.md` |
| an-opinion-asked-for-is-not-a-work-order | guideline | any | When the human asks for a parere, answer with the parere and do not develop it | `entries/an-opinion-asked-for-is-not-a-work-order.md` |
| every-change-updates-spec-requirements-plan | guideline | planning, development, test | A change to the product is carried into the component spec, the requirements and the plan in the same turn | `entries/every-change-updates-spec-requirements-plan.md` |
| visual-output-is-validated-before-tests | guideline | development, test | On a graphical fix the human validates the visual output before any test is written or run | `entries/visual-output-is-validated-before-tests.md` |
| development-goes-through-sdd-dev | guideline | any | Implement through the `sdd-dev` command, never by calling `sdd-developer` / `sdd-tester` by hand | `entries/development-goes-through-sdd-dev.md` |
| full-suite-commands | how-to | test | A full pass is run with `npm run test:e2e -w client -- --quiet` and `npm run test`, in exactly that form | `entries/full-suite-commands.md` |
| one-playwright-process-at-a-time | how-to | test | Never two Playwright processes at once, and a full pass is for discovering and for verifying, not for iterating | `entries/one-playwright-process-at-a-time.md` |
| destructive-tests-run-beside-the-rest | guideline | test | The host-wide tests live with every other file, and nothing separates them any more | `entries/destructive-tests-run-beside-the-rest.md` |
| save-the-traces-before-the-next-run | how-to | test | Traces are copied out of the repository before each run, because the next run empties `test-results/` | `entries/save-the-traces-before-the-next-run.md` |
| read-playwright-traces-without-a-browser | how-to | test | A trace is read from the files in its zip, never with `show-trace`, and every failure's trace is read | `entries/read-playwright-traces-without-a-browser.md` |
| an-intermittent-failure-is-reproduced-first | how-to | test | A failure that comes and goes is pinned with `--repeat-each` before a cause is written for it | `entries/an-intermittent-failure-is-reproduced-first.md` |
| a-long-wait-is-a-diagnosis-not-a-cure | how-to | test | A ~25 s wait in front of an assertion tells timing from truth; it is a probe and is always removed | `entries/a-long-wait-is-a-diagnosis-not-a-cure.md` |
| a-check-is-never-weakened-to-pass | guideline | development, test | A defect in the product is repaired in the product; no check is weakened, softened or given a longer budget to pass | `entries/a-check-is-never-weakened-to-pass.md` |
| a-neutralisation-is-undone-before-delivery | guideline | test | A source neutralised to obtain a red run is restored, and the empty `git diff` of both source trees is stated in the report | `entries/a-neutralisation-is-undone-before-delivery.md` |
| kill-pending-processes-before-tests | how-to | test | Before launching the tests, kill every pending process — human-started ones included | `entries/kill-pending-processes-before-tests.md` |
| past-analyses-and-plans-are-never-touched | guideline | any | Past analyses and plans are a record and are never edited; specs and indexes mirror the app and follow it | `entries/past-analyses-and-plans-are-never-touched.md` |
| technical-debt-goes-in-the-tech-debt-register | guideline | any | Technical debt is recorded in `.sdd/tech-debt/`, never as a code TODO or an unscoped plan item; a debt that is fixed is removed from the register | `entries/technical-debt-goes-in-the-tech-debt-register.md` |
| explain-in-plain-italian | guideline | any | Explanations to the human are in plain, short Italian and stand without the code: the product and what the operator sees, never the call chain | `entries/explain-in-plain-italian.md` |
| answers-are-read-from-the-code | guideline | any | An answer about the application is read from the code in the same turn, never recalled | `entries/answers-are-read-from-the-code.md` |
