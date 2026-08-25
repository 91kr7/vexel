import type { ReactNode } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { Menu, type MenuEntry } from './Menu';
import './controls.css';

/**
 * How much an action weighs — the only thing a caller says about it; the appearance is
 * the cluster's. No `text` weight: quieter than `secondary` is `overflow`, never bare text.
 */
export type ActionWeight = 'primary' | 'secondary' | 'destructive' | 'overflow';

const weightVariant: Record<Exclude<ActionWeight, 'overflow'>, ButtonVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  destructive: 'destructive',
};

export interface RowAction {
  id: string;
  label: string;
  onClick: () => void;
  /** How much the action weighs (default `'secondary'`). */
  weight?: ActionWeight;
  /** Shorthand for `weight: 'destructive'`; ignored when `weight` is given. */
  destructive?: boolean;
  disabled?: boolean;
  /** Why the action is unavailable, so a greyed control is legible as "not now, because…". */
  disabledReason?: string;
}

export interface ActionButtonGroupOverflow {
  /** Accessible name of the trigger, e.g. "More actions for web-1". */
  label: string;
  /** Entries stated directly; the `overflow`-weight actions are appended after them. */
  entries?: MenuEntry[];
}

export interface ActionButtonGroupProps {
  actions: RowAction[];
  /** Draws the cluster as one segmented control: appearance only, the actions are untouched. */
  segmented?: boolean;
  /** How large the controls are (default `'sm'`, the list row's density); the actions are untouched. */
  size?: ButtonSize;
  /** The trailing menu the `overflow`-weight actions go to; without it such an action is not rendered. */
  overflow?: ActionButtonGroupOverflow;
}

function actionWeight(action: RowAction): ActionWeight {
  return action.weight ?? (action.destructive ? 'destructive' : 'secondary');
}

/**
 * The one action cluster: the caller declares actions and weights, the cluster decides what is a
 * button and what an overflow entry. Stops click propagation, so an action never also selects the row.
 */
export function ActionButtonGroup({ actions, overflow, segmented = false, size = 'sm' }: ActionButtonGroupProps) {
  const buttons = actions.filter((action) => actionWeight(action) !== 'overflow');
  const demoted: MenuEntry[] = actions
    .filter((action) => actionWeight(action) === 'overflow')
    .map((action) => ({
      id: action.id,
      label: action.label,
      onSelect: action.onClick,
      disabled: action.disabled,
      disabledReason: action.disabledReason,
    }));
  const entries = [...(overflow?.entries ?? []), ...demoted];

  // One segment element per slot, so the stylesheet has something to round whether
  // the slot holds a bare button or one wrapped in its disabled-reason tooltip.
  const wrap = (key: string, control: ReactNode) =>
    segmented ? (
      <span key={key} className="ui-action-button-group__segment">
        {control}
      </span>
    ) : (
      control
    );

  return (
    <div
      className={segmented ? 'ui-action-button-group ui-action-button-group--segmented' : 'ui-action-button-group'}
      onClick={(event) => event.stopPropagation()}
    >
      {buttons.map((action) =>
        wrap(
          action.id,
          <Button
            key={action.id}
            size={size}
            variant={weightVariant[actionWeight(action) as Exclude<ActionWeight, 'overflow'>]}
            disabled={action.disabled}
            description={action.disabled ? action.disabledReason : undefined}
            onClick={action.onClick}
          >
            {action.label}
          </Button>,
        ),
      )}
      {overflow ? wrap('overflow', <Menu key="overflow" label={overflow.label} entries={entries} />) : null}
    </div>
  );
}
