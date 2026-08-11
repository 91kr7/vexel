// CLAUDE.md escape hatch: xterm.js is a third-party terminal emulator that
// renders into and owns a host DOM element it manages internally (its own
// canvas/DOM renderer, cursor blinking, selection). No UI-library primitive
// can host that renderer, so this component wraps it directly. It is the
// only place in the client aware of the emulator; everything else sees only
// the typed handle and callbacks below.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { useKeystrokeRegion } from '../controls/escape-arbitration';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

export interface TerminalHandle {
  /** Writes raw output into the terminal (e.g. session data received from the server). */
  write(data: string): void;
  focus(): void;
  dispose(): void;
}

export interface TerminalProps {
  /** Fires with raw keystroke/paste bytes as the operator types. */
  onInput?: (data: string) => void;
  /** Fires with the terminal's character grid size whenever it is (re)computed. */
  onResize?: (cols: number, rows: number) => void;
}

/** Interactive terminal surface (REQ-34, REQ-35): themed to the library's tokens, sized to its host. */
export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal({ onInput, onResize }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  onInputRef.current = onInput;
  onResizeRef.current = onResize;

  // Every keystroke typed in here belongs to the session, `Escape` included: the
  // host is declared a region owning its own keys, so no dismissible surface
  // around it is ever resolved by a key the session was meant to receive. The
  // guarantee is the library's own and is not delegated to the emulator calling
  // `preventDefault()` — a session that quietly stops receiving one key still
  // looks like a working session.
  useKeystrokeRegion(hostRef);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const styles = getComputedStyle(document.documentElement);
    const term = new XTermTerminal({
      convertEol: true,
      fontFamily: styles.getPropertyValue('--font-family-mono').trim() || 'monospace',
      fontSize: 13,
      theme: {
        background: '#00000000',
        foreground: styles.getPropertyValue('--color-text-primary').trim(),
        cursor: styles.getPropertyValue('--color-accent').trim(),
        selectionBackground: styles.getPropertyValue('--color-accent-tint').trim(),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    onResizeRef.current?.(term.cols, term.rows);

    const inputSubscription = term.onData((data) => onInputRef.current?.(data));
    const resizeSubscription = term.onResize(({ cols, rows }) => onResizeRef.current?.(cols, rows));

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(host);

    termRef.current = term;

    return () => {
      resizeObserver.disconnect();
      inputSubscription.dispose();
      resizeSubscription.dispose();
      term.dispose();
      termRef.current = null;
    };
    // Mounted once per Terminal instance; callers pass stable callbacks or accept the initial ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      write: (data: string) => termRef.current?.write(data),
      focus: () => termRef.current?.focus(),
      dispose: () => termRef.current?.dispose(),
    }),
    [],
  );

  return <div ref={hostRef} className="ui-terminal-host" />;
});
