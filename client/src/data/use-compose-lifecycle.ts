import { useCallback, useState } from 'react';
import {
  bringComposeProjectDown,
  bringComposeProjectUp,
  restartComposeProject,
  scaleComposeService,
  type ComposeProjectSummary,
} from './compose-client';

export interface UseComposeLifecycleResult {
  /** Names of the projects with a lifecycle or scale command currently running. */
  runningProjects: string[];
  up: (projectName: string) => Promise<ComposeProjectSummary | undefined>;
  down: (projectName: string) => Promise<ComposeProjectSummary | undefined>;
  restart: (projectName: string) => Promise<ComposeProjectSummary | undefined>;
  scale: (projectName: string, service: string, replicas: number) => Promise<ComposeProjectSummary | undefined>;
}

/**
 * Drives compose stack lifecycle and per-service scaling (REQ-76). Every
 * action resolves with the project's resulting state and never throws at the
 * caller; failures are reported through `onError`.
 */
export function useComposeLifecycle(onResult: (project: ComposeProjectSummary) => void, onError: (message: string) => void): UseComposeLifecycleResult {
  const [runningProjects, setRunningProjects] = useState<string[]>([]);

  const withTracking = useCallback(
    async (projectName: string, task: () => Promise<ComposeProjectSummary>): Promise<ComposeProjectSummary | undefined> => {
      setRunningProjects((current) => [...current, projectName]);
      try {
        const project = await task();
        onResult(project);
        return project;
      } catch (cause) {
        onError((cause as Error).message);
        return undefined;
      } finally {
        setRunningProjects((current) => current.filter((name) => name !== projectName));
      }
    },
    [onResult, onError],
  );

  const up = useCallback((projectName: string) => withTracking(projectName, () => bringComposeProjectUp(projectName)), [withTracking]);
  const down = useCallback((projectName: string) => withTracking(projectName, () => bringComposeProjectDown(projectName)), [withTracking]);
  const restart = useCallback((projectName: string) => withTracking(projectName, () => restartComposeProject(projectName)), [withTracking]);
  const scale = useCallback(
    (projectName: string, service: string, replicas: number) => withTracking(projectName, () => scaleComposeService(projectName, service, replicas)),
    [withTracking],
  );

  return { runningProjects, up, down, restart, scale };
}
