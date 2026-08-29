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
| kill-pending-processes-before-tests | how-to | test | Before launching the tests, kill every pending process — human-started ones included | `entries/kill-pending-processes-before-tests.md` |
| past-analyses-and-plans-are-never-touched | guideline | any | Past analyses and plans are a record and are never edited; specs and indexes mirror the app and follow it | `entries/past-analyses-and-plans-are-never-touched.md` |
| technical-debt-goes-in-the-tech-debt-register | guideline | any | Technical debt is recorded in `.sdd/tech-debt/`, never as a code TODO or an unscoped plan item; a debt that is fixed is removed from the register | `entries/technical-debt-goes-in-the-tech-debt-register.md` |
