import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useFileUpload } from '../../src/data/use-image-transfer';

// Stands in for the browser's XMLHttpRequest: the hook's only channel for an
// upload (REQ-42, REQ-43), so the tests drive it by emitting the same events
// a real upload would.
class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];
  method?: string;
  url?: string;
  headers: Record<string, string> = {};
  status = 0;
  responseText = '';
  sentBody?: unknown;
  aborted = false;
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  upload = {
    listeners: new Map<string, Array<(event: unknown) => void>>(),
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      const existing = this.upload.listeners.get(type) ?? [];
      existing.push(listener);
      this.upload.listeners.set(type, existing);
    },
    emit: (type: string, event: unknown) => {
      for (const listener of this.upload.listeners.get(type) ?? []) listener(event);
    },
  };

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(body: unknown) {
    this.sentBody = body;
  }

  abort() {
    this.aborted = true;
    this.emit('abort', {});
  }

  emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  /** Simulates the server answering: sets status/responseText and fires 'load'. */
  respond(status: number, responseText: string) {
    this.status = status;
    this.responseText = responseText;
    this.emit('load', {});
  }
}

function latest(): FakeXMLHttpRequest {
  return FakeXMLHttpRequest.instances[FakeXMLHttpRequest.instances.length - 1]!;
}

beforeEach(() => {
  FakeXMLHttpRequest.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeFile(name = 'images.tar', sizeBytes = 1000): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'application/x-tar' });
}

// use-image-transfer-stream.md — useFileUpload: byte progress and a working cancel, until the server reports completion or failure
describe('useFileUpload (plan-docker_management_app/REQ-42, plan-docker_management_app/REQ-43)', () => {
  it('starts idle, then moves to uploading with totalBytes set from the file size and currentBytes at 0', () => {
    const { result } = renderHook(() => useFileUpload<{ references: string[] }>());

    expect(result.current.status).toBe('idle');

    act(() => result.current.start('/api/images/load', makeFile('images.tar', 4096)));

    expect(result.current.status).toBe('uploading');
    expect(result.current.currentBytes).toBe(0);
    expect(result.current.totalBytes).toBe(4096);
  });

  it('sends the raw File as the request body, never reading it into memory itself', () => {
    const file = makeFile();
    const { result } = renderHook(() => useFileUpload());

    act(() => result.current.start('/api/images/load', file));

    expect(latest().method).toBe('POST');
    expect(latest().url).toBe('/api/images/load');
    expect(latest().sentBody).toBe(file);
  });

  it('tracks byte progress from the upload progress event while bytes are still going out', () => {
    const { result } = renderHook(() => useFileUpload());
    act(() => result.current.start('/api/images/load', makeFile('images.tar', 1000)));

    act(() => latest().upload.emit('progress', { lengthComputable: true, loaded: 400, total: 1000 }));

    expect(result.current.currentBytes).toBe(400);
    expect(result.current.totalBytes).toBe(1000);
    expect(result.current.status).toBe('uploading');
  });

  it('moves to processing once every byte has gone out but the server has not answered yet', () => {
    const { result } = renderHook(() => useFileUpload());
    act(() => result.current.start('/api/images/load', makeFile('images.tar', 1000)));

    act(() => latest().upload.emit('progress', { lengthComputable: true, loaded: 1000, total: 1000 }));

    expect(result.current.status).toBe('processing');
  });

  it('reports done with the server\'s JSON response once it answers successfully', () => {
    const { result } = renderHook(() => useFileUpload<{ references: string[] }>());
    act(() => result.current.start('/api/images/load', makeFile()));

    act(() => latest().respond(200, JSON.stringify({ references: ['myrepo/app:1.0'] })));

    expect(result.current.status).toBe('done');
    expect(result.current.result).toEqual({ references: ['myrepo/app:1.0'] });
  });

  it("reports the server's own { error } message once it refuses the upload", async () => {
    const { result } = renderHook(() => useFileUpload());
    act(() => result.current.start('/api/images/load', makeFile()));

    // The error path reads the response body asynchronously (extractErrorMessage).
    await act(async () => latest().respond(400, JSON.stringify({ error: 'invalid tar header' })));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('invalid tar header');
  });

  it('reports an interrupted-transfer error on a network failure', () => {
    const { result } = renderHook(() => useFileUpload());
    act(() => result.current.start('/api/images/load', makeFile()));

    act(() => latest().emit('error', {}));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('cancel() aborts an in-flight upload and returns to idle', () => {
    const { result } = renderHook(() => useFileUpload());
    act(() => result.current.start('/api/images/load', makeFile()));

    act(() => result.current.cancel());

    expect(latest().aborted).toBe(true);
    expect(result.current.status).toBe('idle');
  });

  it('cancel() is a no-op once the upload has already finished', () => {
    const { result } = renderHook(() => useFileUpload<{ references: string[] }>());
    act(() => result.current.start('/api/images/load', makeFile()));
    act(() => latest().respond(200, JSON.stringify({ references: [] })));

    act(() => result.current.cancel());

    expect(result.current.status).toBe('done');
  });

  it('reset() aborts an in-flight upload (if any) and returns to the initial idle state', () => {
    const { result } = renderHook(() => useFileUpload<{ references: string[] }>());
    act(() => result.current.start('/api/images/load', makeFile()));
    act(() => latest().upload.emit('progress', { lengthComputable: true, loaded: 100, total: 1000 }));

    act(() => result.current.reset());

    expect(latest().aborted).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.currentBytes).toBe(0);
  });
});
