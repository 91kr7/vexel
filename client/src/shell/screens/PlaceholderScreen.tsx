import { useState } from 'react';
import { Button, EmptyState, useToast } from '../../ui';
import { useConfirmation } from '../services/ConfirmationService';

export interface PlaceholderScreenProps {
  screenLabel: string;
}

const demoTargetName = 'demo-container';

/**
 * Stand-in content for a screen not yet implemented by a later batch. Also
 * hosts the foundation batch's destructive-confirmation demo (REQ-6): a
 * control that goes through ConfirmationService before doing anything.
 */
export function PlaceholderScreen({ screenLabel }: PlaceholderScreenProps) {
  const { confirm } = useConfirmation();
  const { push } = useToast();
  const [removed, setRemoved] = useState(false);

  async function handleRemoveDemoContainer() {
    const confirmed = await confirm({
      targetName: demoTargetName,
      consequence: 'This will permanently remove it and its data.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    setRemoved(true);
    push({ title: `${demoTargetName} removed`, tone: 'danger' });
  }

  return (
    <EmptyState
      title={`${screenLabel} is not built yet`}
      description="This area of Vexel is scaffolded by the foundation batch and will be replaced by its own feature batch."
      action={
        <Button variant="destructive" onClick={handleRemoveDemoContainer} disabled={removed}>
          {removed ? `${demoTargetName} removed` : `Remove ${demoTargetName}`}
        </Button>
      }
    />
  );
}
