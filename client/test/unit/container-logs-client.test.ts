import { describe, expect, it } from 'vitest';
import { containerLogStreamUrl } from '../../src/data/container-logs-client';

describe('containerLogStreamUrl (REQ-30, REQ-31)', () => {
  // container-logs-client.md — the stream URL of a container, with no query when nothing differs from the defaults
  it('builds the bare stream URL when no option is given', () => {
    expect(containerLogStreamUrl('container-1')).toBe('/api/containers/container-1/logs/stream');
  });

  // container-logs-client.md — only the options that differ from the endpoint's defaults are carried
  it('omits every option that matches the endpoint defaults', () => {
    const url = containerLogStreamUrl('container-1', {
      stdout: true,
      stderr: true,
      follow: true,
      timestamps: false,
      tail: 'all',
    });

    expect(url).toBe('/api/containers/container-1/logs/stream');
  });

  // container-logs-client.md — the options that do differ from the defaults are carried as query parameters
  it('carries the options that differ from the defaults', () => {
    const url = containerLogStreamUrl('container-1', {
      stdout: false,
      stderr: true,
      follow: false,
      timestamps: true,
      tail: 100,
      since: '5m',
      until: '2026-08-06T10:00:00Z',
    });

    const params = new URL(url, 'http://localhost').searchParams;
    expect(url.startsWith('/api/containers/container-1/logs/stream?')).toBe(true);
    expect(params.get('stdout')).toBe('false');
    expect(params.get('stderr')).toBe(null);
    expect(params.get('follow')).toBe('false');
    expect(params.get('timestamps')).toBe('true');
    expect(params.get('tail')).toBe('100');
    expect(params.get('since')).toBe('5m');
    expect(params.get('until')).toBe('2026-08-06T10:00:00Z');
  });

  // container-logs-client.md — blank since/until bounds are omitted
  it('omits blank since/until bounds', () => {
    expect(containerLogStreamUrl('container-1', { since: '', until: '   ' })).toBe('/api/containers/container-1/logs/stream');
  });
});
