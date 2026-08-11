import type { ReactNode } from 'react';
import { Button } from '../controls/Button';
import { useEscapeClaim } from '../controls/escape-arbitration';
import { Surface } from '../glass/Surface';
import './feedback.css';

export interface FormSheetCommit {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface FormSheetProps {
  open: boolean;
  title: string;
  description?: string;
  /** Pinned above the scrolling body — stays visible whatever the scroll position (e.g. a rejection banner). */
  banner?: ReactNode;
  /** Commit choices, left to right; the last one is rendered as the primary action. */
  commitActions: FormSheetCommit[];
  busy?: boolean;
  busyLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  children?: ReactNode;
}

/**
 * Dialog surface for a long, sectioned form: header, an always-visible banner
 * slot, a scrolling body of sections, and a footer that stays in place at the
 * bottom holding cancel plus one or more commit choices.
 */
export function FormSheet({
  open,
  title,
  description,
  banner,
  commitActions,
  busy = false,
  busyLabel = 'Working…',
  cancelLabel = 'Cancel',
  onCancel,
  children,
}: FormSheetProps) {
  // Same as `Modal`: the open sheet claims `Escape` and does nothing with it, so
  // the key neither closes the sheet (unchanged) nor reaches a dismissible
  // surface on the screen it covers.
  useEscapeClaim(open, () => {});

  if (!open) return null;
  return (
    <div className="ui-modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="ui-form-sheet__positioner" onClick={(event) => event.stopPropagation()}>
        <Surface elevation="raised" material="overlay">
          <div className="ui-form-sheet">
            <div className="ui-form-sheet__header">
              <h2 className="ui-form-sheet__title">{title}</h2>
              {description ? <p className="ui-form-sheet__description">{description}</p> : null}
            </div>
            {banner ? <div className="ui-form-sheet__banner">{banner}</div> : null}
            <div className="ui-form-sheet__body">{children}</div>
            <div className="ui-form-sheet__footer">
              <Button variant="ghost" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </Button>
              {commitActions.map((action, index) => (
                <Button
                  key={action.id}
                  variant={index === commitActions.length - 1 ? 'primary' : 'secondary'}
                  onClick={action.onClick}
                  disabled={busy || action.disabled}
                >
                  {busy && index === commitActions.length - 1 ? busyLabel : action.label}
                </Button>
              ))}
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
