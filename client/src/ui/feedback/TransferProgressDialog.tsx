import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../controls/Button';
import { Modal } from './Modal';
import { ProgressBar } from './ProgressBar';
import './feedback.css';

export type TransferStatus = 'active' | 'done' | 'error';

export interface TransferProgressDialogProps {
  open: boolean;
  title: string;
  description?: string;
  currentBytes: number;
  totalBytes?: number;
  status: TransferStatus;
  onCancel: () => void;
  onClose: () => void;
  /** Optional retry, offered beside `Close` once the transfer has failed, for a caller that has somewhere to send the operator back to; omitted, a failure only offers its dismissal. */
  onRetry?: () => void;
  children?: ReactNode;
  /** Overrides the default byte-formatted caption, for a determinate operation whose progress is not measured in bytes (e.g. a layer count). Receives the raw `currentBytes`/`totalBytes` values. Never consulted once the operation is done: completion is worded here. */
  formatCaption?: (currentBytes: number, totalBytes?: number) => string;
  /**
   * Opt-in: once the completed state has been rendered, dismisses the dialog by itself after
   * {@link AUTO_CLOSE_MS}, through the same `onClose` a manual close calls.
   *
   * **Off by default, deliberately.** A caller that forgets it gets a dialog that waits to be
   * dismissed — which is only a delay; a dialog that leaves on its own when it should not have
   * takes with it whatever it alone was showing. So the dialogs whose body carries the operation's
   * only result (the references of the images a tarball transfer just created) simply do not ask
   * for it, and are correct by omission.
   */
  autoCloseOnDone?: boolean;
}

/** The completion wording, once for every surface built on this dialog: no caller supplies its own. */
const DONE_CAPTION = 'Completed';

/**
 * The wait between the completed state being rendered and the dialog dismissing itself. Fixed on
 * purpose: not configurable, not adaptive, and not a function of how long the operation took — long
 * enough for the completion to be read, short enough not to be an obstacle.
 */
const AUTO_CLOSE_MS = 1000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

/**
 * Dialog for a long-running byte transfer (e.g. saving/loading a tarball): a
 * byte progress bar with a cancel action while it runs, and a close action
 * once it ends, successfully or not. When it ends successfully it says so —
 * in words, not by a full bar alone — and, if the caller opted in, dismisses
 * itself a second later. A failure is the caller's to report, as a toast
 * (plan-docker_management_app-inline_error_panels/REQ-5): the dialog states none and
 * keeps the progress where the transfer stopped.
 */
export function TransferProgressDialog({
  open,
  title,
  description,
  currentBytes,
  totalBytes,
  status,
  onCancel,
  onClose,
  onRetry,
  children,
  formatCaption,
  autoCloseOnDone = false,
}: TransferProgressDialogProps) {
  const percent = totalBytes ? Math.min(100, Math.round((currentBytes / totalBytes) * 100)) : undefined;
  const done = status === 'done';
  const caption = done
    ? DONE_CAPTION
    : formatCaption
      ? formatCaption(currentBytes, totalBytes)
      : totalBytes
        ? `${formatBytes(currentBytes)} / ${formatBytes(totalBytes)}`
        : `${formatBytes(currentBytes)} transferred`;

  // The caller's own callback, read through a ref: a pending close must not be re-armed — and so
  // never elapse — merely because a re-render handed the dialog a new inline function.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // A pending close belongs to the completion that armed it. The effect arms on the transition into
  // the completed state and disarms on unmount, on the dialog closing, and on leaving that state —
  // a re-run started inside the second being the realistic case.
  const armed = open && done && autoCloseOnDone;
  // Guards the one close against arriving twice when the hand and the timer land together: whoever
  // gets there first closes, the other finds it already done.
  const closeRequestedRef = useRef(false);
  useEffect(() => {
    if (!armed) {
      closeRequestedRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      if (closeRequestedRef.current) return;
      closeRequestedRef.current = true;
      onCloseRef.current();
    }, AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const requestClose = () => {
    if (armed) {
      if (closeRequestedRef.current) return;
      closeRequestedRef.current = true;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={status === 'active' ? onCancel : requestClose}
      actions={
        status === 'active' ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <>
            {status === 'error' && onRetry ? (
              <Button variant="ghost" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
            <Button variant="primary" onClick={requestClose}>
              Close
            </Button>
          </>
        )
      }
    >
      <div className="ui-transfer-progress-dialog">
        {description ? <p className="ui-form-dialog__description">{description}</p> : null}
        {/* The completion, for whoever is not looking at the dialog. A live region present from the
            start and empty until the moment it happens: a region announced into existence together
            with its own text is read by some assistive technologies and not by others. It carries
            no phase, so a progress that ticks does not talk over everything else, and it takes no
            focus — nothing here moves the keyboard. */}
        <p className="ui-transfer-progress-dialog__announcement" role="status">
          {done ? DONE_CAPTION : ''}
        </p>
        <div className="ui-transfer-progress-dialog__progress">
          <ProgressBar percent={done ? 100 : percent} />
          <p className="ui-transfer-progress-dialog__caption">{caption}</p>
        </div>
        {done ? children : null}
      </div>
    </Modal>
  );
}
