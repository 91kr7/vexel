---
module: app-shell
component: AboutNotice
type: UI component
---

# AboutNotice

**Purpose** → the application's identity and legal notice: what this product is, whose it is, under
what terms it is licensed and where its source lives — the Appropriate Legal Notices the AGPL asks
an interactive network application to display.

## Contract

- `<AboutNotice />` — takes no props.

Description:
- one self-contained block: a card holding the screen's section header `Identity and license` over a
  single callout, whose body is a column of short paragraphs and two rows of routes.
Shows:
- the section title `Identity and license`, in the screen's one section-header treatment — the
  primitive's own, the same one every other section of the About screen carries
  (plan-ui-coherence-optimisation/REQ-70).
- the heading `Vexel — Copyright (C) 2026 Christian Mariani`, naming the product and the natural
  person holding the copyright with the year.
- that Vexel is free software licensed under the GNU Affero General Public License, version 3
  (`AGPL-3.0-only`), supplemented by the additional terms permitted under section 7 of that licence.
- two distinct routes, one per document, each reaching its own text in one step: the full licence
  (`LICENSE`) and the additional terms (`LICENSE-ADDITIONAL-TERMS.md`).
- that the program comes with absolutely no warranty, to the extent permitted by applicable law.
- that the operator may convey copies of Vexel, modified or not, under the terms of the same
  licence.
- the route to the source repository, `https://github.com/91kr7/vexel`, shown as the URL itself and
  followable in one step, with the running version of the build beside it.
- that whoever modifies Vexel and lets other people interact with it over a network must offer those
  users the complete corresponding source of that modified version, under the same licence and at no
  charge, and must preserve the author attribution above.
- that no rights in the name "Vexel" are granted: the name is reserved and a fork carries a name of
  its own.
Actions:
- following a route opens the document outside the application; nothing here changes any state of
  the application.
Navigation:
- it navigates nowhere inside the application and blocks nothing: it is content on a screen of the
  permanent navigation, not a dialog, an acknowledgement or a first-run gate.

## Rules and invariants

- It takes no props, reads no preference, no configuration file and no server response: there is
  nothing an operator, a setting or a stored value can change about what it displays — it cannot be
  hidden, emptied or edited
  (plan-docker_management_app-about_license_notice/REQ-8).
- Rendering it issues no network request of any kind — not for its content, not to check for an
  update, not to report the installation — so it is identical on a host with no outbound
  connectivity (plan-docker_management_app-about_license_notice/REQ-19).
- The author's name, the year, the licence identifier and the source URL it displays are the same as
  in `LICENSE`, `LICENSE-ADDITIONAL-TERMS.md` and `NOTICE` at the root of the repository
  (plan-docker_management_app-about_license_notice/REQ-18).
- The two licence routes address the two documents themselves, never the repository root: neither
  leaves the operator to search for the text.
- The version shown is the build-time version constant, so a release changes it with no edit here
  (plan-docker_management_app-about_license_notice/REQ-15).
- Every clause above is stated separately, so removing any one of them is visible: the copyright,
  the absence of warranty, the right to convey and the route to the licence are what make this a
  display of Appropriate Legal Notices at all.
- **Only the titling treatment is this plan's to change.** Not one word of the notice moves: the
  product name, the copyright, the licence with a route to each of its two documents, the absence of
  warranty, the right to convey, the repository with the running version, the network-modification
  duty and the reservation of the name read exactly as
  `plan-docker_management_app-about_license_notice` delivered them
  (plan-ui-coherence-optimisation/REQ-72).
- It carries no feature list, no release date and no claim depending on the current state of the
  product: the running version is the only part of it that changes over time
  (plan-docker_management_app-about_license_notice/REQ-22).
- It reads as a legal statement, not as promotion: no advertising of the author, no branding-led
  presentation, no call to action beyond the routes the licence itself asks for
  (plan-docker_management_app-about_license_notice/REQ-21).
- It is built from library components only — no raw markup, no stylesheet, no hard-coded colour or
  spacing — so its text meets the documented minimum contrast the rest of the application is held to
  (plan-docker_management_app/REQ-4, plan-docker_management_app-about_license_notice/REQ-20).

## Dependencies

- ui-library: Card, SectionHeader, Callout, Stack, Row, ExternalLink
- app-shell: Build-time version constant

## Requirements served

- plan-ui-coherence-optimisation/REQ-70
- plan-ui-coherence-optimisation/REQ-72
- plan-docker_management_app-about_license_notice/REQ-6
- plan-docker_management_app-about_license_notice/REQ-8
- plan-docker_management_app-about_license_notice/REQ-9
- plan-docker_management_app-about_license_notice/REQ-10
- plan-docker_management_app-about_license_notice/REQ-11
- plan-docker_management_app-about_license_notice/REQ-12
- plan-docker_management_app-about_license_notice/REQ-13
- plan-docker_management_app-about_license_notice/REQ-14
- plan-docker_management_app-about_license_notice/REQ-15
- plan-docker_management_app-about_license_notice/REQ-16
- plan-docker_management_app-about_license_notice/REQ-17
- plan-docker_management_app-about_license_notice/REQ-18
- plan-docker_management_app-about_license_notice/REQ-19
- plan-docker_management_app-about_license_notice/REQ-20
- plan-docker_management_app-about_license_notice/REQ-21
- plan-docker_management_app-about_license_notice/REQ-22
