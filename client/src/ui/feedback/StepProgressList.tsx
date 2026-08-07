import { Badge } from '../controls/Badge';
import { ProgressBar } from './ProgressBar';
import './feedback.css';

export type ProgressStepStatus = 'pending' | 'active' | 'done' | 'error';

export interface ProgressStep {
  id: string;
  label: string;
  detail?: string;
  status: ProgressStepStatus;
  /** 0-100; omit for an indeterminate bar while `status` is `active`. */
  percent?: number;
}

export interface StepProgressListProps {
  steps: ProgressStep[];
}

const STATUS_LABEL: Record<ProgressStepStatus, string> = {
  pending: 'Pending',
  active: 'In progress',
  done: 'Done',
  error: 'Failed',
};

/** One row per unit of work (e.g. an image layer transfer), each with its own progress and terminal state. */
export function StepProgressList({ steps }: StepProgressListProps) {
  return (
    <div className="ui-step-progress-list">
      {steps.map((step) => (
        <div key={step.id} className="ui-step-progress-list__row">
          <div className="ui-step-progress-list__heading">
            <span className="ui-step-progress-list__label">{step.label}</span>
            <Badge tone={step.status === 'done' ? 'success' : step.status === 'error' ? 'danger' : 'neutral'}>
              {STATUS_LABEL[step.status]}
            </Badge>
          </div>
          {step.detail ? <p className="ui-step-progress-list__detail">{step.detail}</p> : null}
          {step.status === 'active' || step.status === 'pending' ? <ProgressBar percent={step.percent} /> : null}
        </div>
      ))}
    </div>
  );
}
