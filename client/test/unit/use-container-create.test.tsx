import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { ContainerCreateHandlers, ContainerCreateSpec } from '../../src/data/container-create-client';

// The hook drives one creation on top of the create client: the client is
// mocked so the hook's own decisions — phases, step accumulation, refusal as
// state rather than as a thrown error — are the only things under test.
const createContainer = vi.fn();

vi.mock('../../src/data/container-create-client', () => ({
  createContainer: (spec: ContainerCreateSpec, handlers?: ContainerCreateHandlers) => createContainer(spec, handlers),
}));

const { useContainerCreate } = await import('../../src/data/use-container-create');

const spec: ContainerCreateSpec = { image: 'nginx:1.27', start: true };
const result = { id: 'container-1', name: 'web', started: true, imagePulled: false, warnings: [] };

beforeEach(() => {
  createContainer.mockReset();
});

describe('useContainerCreate (containers/specs/use-container-create.md)', () => {
  // use-container-create.md — phase starts idle, with no steps and no rejection
  it('starts idle with no pull step and no rejection', () => {
    const { result: hook } = renderHook(() => useContainerCreate());

    expect(hook.current.phase).toBe('idle');
    expect(hook.current.pullSteps).toEqual([]);
    expect(hook.current.rejection).toBeUndefined();
  });

  // use-container-create.md — submit resolves with the created container and ends in the created phase
  it('resolves with the created container and settles in the created phase', async () => {
    createContainer.mockResolvedValue(result);
    const { result: hook } = renderHook(() => useContainerCreate());

    let resolved: unknown;
    await act(async () => {
      resolved = await hook.current.submit(spec);
    });

    expect(resolved).toEqual(result);
    expect(hook.current.phase).toBe('created');
    expect(createContainer).toHaveBeenCalledWith(spec, expect.anything());
  });

  // use-container-create.md — onCreated is called once after a successful creation (e.g. to re-read the list)
  it('calls onCreated once after a successful creation', async () => {
    createContainer.mockResolvedValue(result);
    const onCreated = vi.fn();
    const { result: hook } = renderHook(() => useContainerCreate(onCreated));

    await act(async () => {
      await hook.current.submit(spec);
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  // use-container-create.md — a refusal never rejects: it becomes `rejection` plus the rejected phase, and submit resolves undefined
  it('exposes a refusal as state instead of throwing, resolving with undefined', async () => {
    createContainer.mockRejectedValue(new Error('Conflict. The container name "/web" is already in use'));
    const onCreated = vi.fn();
    const { result: hook } = renderHook(() => useContainerCreate(onCreated));

    let resolved: unknown = 'unset';
    await act(async () => {
      resolved = await hook.current.submit(spec);
    });

    expect(resolved).toBeUndefined();
    expect(hook.current.phase).toBe('rejected');
    expect(hook.current.rejection).toBe('Conflict. The container name "/web" is already in use');
    expect(onCreated).not.toHaveBeenCalled();
  });

  // use-container-create.md — pull progress moves the hook into the pulling phase, one entry per step id holding its latest state
  it('keeps one entry per pull step id, holding that id\'s most recent state', async () => {
    let handlers: ContainerCreateHandlers | undefined;
    createContainer.mockImplementation((_spec: ContainerCreateSpec, given: ContainerCreateHandlers) => {
      handlers = given;
      return new Promise(() => undefined); // never settles: the pull is still running
    });
    const { result: hook } = renderHook(() => useContainerCreate());

    act(() => {
      void hook.current.submit(spec);
    });
    act(() => handlers?.onPullStep?.({ id: 'layer-1', status: 'Downloading', currentBytes: 10, totalBytes: 100 }));
    act(() => handlers?.onPullStep?.({ id: 'layer-2', status: 'Downloading' }));
    act(() => handlers?.onPullStep?.({ id: 'layer-1', status: 'Download complete' }));

    await waitFor(() => expect(hook.current.pullSteps).toHaveLength(2));
    expect(hook.current.phase).toBe('pulling');
    expect(hook.current.pullSteps[0]).toEqual({ id: 'layer-1', status: 'Download complete' });
    expect(hook.current.pullSteps[1]).toEqual({ id: 'layer-2', status: 'Downloading' });
  });

  // use-container-create.md — each submit clears the previous run's steps and rejection before starting
  it('clears the previous run\'s steps and rejection when a new submission starts', async () => {
    createContainer.mockRejectedValueOnce(new Error('no such image'));
    const { result: hook } = renderHook(() => useContainerCreate());
    await act(async () => {
      await hook.current.submit(spec);
    });
    expect(hook.current.rejection).toBe('no such image');

    createContainer.mockResolvedValueOnce(result);
    await act(async () => {
      await hook.current.submit(spec);
    });

    expect(hook.current.rejection).toBeUndefined();
    expect(hook.current.pullSteps).toEqual([]);
  });

  // use-container-create.md — reset goes back to idle, with no steps and no rejection
  it('resets back to idle with no steps and no rejection', async () => {
    createContainer.mockRejectedValue(new Error('no such image'));
    const { result: hook } = renderHook(() => useContainerCreate());
    await act(async () => {
      await hook.current.submit(spec);
    });

    act(() => hook.current.reset());

    expect(hook.current.phase).toBe('idle');
    expect(hook.current.rejection).toBeUndefined();
    expect(hook.current.pullSteps).toEqual([]);
  });
});
