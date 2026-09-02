import { useCallback, useRef, useState } from 'react';
import { IconButton, useToast } from '../ui';
import { awaitReloadEnd } from '../data/live-channel';
import { requestServerReload } from '../data/refresh-client';
import { requestReload } from '../data/reload-signal';

const REFRESH_GLYPH = '↻';

/**
 * The top bar's refresh control: the server reads again every value it holds,
 * and the press is over once the channel has delivered what that reading
 * produced — not when the endpoint answers, the two being two connections
 * (REQ-23, REQ-34).
 */
export function RefreshControl() {
  const [busy, setBusy] = useState(false);
  // A second press is refused from the press itself, not from the render after it.
  const busyRef = useRef(false);
  const { push } = useToast();

  const press = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // Parked before the request: the channel can carry the reading's end before
    // the endpoint answers, and a wait raised afterwards would miss it.
    const delivered = awaitReloadEnd();
    void requestServerReload()
      .then(async (report) => {
        await requestReload();
        await delivered;
        if (report.ok) push({ title: 'Refreshed', tone: 'success' });
        else push({ title: 'Refresh failed', message: 'Some values could not be read again.', tone: 'danger' });
      })
      .catch((cause: Error) => {
        push({ title: 'Refresh failed', message: cause.message, tone: 'danger' });
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  }, [push]);

  return (
    <IconButton label="Refresh" busy={busy} onClick={press}>
      {REFRESH_GLYPH}
    </IconButton>
  );
}
