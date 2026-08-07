import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContainer } from '../../src/data/container-create-client';
import type { ContainerCreateSpec } from '../../src/data/container-create-client';

// The creation call reads a newline-delimited JSON stream off the response
// body: the fetch is stubbed with a controllable stream so the client's own
// decisions — incremental progress reporting, terminal event handling and the
// refusal message it rejects with — are what the tests observe.
let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

function streamedResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

function emit(line: unknown): void {
  controller?.enqueue(new TextEncoder().encode(`${JSON.stringify(line)}\n`));
}

function endStream(): void {
  controller?.close();
}

const spec: ContainerCreateSpec = { image: 'nginx:1.27', name: 'web', start: true };

beforeEach(() => {
  controller = undefined;
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(streamedResponse()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createContainer (containers/specs/container-create-client.md)', () => {
  // container-create-client.md — the spec is POSTed to the creation endpoint as JSON
  it('posts the configuration to the creation endpoint', async () => {
    const pending = createContainer(spec);
    emit({ type: 'image-resolved', pulled: false });
    emit({ type: 'created', result: { id: 'container-1', name: 'web', started: true, imagePulled: false, warnings: [] } });
    endStream();
    await pending;

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/containers');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(spec);
  });

  // container-create-client.md — resolves with the created container reported by the terminal `created` event
  it('resolves with the created container', async () => {
    const pending = createContainer(spec);
    emit({ type: 'created', result: { id: 'container-1', name: 'web', started: true, imagePulled: true, warnings: ['a note'] } });
    endStream();

    await expect(pending).resolves.toEqual({ id: 'container-1', name: 'web', started: true, imagePulled: true, warnings: ['a note'] });
  });

  // container-create-client.md — the body is read incrementally: progress is reported while the pull runs, not once it is over
  it('reports pull steps and the image resolution while the stream is still open', async () => {
    const onPullStep = vi.fn();
    const onImageResolved = vi.fn();
    const pending = createContainer(spec, { onPullStep, onImageResolved });

    emit({ type: 'pull-step', step: { id: 'layer-1', status: 'Downloading', currentBytes: 10, totalBytes: 100 } });
    await vi.waitFor(() => expect(onPullStep).toHaveBeenCalledTimes(1));
    expect(onPullStep).toHaveBeenCalledWith({ id: 'layer-1', status: 'Downloading', currentBytes: 10, totalBytes: 100 });
    // Still open: the terminal event has not been sent yet.
    expect(onImageResolved).not.toHaveBeenCalled();

    emit({ type: 'image-resolved', pulled: true });
    await vi.waitFor(() => expect(onImageResolved).toHaveBeenCalledWith(true));

    emit({ type: 'created', result: { id: 'container-1', name: 'web', started: true, imagePulled: true, warnings: [] } });
    endStream();
    await pending;
  });

  // container-create-client.md — a refusal rejects with the daemon's own message, verbatim
  it("rejects with the daemon's own message when the stream carries an error event", async () => {
    const pending = createContainer(spec);
    emit({ type: 'error', message: 'Conflict. The container name "/web" is already in use' });
    endStream();

    await expect(pending).rejects.toThrow('Conflict. The container name "/web" is already in use');
  });

  // container-create-client.md — a stream that ends without a terminal line rejects rather than resolving with nothing
  it('rejects when the stream ends without a terminal event', async () => {
    const pending = createContainer(spec);
    emit({ type: 'image-resolved', pulled: false });
    endStream();

    await expect(pending).rejects.toThrow();
  });

  // container-create-client.md — a failed request rejects with the endpoint's error message
  it("rejects with the endpoint's error message when the request itself fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ error: 'daemon unreachable' }) } as unknown as Response);

    await expect(createContainer(spec)).rejects.toThrow('daemon unreachable');
  });

  // container-create-client.md — without a usable error body, the HTTP status is reported instead
  it('rejects with the HTTP status when the failed request carries no error message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: () => Promise.reject(new Error('no body')) } as unknown as Response);

    await expect(createContainer(spec)).rejects.toThrow('Request failed with HTTP 503');
  });
});
