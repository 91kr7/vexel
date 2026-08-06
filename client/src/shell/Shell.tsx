import { useState } from 'react';
import {
  Button,
  ErrorBanner,
  FooterStatus,
  Frame,
  KeyHint,
  NavBrand,
  NavGroup,
  NavItem,
  NavRail,
  PageHeader,
  Row,
  Stack,
  StatusPill,
  ToastProvider,
} from '../ui';
import { defaultScreenId, navGroupOrder, screens } from './navigation';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { ConfirmationProvider } from './services/ConfirmationService';
import { useErrorReporter } from './services/ErrorReportingService';
import { useProgress } from './services/ProgressService';

/**
 * "Vessel — Docker Control" shell: rail, header, footer stay in place while
 * the content area is replaced by the active screen (REQ-1, REQ-2).
 *
 * Owns the toast and confirmation services itself (screen-local concerns);
 * error-reporting and progress tracking are supplied by the caller (App), so
 * other code can observe them independently of the shell chrome.
 */
export function Shell() {
  const [activeId, setActiveId] = useState(defaultScreenId);
  const { errors, dismissError } = useErrorReporter();
  const { pending } = useProgress();

  const activeScreen = screens.find((screen) => screen.id === activeId) ?? screens[0];

  return (
    <ToastProvider>
      <ConfirmationProvider>
        <Frame
          rail={
            <NavRail
              brand={<NavBrand name="Vessel" tagline="Docker control" />}
              footer={<FooterStatus label="Active context" value="default (local)" />}
            >
              {navGroupOrder.map((group) => (
                <NavGroup key={group} label={group}>
                  {screens
                    .filter((screen) => screen.group === group)
                    .map((screen) => (
                      <NavItem
                        key={screen.id}
                        glyph={screen.glyph}
                        label={screen.label}
                        active={screen.id === activeScreen.id}
                        onSelect={() => setActiveId(screen.id)}
                      />
                    ))}
                </NavGroup>
              ))}
            </NavRail>
          }
          header={
            <PageHeader
              title={activeScreen.title}
              description={activeScreen.description}
              actions={
                <Row align="center" gap="var(--space-2)">
                  <StatusPill tone={pending.length > 0 ? 'warning' : 'success'}>
                    {pending.length > 0 ? `${pending.length} pending` : 'Live · daemon events'}
                  </StatusPill>
                  <Button variant="ghost">
                    <KeyHint keys="⌘K" /> Search
                  </Button>
                  <Button variant="secondary">Console</Button>
                </Row>
              }
            />
          }
        >
          <Stack gap="var(--space-5)">
            {errors.map((error) => (
              <ErrorBanner key={error.id} title={error.title} detail={error.detail} onDismiss={() => dismissError(error.id)} />
            ))}
            <PlaceholderScreen screenLabel={activeScreen.label} />
          </Stack>
        </Frame>
      </ConfirmationProvider>
    </ToastProvider>
  );
}
