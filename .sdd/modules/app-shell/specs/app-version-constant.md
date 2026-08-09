---
module: app-shell
component: Build-time version constant
type: configuration
---

# Build-time version constant

**Purpose** → make the version the project declares for the build being run readable by client code
as a plain constant, without a request and without a second version string anywhere in the
repository.

## Contract

- exposes `__APP_VERSION__`, a string constant available to every module of the client, holding the
  `version` the repository root `package.json` declares.
- it is substituted into the code when the client is built, and equally when the client is run under
  unit test: a component reading it renders the same version in both.
- it is declared to the type system, so a module reading it typechecks under the app build and under
  the test-tree typecheck.

## Rules and invariants

- The root `package.json` is the single place the running version lives; `client/package.json` and
  `server/package.json` stay at `0.0.0` for good — both are private and never published, and one
  place to bump is what stops two version strings in this repository from disagreeing about which
  build is running. Each of the three files states this where a reader meets it.
- Bumping the version in the root `package.json` and rebuilding changes what the About notice shows,
  with no edit to the notice
  (plan-docker_management_app-about_license_notice/REQ-15).
- The value is read while the build is configured, never at run time: no request is made to obtain
  it, so what reads it works on a host with no outbound connectivity
  (plan-docker_management_app-about_license_notice/REQ-19).
- A root `package.json` declaring no version fails the build rather than producing a build that
  displays nothing.

## Requirements served

- plan-docker_management_app-about_license_notice/REQ-15
- plan-docker_management_app-about_license_notice/REQ-19
