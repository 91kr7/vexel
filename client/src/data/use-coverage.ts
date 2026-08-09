import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToActiveContextChange } from './active-context';
import { fetchCoverageBaseline, type BaselineReport } from './system-client';
import { coverageAreas, countCoverage, type CoverageArea, type CoverageCounts } from '../coverage/coverage-map';

export interface UseCoverageResult {
  /** The declared coverage map; it is data of the application and never fails to load. */
  areas: CoverageArea[];
  counts: CoverageCounts;
  /** The last successfully read baseline; `undefined` until the first read succeeds. */
  baseline?: BaselineReport;
  loaded: boolean;
  error?: string;
  refresh: () => void;
}

/**
 * A payload that is not the promised shape is a failed read like any other: it
 * is reported, never stored, so the screen can never state a baseline the
 * server did not actually declare.
 */
function requireBaseline(report: BaselineReport | undefined): BaselineReport {
  const declared = report?.declared;
  const shaped =
    typeof declared === 'object' &&
    declared !== null &&
    typeof declared.engineApiVersion === 'string' &&
    typeof declared.cliVersion === 'string' &&
    (report?.comparison === 'match' ||
      report?.comparison === 'daemon-newer' ||
      report?.comparison === 'daemon-older' ||
      report?.comparison === 'unknown');
  if (!shaped) throw new Error('The server did not answer with the coverage baseline.');
  const daemon = report.daemon;
  if (daemon !== undefined && (typeof daemon.version !== 'string' || typeof daemon.apiVersion !== 'string')) {
    throw new Error('The server did not answer with the coverage baseline.');
  }
  return report;
}

/**
 * The coverage map joined with the baseline the coverage statement holds
 * against (REQ-105, REQ-106). The map is local data and is always available;
 * only the baseline travels, and its failure never hides the map.
 */
export function useCoverage(): UseCoverageResult {
  const [baseline, setBaseline] = useState<BaselineReport | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    fetchCoverageBaseline()
      .then((report) => {
        if (cancelledRef.current) return;
        setBaseline(requireBaseline(report));
        setError(undefined);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  // The daemon half of the baseline belongs to a daemon, not to the screen.
  useEffect(() => subscribeToActiveContextChange(refresh), [refresh]);

  return { areas: coverageAreas, counts: countCoverage(coverageAreas), baseline, loaded, error, refresh };
}
