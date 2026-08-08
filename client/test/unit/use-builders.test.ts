import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { BuilderSummary } from '../../src/data/builders-client';

// useBuilders reads the builder list and drives create/remove/select-active
// (use-builders.md): the data client is mocked so the hook's own re-read and
// error-propagation decisions are the only things under test.
const fetchBuilders = vi.fn();
const createBuilder = vi.fn();
const removeBuilder = vi.fn();
const activateBuilder = vi.fn();

vi.mock('../../src/data/builders-client', () => ({
  fetchBuilders: () => fetchBuilders(),
  createBuilder: (input: unknown) => createBuilder(input),
  removeBuilder: (name: string) => removeBuilder(name),
  activateBuilder: (name: string) => activateBuilder(name),
}));

const { useBuilders } = await import('../../src/data/use-builders');

function builder(overrides: Partial<BuilderSummary> = {}): BuilderSummary {
  return { name: 'alpha', driver: 'docker-container', endpoint: 'unix:///var/run/docker.sock', platforms: ['linux/amd64'], status: 'running', active: false, ...overrides };
}

beforeEach(() => {
  fetchBuilders.mockReset();
  createBuilder.mockReset();
  removeBuilder.mockReset();
  activateBuilder.mockReset();
});

describe('useBuilders (builders/specs/use-builders.md)', () => {
  // use-builders.md — builders is read on mount; loaded settles to true
  it('reads the builder list on mount and marks itself loaded', async () => {
    fetchBuilders.mockResolvedValue([builder()]);

    const { result } = renderHook(() => useBuilders());

    expect(result.current.builders).toEqual([]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.builders).toHaveLength(1);
    expect(result.current.builders[0]!.name).toBe('alpha');
  });

  // use-builders.md — create re-reads the builder list on success
  it('re-reads the builder list after a successful create', async () => {
    fetchBuilders.mockResolvedValue([]);
    createBuilder.mockResolvedValue(builder({ name: 'fresh' }));
    const { result } = renderHook(() => useBuilders());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchBuilders.mockClear();

    await act(async () => {
      await result.current.create({ name: 'fresh', driver: 'docker-container', platforms: [] });
    });

    await waitFor(() => expect(fetchBuilders).toHaveBeenCalled());
  });

  // use-builders.md — remove re-reads the builder list on success
  it('re-reads the builder list after a successful remove', async () => {
    fetchBuilders.mockResolvedValue([builder()]);
    removeBuilder.mockResolvedValue(undefined);
    const { result } = renderHook(() => useBuilders());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchBuilders.mockClear();

    await act(async () => {
      await result.current.remove('alpha');
    });

    await waitFor(() => expect(fetchBuilders).toHaveBeenCalled());
  });

  // use-builders.md — use re-reads the builder list on success, so the newly active builder shows
  it('re-reads the builder list after a successful select-active', async () => {
    fetchBuilders.mockResolvedValueOnce([builder({ active: false })]);
    activateBuilder.mockResolvedValue(builder({ active: true }));
    const { result } = renderHook(() => useBuilders());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchBuilders.mockResolvedValue([builder({ active: true })]);

    await act(async () => {
      await result.current.use('alpha');
    });

    await waitFor(() => expect(result.current.builders[0]!.active).toBe(true));
  });

  // use-builders.md — "failures propagate to the caller (never swallowed) so the screen can report them"
  it('propagates a create failure to the caller', async () => {
    fetchBuilders.mockResolvedValue([]);
    createBuilder.mockRejectedValue(new Error('existing instance for "dup"'));
    const { result } = renderHook(() => useBuilders());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.create({ name: 'dup', driver: 'docker-container', platforms: [] })).rejects.toThrow('existing instance for "dup"');
  });

  it('propagates a remove failure to the caller', async () => {
    fetchBuilders.mockResolvedValue([builder()]);
    removeBuilder.mockRejectedValue(new Error('no builder "alpha" found'));
    const { result } = renderHook(() => useBuilders());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.remove('alpha')).rejects.toThrow('no builder "alpha" found');
  });

  it('propagates a select-active failure to the caller', async () => {
    fetchBuilders.mockResolvedValue([builder()]);
    activateBuilder.mockRejectedValue(new Error('failed to switch builder'));
    const { result } = renderHook(() => useBuilders());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.use('alpha')).rejects.toThrow('failed to switch builder');
  });

  // use-builders.md — error carries the last read failure; cleared once a later read succeeds
  it('surfaces a read failure and clears it once a subsequent refresh succeeds', async () => {
    fetchBuilders.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useBuilders());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    fetchBuilders.mockResolvedValue([]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });
});
