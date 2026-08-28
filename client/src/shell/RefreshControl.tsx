import { useCallback, useRef, useState } from 'react';
import { IconButton, useToast } from '../ui';
import { requestServerReload } from '../data/refresh-client';
import { requestReload } from '../data/reload-signal';

const REFRESH_GLYPH = '↻';

/**
 * The top bar's refresh control: the server reads again every value it holds,
 * then every mounted view re-reads, and only then is the press over (REQ-1 to
 * REQ-6).
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
    void requestServerReload()
      .then(async (report) => {
        await requestReload();
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
