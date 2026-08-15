import { Callout, Card, ExternalLink, Row, SectionHeader, Stack } from '../ui';

const sourceUrl = 'https://github.com/91kr7/vexel';
// `HEAD` resolves to the repository's default branch, so neither document route
// breaks if that branch is ever renamed.
const licenseUrl = `${sourceUrl}/blob/HEAD/LICENSE`;
const additionalTermsUrl = `${sourceUrl}/blob/HEAD/LICENSE-ADDITIONAL-TERMS.md`;

/**
 * The application's identity and legal notice: the Appropriate Legal Notices
 * the AGPL asks an interactive network application to display, kept as one
 * self-contained block on a screen of the permanent navigation.
 *
 * It reads from nothing — no preference, no fetch, no prop — so nothing can
 * hide, empty or edit it, and it renders identically on a host with no outbound
 * connectivity. Every name, year, license identifier and URL below is the one
 * shipped in `LICENSE`, `LICENSE-ADDITIONAL-TERMS.md` and `NOTICE` at the root
 * of the repository. Each paragraph sits in its own `Stack` — the library's
 * block wrapper — so two adjacent runs of prose never merge into one.
 *
 * Its title is the screen's one section-header treatment
 * (plan-ui-coherence-optimisation/REQ-70); nothing the notice states is the
 * titling's to change (REQ-72).
 */
export function AboutNotice() {
  return (
    <Card>
      <SectionHeader title="Identity and license" />
      <Callout tone="info" title="Vexel — Copyright (C) 2026 Christian Mariani">
        <Stack gap="var(--space-3)">
          <Stack>
            Vexel is free software, licensed under the GNU Affero General Public License, version 3
            (AGPL-3.0-only), supplemented by the additional terms permitted under section 7 of that
            license.
          </Stack>
          <Row gap="var(--space-4)" align="center" wrap>
            <ExternalLink href={licenseUrl} label="Full license text (LICENSE)" />
            <ExternalLink href={additionalTermsUrl} label="Additional terms (LICENSE-ADDITIONAL-TERMS.md)" />
          </Row>
          <Stack>
            This program comes with absolutely no warranty, to the extent permitted by applicable
            law.
          </Stack>
          <Stack>You may convey copies of Vexel, modified or not, under the terms of the same license.</Stack>
          <Row gap="var(--space-2)" align="center" wrap>
            Source:
            <ExternalLink href={sourceUrl} />
            version {__APP_VERSION__}
          </Row>
          <Stack>
            If you modify Vexel and let other people interact with it over a network, section 13 of
            the AGPL requires you to offer those users the complete corresponding source of your
            modified version, at no charge and under the same license, and the additional terms
            require you to preserve the author attribution above.
          </Stack>
          <Stack>
            No rights in the name “Vexel” are granted: the name is reserved, and a fork carries a
            name of its own.
          </Stack>
        </Stack>
      </Callout>
    </Card>
  );
}
