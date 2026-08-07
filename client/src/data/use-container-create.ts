import { useCallback, useState } from 'react';
import {
  createContainer,
  type ContainerCreateResult,
  type ContainerCreateSpec,
} from './container-create-client';
import type { ImageTransferStep } from './use-image-transfer';

export type ContainerCreatePhase = 'idle' | 'pulling' | 'creating' | 'created' | 'rejected';

export interface UseContainerCreateResult {
  phase: ContainerCreatePhase;
  /** Per-layer pull progress, empty when the image was already present locally. */
  pullSteps: ImageTransferStep[];
  /** The daemon's own refusal message; kept until the next submission or `reset()`. */
  rejection?: string;
  submit: (spec: ContainerCreateSpec) => Promise<ContainerCreateResult | undefined>;
  reset: () => void;
}

/**
 * Drives one container creation (REQ-27, REQ-28, REQ-29): pull progress while
 * the image is being fetched, then the create call. A refusal is exposed as
 * `rejection` and never throws at the caller, so the form that submitted keeps
 * every value the operator entered.
 */
export function useContainerCreate(onCreated?: () => void): UseContainerCreateResult {
  const [phase, setPhase] = useState<ContainerCreatePhase>('idle');
  const [pullSteps, setPullSteps] = useState<ImageTransferStep[]>([]);
  const [rejection, setRejection] = useState<string | undefined>(undefined);

  const reset = useCallback(() => {
    setPhase('idle');
    setPullSteps([]);
    setRejection(undefined);
  }, []);

  const submit = useCallback(
    async (spec: ContainerCreateSpec) => {
      setPhase('creating');
      setPullSteps([]);
      setRejection(undefined);
      try {
        const result = await createContainer(spec, {
          onPullStep: (step) => {
            setPhase('pulling');
            setPullSteps((current) => {
              const index = current.findIndex((existing) => existing.id === step.id);
              if (index === -1) return [...current, step];
              const next = [...current];
              next[index] = step;
              return next;
            });
          },
          onImageResolved: () => setPhase('creating'),
        });
        setPhase('created');
        onCreated?.();
        return result;
      } catch (cause) {
        setPhase('rejected');
        setRejection((cause as Error).message);
        return undefined;
      }
    },
    [onCreated],
  );

  return { phase, pullSteps, rejection, submit, reset };
}
