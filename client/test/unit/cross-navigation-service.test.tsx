import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { CrossNavigationProvider, useCrossNavigation } from '../../src/shell/services/CrossNavigationService';

afterEach(cleanup);

function renderService() {
  return renderHook(() => useCrossNavigation(), { wrapper: CrossNavigationProvider });
}

describe('CrossNavigationProvider / useCrossNavigation (app-shell/specs/cross-navigation-service.md)', () => {
  // cross-navigation-service.md — no request is pending until one is posted
  it('starts with no pending request', () => {
    const { result } = renderService();

    expect(result.current.request).toBeUndefined();
  });

  // cross-navigation-service.md — "navigateTo({ screenId, objectId?, position? }) posts a request
  // for that screen"
  it('records the destination screen, the object and the position asked for', () => {
    const { result } = renderService();

    act(() => result.current.navigateTo({ screenId: 'images-layers', objectId: 'sha256:abc', position: 3 }));

    expect(result.current.request?.screenId).toBe('images-layers');
    expect(result.current.request?.objectId).toBe('sha256:abc');
    expect(result.current.request?.position).toBe(3);
  });

  // cross-navigation-service.md — "a requestId that differs between two consecutive requests, so
  // asking twice for the same target is honored twice"
  it('gives two consecutive requests for the same target different request ids', () => {
    const { result } = renderService();

    act(() => result.current.navigateTo({ screenId: 'builders-cache', objectId: 'rec-1' }));
    const first = result.current.request!.requestId;
    act(() => result.current.consumeRequest());
    act(() => result.current.navigateTo({ screenId: 'builders-cache', objectId: 'rec-1' }));

    expect(result.current.request!.requestId).not.toBe(first);
  });

  // cross-navigation-service.md — "consumeRequest() clears the pending request"
  it('clears the pending request once it is consumed', () => {
    const { result } = renderService();

    act(() => result.current.navigateTo({ screenId: 'builders-cache', objectId: 'rec-1' }));
    act(() => result.current.consumeRequest());

    expect(result.current.request).toBeUndefined();
  });

  // cross-navigation-service.md — "Only one request is pending at a time: a new one replaces an
  // unconsumed one."
  it('replaces an unconsumed request with the newer one', () => {
    const { result } = renderService();

    act(() => result.current.navigateTo({ screenId: 'builders-cache', objectId: 'rec-1' }));
    act(() => result.current.navigateTo({ screenId: 'images-layers', objectId: 'sha256:abc', position: 2 }));

    expect(result.current.request?.screenId).toBe('images-layers');
    expect(result.current.request?.objectId).toBe('sha256:abc');
  });

  // cross-navigation-service.md — "Used outside a provider -> throws."
  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useCrossNavigation())).toThrow();
  });
});
