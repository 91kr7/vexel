import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

/**
 * compose/specs/use-compose-file.md — the project's file(s), the unsaved edits kept per path, and
 * the re-read the reload signal raises: the header's manual refresh and a connection that comes
 * back (plan-docker_management_app-inline_error_panels/REQ-12).
 *
 * The rule this file exists for: **an unsaved edit is never overwritten, and never silently
 * replaced** (REQ-77). The data client is mocked — what is under test is what the hook keeps when
 * the disk answers again.
 */
const client = {
  fetchComposeFiles: vi.fn(),
  writeComposeFile: vi.fn(),
  validateComposeFile: vi.fn(),
};

vi.mock('../../src/data/compose-client', () => client);

const { useComposeFile } = await import('../../src/data/use-compose-file');
const { requestReload } = await import('../../src/data/reload-signal');

const PROJECT = 'shop';
const PATH = '/srv/shop/docker-compose.yml';
const OTHER_PATH = '/srv/shop/docker-compose.override.yml';

const ON_DISK = 'services:\n  web:\n    image: alpine:3.20\n';
const CHANGED_ON_DISK = 'services:\n  web:\n    image: alpine:3.21\n';
const TYPED = 'services:\n  web:\n    image: alpine:3.20\n    command: sleep 300\n';

function filesOnDisk(...files: { path: string; content: string }[]) {
  return { ok: true as const, files };
}

/** Renders the hook on a project and waits for the first read to settle. */
async function renderComposeFile(projectName = PROJECT) {
  const view = renderHook(({ project }: { project: string | undefined }) => useComposeFile(project), {
    initialProps: { project: projectName as string | undefined },
  });
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

/** The content the hook currently shows for a path. */
function shown(view: Awaited<ReturnType<typeof renderComposeFile>>, path: string): string | undefined {
  return view.result.current.files.find((file) => file.path === path)?.content;
}

beforeEach(() => {
  for (const spy of Object.values(client)) spy.mockReset();
  client.fetchComposeFiles.mockResolvedValue(filesOnDisk({ path: PATH, content: ON_DISK }));
  client.writeComposeFile.mockResolvedValue({ ok: true });
});

afterEach(cleanup);

describe('useComposeFile — the files it shows', () => {
  // use-compose-file.md — "files: { path, content }[] — one entry per discovered file"
  it('shows the file the project was read with', async () => {
    const view = await renderComposeFile();

    expect(shown(view, PATH)).toBe(ON_DISK);
    expect(view.result.current.dirtyPaths).toEqual([]);
  });

  // "edit(path, content) — records an in-memory edit for path; does not write to disk"
  it('shows the operator their own buffer, without writing it', async () => {
    const view = await renderComposeFile();

    act(() => view.result.current.edit(PATH, TYPED));

    expect(shown(view, PATH)).toBe(TYPED);
    expect(view.result.current.dirtyPaths).toEqual([PATH]);
    expect(client.writeComposeFile, 'the edit reached the disk on its own').not.toHaveBeenCalled();
  });
});

describe('useComposeFile — re-read on the reload signal (…-inline_error_panels/REQ-12)', () => {
  it('reads the project files again when the signal is raised', async () => {
    await renderComposeFile();
    expect(client.fetchComposeFiles).toHaveBeenCalledTimes(1);

    await act(async () => {
      await requestReload();
    });

    expect(client.fetchComposeFiles).toHaveBeenCalledTimes(2);
    expect(client.fetchComposeFiles).toHaveBeenLastCalledWith(PROJECT);
  });

  // "A path with no unsaved edit does show the file as it now is on disk: that is what re-reading
  // is for."
  it('shows the new content of a path the operator has not edited', async () => {
    const view = await renderComposeFile();

    client.fetchComposeFiles.mockResolvedValue(filesOnDisk({ path: PATH, content: CHANGED_ON_DISK }));
    await act(async () => {
      await requestReload();
    });

    expect(shown(view, PATH)).toBe(CHANGED_ON_DISK);
    expect(view.result.current.dirtyPaths).toEqual([]);
  });

  // The rule the batch turns on: "An unsaved edit is never overwritten, and never silently
  // replaced ... Losing an edit to a reconnection is not an acceptable outcome" (REQ-77).
  it('keeps the unsaved edit when the file changed on disk under it', async () => {
    const view = await renderComposeFile();
    act(() => view.result.current.edit(PATH, TYPED));

    client.fetchComposeFiles.mockResolvedValue(filesOnDisk({ path: PATH, content: CHANGED_ON_DISK }));
    await act(async () => {
      await requestReload();
    });

    expect(shown(view, PATH), 'the re-read overwrote what the operator had typed').toBe(TYPED);
    expect(view.result.current.dirtyPaths, 'the edit stopped being named as unsaved').toEqual([PATH]);
  });

  // "save still writes what they typed": the buffer survives the re-read all the way to the disk.
  it('saves what the operator typed, not what the re-read brought back', async () => {
    const view = await renderComposeFile();
    act(() => view.result.current.edit(PATH, TYPED));
    client.fetchComposeFiles.mockResolvedValue(filesOnDisk({ path: PATH, content: CHANGED_ON_DISK }));
    await act(async () => {
      await requestReload();
    });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await view.result.current.save(PATH);
    });

    expect(saved).toBe(true);
    expect(client.writeComposeFile).toHaveBeenCalledWith(PROJECT, PATH, TYPED);
    expect(view.result.current.dirtyPaths, 'the saved path is still named as unsaved').toEqual([]);
    expect(shown(view, PATH)).toBe(TYPED);
  });

  // One edited path must not freeze the others: only the dirty one keeps the operator's buffer.
  it('re-reads the other files while one path is edited', async () => {
    client.fetchComposeFiles.mockResolvedValue(
      filesOnDisk({ path: PATH, content: ON_DISK }, { path: OTHER_PATH, content: ON_DISK }),
    );
    const view = await renderComposeFile();
    act(() => view.result.current.edit(PATH, TYPED));

    client.fetchComposeFiles.mockResolvedValue(
      filesOnDisk({ path: PATH, content: CHANGED_ON_DISK }, { path: OTHER_PATH, content: CHANGED_ON_DISK }),
    );
    await act(async () => {
      await requestReload();
    });

    expect(shown(view, PATH)).toBe(TYPED);
    expect(shown(view, OTHER_PATH)).toBe(CHANGED_ON_DISK);
  });

  // The subscription belongs to the mounted screen.
  it('reads nothing once the screen is gone', async () => {
    const view = await renderComposeFile();
    view.unmount();

    await act(async () => {
      await requestReload();
    });

    expect(client.fetchComposeFiles).toHaveBeenCalledTimes(1);
  });
});

describe('useComposeFile — leaving the project', () => {
  // "A change of projectName discards every unsaved edit and re-reads that project's files", and
  // "The only thing that discards an edit is the operator's own step".
  it('discards the unsaved edits and re-reads when the project changes', async () => {
    const view = await renderComposeFile();
    act(() => view.result.current.edit(PATH, TYPED));

    client.fetchComposeFiles.mockResolvedValue(filesOnDisk({ path: OTHER_PATH, content: ON_DISK }));
    view.rerender({ project: 'billing' });
    await waitFor(() => expect(shown(view, OTHER_PATH)).toBe(ON_DISK));

    expect(client.fetchComposeFiles).toHaveBeenLastCalledWith('billing');
    expect(view.result.current.loaded).toBe(true);
    expect(view.result.current.dirtyPaths).toEqual([]);
    expect(shown(view, OTHER_PATH)).toBe(ON_DISK);
  });
});
