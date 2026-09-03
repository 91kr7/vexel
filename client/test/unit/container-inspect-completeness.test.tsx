/**
 * Completeness read off the response itself and never off a written list of key names —
 * `…-inspect_full_payload/REQ-3`, REQ-4, REQ-34. The expected set is walked out of the payload the
 * tab was handed, so a key nobody has seen fails this by absence instead of passing by omission.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerDetailPanel } from '../../src/containers/ContainerDetailPanel';
import type { ContainerInspect, ContainerSummary } from '../../src/data/containers-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ReportingServices } from '../support/reporting-services';

const container: ContainerSummary = {
  id: 'container-1',
  shortId: 'container1',
  name: 'web-nginx',
  image: 'nginx:1.27',
  state: 'running',
  status: 'Up 3 days',
  ports: [],
};

/** A payload of every shape the daemon sends, including a key the application has never heard of. */
const raw = {
  Id: 'a1b2c3d4e5f6a1b2c3d4e5f6',
  Created: '2026-01-01T00:00:00Z',
  Path: 'sleep',
  Args: ['300', '--flag'],
  State: {
    Status: 'exited',
    Running: false,
    ExitCode: 0,
    StartedAt: '2026-01-01T00:00:01Z',
    FinishedAt: '0001-01-01T00:00:00Z',
    Health: { Status: 'unhealthy', FailingStreak: 2, Log: [{ Start: '2026-01-01T00:00:02Z', ExitCode: 1, Output: 'refused' }] },
  },
  Name: '/web-nginx',
  RestartCount: 0,
  Driver: 'overlay2',
  Platform: 'linux',
  GraphDriver: { Data: { MergedDir: '/var/lib/docker/merged' }, Name: 'overlay2' },
  Mounts: [{ Type: 'volume', Name: 'data', Destination: '/data', RW: true }],
  Config: {
    Hostname: 'a1b2c3d4e5f6',
    Env: ['PATH=/usr/bin', 'TOKEN=s3cr3t'],
    Cmd: ['sleep', '300'],
    Entrypoint: null,
    Labels: {},
    ExposedPorts: { '80/tcp': {} },
  },
  HostConfig: {
    Binds: null,
    Memory: 536870912,
    ShmSize: 0,
    Privileged: false,
    Dns: [],
    PortBindings: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] },
    RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
  },
  NetworkSettings: {
    SandboxID: null,
    Ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] },
    Networks: { bridge: { NetworkID: 'net-1', IPAddress: '172.17.0.2', Aliases: null } },
  },
  SomethingNobodyHasSeenYet: { NorThisEither: ['a', 'b'], Depth: { Deeper: { Deepest: 'bottom' } } },
};

function inspectResponse(): ContainerInspect {
  return {
    id: 'container-1',
    name: 'web-nginx',
    image: 'nginx:1.27',
    command: ['sleep'],
    entrypoint: [],
    createdAt: '2026-01-01T00:00:00Z',
    state: { status: 'exited', exitCode: 0 },
    restartPolicy: { name: 'unless-stopped' },
    resourceLimits: {},
    env: [],
    ports: [],
    mounts: [],
    networks: [],
    labels: {},
    raw,
  };
}

class SilentEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener() {}
  close() {}
}

beforeEach(() => {
  vi.stubGlobal('EventSource', SilentEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('/inspect')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(inspectResponse()) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ path: 'in-place', container }) }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Every path the payload holds, walked here rather than read from the module under test. */
function pathsOfPayload(value: unknown, prefix: string[] = []): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => [[...prefix, `[${index}]`].join('.'), ...pathsOfPayload(item, [...prefix, `[${index}]`])]);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
      [...prefix, key].join('.'),
      ...pathsOfPayload(item, [...prefix, key]),
    ]);
  }
  return [];
}

/** Every path the tab has actually drawn, reconstructed from the labels on screen. */
function pathsOnScreen(): string[] {
  const found: string[] = [];

  function walkFields(fields: Element | null | undefined, prefix: string[]): void {
    for (const node of Array.from(fields?.children ?? [])) {
      if (node.classList.contains('ui-payload-band')) {
        found.push([...prefix, node.querySelector('.ui-payload-band__label')?.textContent ?? ''].join('.'));
        continue;
      }
      if (!node.classList.contains('ui-payload-group')) continue;
      const key = node.querySelector('.ui-payload-group__label')?.textContent ?? '';
      found.push([...prefix, key].join('.'));
      walkFields(node.querySelector(':scope > .ui-payload-group__body > .ui-payload-fields'), [...prefix, key]);
    }
  }

  for (const section of Array.from(document.querySelectorAll('.ui-payload-sections > .ui-collapsible-section'))) {
    const title = section.querySelector('.ui-collapsible-section__title')?.textContent ?? '';
    if (title === 'Raw payload') continue;
    const body = section.querySelector(':scope > .ui-collapsible-section__body > .ui-payload-fields');
    if (title === 'Fields') {
      walkFields(body, []);
      continue;
    }
    found.push(title);
    walkFields(body, [title]);
  }
  return found;
}

async function openWholeInspectTab(): Promise<void> {
  const user = userEvent.setup();
  render(
    <ReportingServices>
      <ProgressProvider>
        <ConfirmationProvider>
          <ContainerDetailPanel container={container} onContainerReplaced={vi.fn()} />
        </ConfirmationProvider>
      </ProgressProvider>
    </ReportingServices>,
  );
  await user.click(await screen.findByRole('tab', { name: 'Inspect' }));
  await screen.findByLabelText('Find in payload');

  const closed = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.ui-collapsible-section__header')).filter(
      (header) => header.getAttribute('aria-expanded') === 'false' && header.querySelector('.ui-collapsible-section__title')?.textContent !== 'Raw payload',
    );
  for (let header = closed()[0]; header !== undefined; header = closed()[0]) await user.click(header);
}

describe('Inspect tab completeness, checked against the response (REQ-3, REQ-4, REQ-34)', () => {
  // REQ-3, REQ-34 — every key the response carries is accounted for on screen, walked out of the response itself
  it('accounts for every key of the response the tab was given', async () => {
    await openWholeInspectTab();

    const expected = pathsOfPayload(raw);
    const missing = expected.filter((path) => !pathsOnScreen().includes(path));
    expect(missing, `the tab draws no field for ${missing.length} of the response's ${expected.length} keys: ${missing.join(', ')}`).toEqual([]);
  });

  // REQ-4 — and it draws no field the response does not carry
  it('draws no field the response does not carry', async () => {
    await openWholeInspectTab();

    const expected = new Set(pathsOfPayload(raw));
    const invented = pathsOnScreen().filter((path) => !expected.has(path));
    expect(invented, `the tab draws ${invented.length} fields the response never carried: ${invented.join(', ')}`).toEqual([]);
  });

  // REQ-34 — the two halves together: what is on screen and what the response holds are one set
  it('draws exactly the response, key for key', async () => {
    await openWholeInspectTab();

    expect(new Set(pathsOnScreen())).toEqual(new Set(pathsOfPayload(raw)));
  });
});
