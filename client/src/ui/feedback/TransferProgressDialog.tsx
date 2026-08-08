import type { ReactNode } from 'react';
import { Button } from '../controls/Button';
import { ErrorBanner } from './ErrorBanner';
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
  errorMessage?: string;
  onCancel: () => void;
  onClose: () => void;
  children?: ReactNode;
  /** Overrides the default byte-formatted caption, for a determinate operation whose progress is not measured in bytes (e.g. a layer count). Receives the raw `currentBytes`/`totalBytes` values. */
  formatCaption?: (currentBytes: number, totalBytes?: number) => string;
}

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
 * once it ends, successfully or not.
 */
export function TransferProgressDialog({
  open,
  title,
  description,
  currentBytes,
  totalBytes,
  status,
  errorMessage,
  onCancel,
  onClose,
  children,
  formatCaption,
}: TransferProgressDialogProps) {
  const percent = totalBytes ? Math.min(100, Math.round((currentBytes / totalBytes) * 100)) : undefined;
  const caption = formatCaption
    ? formatCaption(currentBytes, totalBytes)
    : totalBytes
      ? `${formatBytes(currentBytes)} / ${formatBytes(totalBytes)}`
      : `${formatBytes(currentBytes)} transferred`;

  return (
    <Modal
      open={open}
      title={title}
      onClose={status === 'active' ? onCancel : onClose}
      actions={
        status === 'active' ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="ui-transfer-progress-dialog">
        {description ? <p className="ui-form-dialog__description">{description}</p> : null}
        {status !== 'error' ? (
          <div className="ui-transfer-progress-dialog__progress">
            <ProgressBar percent={status === 'done' ? 100 : percent} />
            <p className="ui-transfer-progress-dialog__caption">{caption}</p>
          </div>
        ) : null}
        {status === 'error' ? <ErrorBanner title="Transfer failed" detail={errorMessage ?? 'The transfer was interrupted.'} /> : null}
        {status === 'done' ? children : null}
      </div>
    </Modal>
  );
}
