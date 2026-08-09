import { useCallback, useState } from 'react';
import {
  Card,
  ChipGroup,
  ConsoleSurface,
  ErrorBanner,
  SectionHeader,
  SegmentedControl,
  Stack,
  StateSummaryBar,
  type ChipGroupItem,
  type ConsoleEntry,
} from '../ui';
import type { ConsoleChannel } from '../data/console-client';
import { useConsole, type ConsoleRunEntry } from '../data/use-console';
import { useContexts } from '../data/use-contexts';
import { useConfirmation } from '../shell/services/ConfirmationService';
import { useErrorReporter } from '../shell/services/ErrorReportingService';

const CHANNEL_OPTIONS = [
  { id: 'cli', label: 'docker CLI' },
  { id: 'api', label: 'Engine API' },
];

const CHANNEL_LABELS: Record<ConsoleChannel, string> = {
  cli: 'docker CLI',
  api: 'Engine API',
};

const PROMPT_PLACEHOLDER: Record<ConsoleChannel, string> = {
  cli: 'docker manifest inspect alpine:3.20',
  api: 'GET /containers/json?all=1',
};

/**
 * Stated on every entry and in the header: what runs here runs with everything
 * the daemon and the local user can do (REQ-104).
 */
const PRIVILEGE_NOTICE = 'Runs with the full privileges of the Docker daemon and of the user the server runs as';

/** The long tail the console is the intended escape hatch for (REQ-103). */
const CLI_SUGGESTIONS = [
  'docker manifest inspect ',
  'docker trust inspect --pretty ',
  'docker scout cves ',
  'docker sbom ',
  'docker buildx bake --print',
  'docker context inspect ',
  'docker plugin install ',
  'docker events --filter ',
  'docker system df -v',
  'docker checkpoint ls ',
];

/**
 * Capabilities their own screens deliberately do not carry (image building,
 * stack deploy, build-cache export, TCP+TLS context creation): the console is
 * where they stay reachable.
 */
const WITHDRAWN_SUGGESTIONS = [
  'docker build -t myimage:latest .',
  'docker stack deploy -c docker-compose.yml mystack',
  'docker buildx build --cache-to type=local,dest=./cache .',
  'docker context create remote --docker "host=tcp://host:2376,ca=./ca.pem,cert=./cert.pem,key=./key.pem"',
];

const API_SUGGESTIONS = [
  'GET /info',
  'GET /version',
  'GET /_ping',
  'GET /containers/json?all=1',
  'GET /images/json',
  'GET /networks',
  'GET /volumes',
  'GET /events?since=0',
  // Shown unquoted on purpose: that is the form the entry grammar takes as
  // typed, quotes and spacing included.
  'POST /containers/create?name=console-demo {"Image":"alpine:3.20","Cmd":["sleep","30"]}',
];

function statusTone(entry: ConsoleRunEntry): ConsoleEntry['statusTone'] {
  if (entry.status === 'cancelled') return 'warning';
  return entry.succeeded ? 'success' : 'danger';
}

function toSurfaceEntry(entry: ConsoleRunEntry): ConsoleEntry {
  return {
    id: entry.id,
    command: entry.command,
    channelLabel: CHANNEL_LABELS[entry.channel],
    lines: entry.lines,
    ...(entry.status ? { status: entry.status, statusTone: statusTone(entry) } : {}),
    running: entry.running,
    ...(entry.persisted ? {} : { note: 'not kept in history' }),
  };
}

/**
 * The raw command and API console (F28): both channels are real — a local
 * `docker` process against the active context, and a direct Engine API call
 * whose status and body are shown as the daemon returned them. The history it
 * recalls outlives a restart, and an entry recognised as destructive goes
 * through the application's own confirmation, naming the command, before it
 * runs.
 */
export function RawConsoleScreen() {
  const [channel, setChannel] = useState<ConsoleChannel>('cli');
  const [value, setValue] = useState('');
  const { entries, error, running, recallable, classify, run, cancel } = useConsole();
  const { active } = useContexts();
  const { confirm } = useConfirmation();
  const { reportError } = useErrorReporter();

  const execute = useCallback(
    async (entryChannel: ConsoleChannel, command: string) => {
      const typed = command.trim();
      if (typed === '' || running) return;

      let classification;
      try {
        classification = await classify(entryChannel, typed);
      } catch (cause) {
        reportError('The command could not be checked before running', (cause as Error).message);
        return;
      }

      if (classification.destructive) {
        const confirmed = await confirm({
          targetName: typed,
          consequence: `${classification.reason ?? ''} It runs on the daemon of the active context.`.trim(),
          confirmLabel: 'Run',
        });
        // Cancelled: the command is left in the prompt, untouched and not run.
        if (!confirmed) return;
      }

      setValue('');
      await run(entryChannel, typed, { persist: !classification.carriesSecret });
    },
    [classify, confirm, reportError, run, running],
  );

  const handleRerun = useCallback(
    (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      void execute(entry.channel, entry.command);
    },
    [entries, execute],
  );

  const suggestionItems = useCallback(
    (commands: string[]): ChipGroupItem[] =>
      commands.map((command) => ({
        key: command,
        label: command.trim(),
        onSelect: () => setValue(command),
      })),
    [],
  );

  const contextFact = active ? `context ${active.name} (${active.kind})` : 'active Docker context';
  const channelFact = channel === 'cli' ? `local docker process · ${contextFact}` : `direct Engine API call · ${contextFact}`;

  return (
    <Stack gap="var(--space-5)">
      {error ? <ErrorBanner title="Console history" detail={error} /> : null}
      <Card>
        <Stack gap="var(--space-4)">
          <SectionHeader
            title="Raw command & API console"
            description="Escape hatch for any CLI flag or Engine API endpoint not modelled by a dedicated screen."
            trailing={
              <SegmentedControl
                ariaLabel="Console channel"
                options={CHANNEL_OPTIONS}
                selectedIds={[channel]}
                onChange={(ids) => setChannel((ids[0] as ConsoleChannel) ?? 'cli')}
              />
            }
          />
          <StateSummaryBar tone="warning" title={`${CHANNEL_LABELS[channel]} · ${PRIVILEGE_NOTICE}`} facts={[channelFact]} />
          <ConsoleSurface
            entries={entries.map(toSurfaceEntry)}
            value={value}
            onChange={setValue}
            onSubmit={() => void execute(channel, value)}
            onRerun={handleRerun}
            onCancel={cancel}
            busy={running}
            recallable={recallable}
            placeholder={PROMPT_PLACEHOLDER[channel]}
            emptyLabel="Nothing has been run yet — type a command, or pick one of the starting points below."
          />
        </Stack>
      </Card>
      <Card>
        <Stack gap="var(--space-4)">
          <Stack gap="var(--space-3)">
            <SectionHeader title="Long-tail commands reachable here" />
            <ChipGroup items={suggestionItems(channel === 'cli' ? CLI_SUGGESTIONS : API_SUGGESTIONS)} />
          </Stack>
          {channel === 'cli' ? (
            <Stack gap="var(--space-3)">
              <SectionHeader variant="eyebrow" title="Not on their own screens, only here" />
              <ChipGroup items={suggestionItems(WITHDRAWN_SUGGESTIONS)} />
            </Stack>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
