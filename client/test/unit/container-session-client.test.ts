import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { containerSessionUrl } from '../../src/data/container-session-client';

const originalLocation = window.location;

function stubLocation(protocol: string, host: string) {
  // jsdom's window.location cannot be mutated in place; replace it wholesale for the test.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, protocol, host },
  });
}

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('containerSessionUrl (REQ-34, REQ-35)', () => {
  beforeEach(() => stubLocation('http:', 'localhost:5173'));

  // container-session-client.md — builds a ws:// URL to the attach endpoint, with no launch query
  it('builds the bare attach URL with no query', () => {
    expect(containerSessionUrl('container-1', 'attach')).toBe('ws://localhost:5173/api/containers/container-1/attach');
  });

  // container-session-client.md — builds a ws:// URL to the exec endpoint, encoding cmd (repeated), user and workdir
  it('encodes the launch options as repeated cmd, user and workdir query parameters for exec', () => {
    const url = containerSessionUrl('container-1', 'exec', { cmd: ['/bin/sh', '-c', 'echo hi'], user: 'root', workingDir: '/app' });

    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/containers/container-1/exec');
    expect(parsed.searchParams.getAll('cmd')).toEqual(['/bin/sh', '-c', 'echo hi']);
    expect(parsed.searchParams.get('user')).toBe('root');
    expect(parsed.searchParams.get('workdir')).toBe('/app');
  });

  // container-session-client.md — user and workingDir are omitted from the query when not given
  it('omits user and workdir from the query when they are not given', () => {
    const url = containerSessionUrl('container-1', 'exec', { cmd: ['/bin/sh'] });

    const parsed = new URL(url);
    expect(parsed.searchParams.getAll('cmd')).toEqual(['/bin/sh']);
    expect(parsed.searchParams.has('user')).toBe(false);
    expect(parsed.searchParams.has('workdir')).toBe(false);
  });

  // container-session-client.md — the container id is URL-encoded
  it('encodes the container id', () => {
    const url = containerSessionUrl('a/b', 'attach');
    expect(url).toBe('ws://localhost:5173/api/containers/a%2Fb/attach');
  });

  // container-session-client.md — the URL protocol matches the page's protocol (wss over https)
  it('builds a wss:// URL when the page is served over https', () => {
    stubLocation('https:', 'vessel.example.com');
    expect(containerSessionUrl('container-1', 'attach')).toBe('wss://vessel.example.com/api/containers/container-1/attach');
  });
});
