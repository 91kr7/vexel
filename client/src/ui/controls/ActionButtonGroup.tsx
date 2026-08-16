import { Button, type ButtonVariant } from './Button';
import { Menu, type MenuEntry } from './Menu';
import './controls.css';

/**
 * How much an action weighs, which is the **only** thing a caller says about
 * it. What it then looks like — a filled button, a quiet one, a red one, an
 * entry in the overflow menu — is the cluster's to decide, and that is what
 * makes the rule un-re-answerable by a screen: there is no prop with which to
 * ask for an appearance.
 *
 * There is deliberately **no `text` weight**. Bare text is never a control:
 * every weight below renders a control, and the way to make an action quieter
 * than `secondary` is `overflow`, not the removal of its affordance.
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
  /**
   * How much the action weighs (default `'secondary'`). `'destructive'` is a
   * weight like any other; the `destructive` flag below is the same statement
   * in the shape the delivered call sites already use.
   */
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
  /**
   * The menu the `overflow`-weight actions are collected into, always the
   * group's last, trailing slot. Required as soon as an action weighs
   * `overflow`, because its trigger needs a name; an overflow-weighted action
   * with no menu to go to is simply not rendered rather than silently promoted
   * back to a button.
   */
  overflow?: ActionButtonGroupOverflow;
}

function actionWeight(action: RowAction): ActionWeight {
  return action.weight ?? (action.destructive ? 'destructive' : 'secondary');
}

/**
 * The one action cluster: a caller declares its actions and their weight, and
 * the cluster decides what is a button and what becomes an entry of the trailing
 * overflow menu. Stops click propagation so an action never also triggers the
 * containing row's `onRowSelect`.
 */
export function ActionButtonGroup({ actions, overflow }: ActionButtonGroupProps) {
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

  return (
    <div className="ui-action-button-group" onClick={(event) => event.stopPropagation()}>
      {buttons.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant={weightVariant[actionWeight(action) as Exclude<ActionWeight, 'overflow'>]}
          disabled={action.disabled}
          description={action.disabled ? action.disabledReason : undefined}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
      {overflow ? <Menu label={overflow.label} entries={entries} /> : null}
    </div>
  );
}
