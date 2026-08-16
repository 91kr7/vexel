import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VolumesNetworksScreen } from '../../src/volumes-networks/VolumesNetworksScreen';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

function baseVolumesProps() {
  return { volumes: [], loaded: true, onRefresh: () => undefined };
}

afterEach(cleanup);

// The Volumes panel it hosts calls useConfirmation()/useToast(), so the screen
// needs the same providers Shell supplies in production — layout is what this
// test is about, not those services' own behaviour.
function renderScreen(networksPanel?: ReactNode) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <VolumesNetworksScreen volumes={baseVolumesProps()} networksPanel={networksPanel} />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

// volumes-networks-screen.md — one column: the Volumes panel, then the Networks panel under it, each
// at the screen's full content width, so that the detail either of them reveals is full width too
describe('VolumesNetworksScreen — layout (plan-ui-coherence-optimisation/REQ-32)', () => {
  it('lays the panels out in one column, stating no track template of its own', () => {
    renderScreen(<p>networks placeholder</p>);

    expect(document.querySelector('.ui-stack')).not.toBeNull();
    // Neither list is confined to a column of half the screen: the pair could not
    // have been kept in any form, since the list's width is the panel's width.
    expect(document.querySelectorAll('.ui-grid')).toHaveLength(0);
  });

  it('renders the Networks panel below the Volumes panel, not beside it', () => {
    renderScreen(<p>networks placeholder</p>);

    const volumes = screen.getByRole('heading', { level: 2, name: 'Volumes' });
    const networks = screen.getByText('networks placeholder');
    expect(volumes.compareDocumentPosition(networks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the Volumes panel alone when no networks panel is supplied', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 2, name: 'Volumes' })).toBeInTheDocument();
    expect(document.querySelectorAll('.ui-grid')).toHaveLength(0);
  });

  // volumes-networks-screen.md — the screen carries no actions: each panel's page-level actions sit
  // in that panel's own toolbar.
  //
  // **The claim is unchanged; what proved it had to move.** It read "every toolbar is inside a
  // surface", which was how a toolbar was shown to belong to a panel while a panel *was* a surface.
  // Since `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40` a
  // panel's section header and toolbar sit **above** the one unpadded card holding its list, so no
  // toolbar is inside a surface at all and the old form asserted the composition the plan retired.
  // A toolbar's panel is therefore the innermost region carrying both a section header and a list —
  // the same region on a screen still drawn the old way, its card.
  it('carries no toolbar of its own beyond the panels\' own', () => {
    renderScreen(<p>networks placeholder</p>);

    const networksPanel = screen.getByText('networks placeholder');
    const toolbars = Array.from(document.querySelectorAll('.ui-screen-toolbar'));
    expect(toolbars.length, 'the volumes panel draws no page-level toolbar at all').toBeGreaterThan(0);
    for (const toolbar of toolbars) {
      let region: Element | null = toolbar.parentElement;
      while (
        region !== null &&
        (region.querySelector('.ui-section-header') === null || region.querySelector('.ui-data-table') === null)
      ) {
        region = region.parentElement;
      }
      expect(region, 'a screen toolbar is drawn outside every panel').not.toBeNull();
      expect(
        region!.contains(networksPanel),
        'a screen toolbar spans both panels, so it is the screen’s own rather than one panel’s',
      ).toBe(false);
    }
  });
});
