/**
 * `ui-library/specs/modal.md` — the dialog's `title` accepts composed content as well as a string
 * (`plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-6`,
 * `REQ-10`).
 *
 * The half this file guards hardest is the one nobody asked to change: **a caller passing a string
 * renders exactly what it rendered before composed titles existed** — the same heading element, in
 * the same slot, with the same close control beside it. So the composed path is checked against the
 * string path rather than on its own, and the product's other dialogs are checked to be still
 * passing a string at all.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge, Modal, Row } from '../../src/ui';

afterEach(cleanup);

function dialog(): HTMLElement {
  return document.querySelector<HTMLElement>('.ui-modal') as HTMLElement;
}

function titleSlot(): HTMLElement {
  return dialog().querySelector<HTMLElement>('.ui-modal__title') as HTMLElement;
}

/** Where the title sits on the dialog, and what stands beside it — the "same place" of the contract. */
function titlePlacement(): { tag: string; parent: string; indexInParent: number; nextSibling: string | null } {
  const slot = titleSlot();
  const parent = slot.parentElement as HTMLElement;
  return {
    tag: slot.tagName,
    parent: parent.className,
    indexInParent: Array.from(parent.children).indexOf(slot),
    nextSibling: slot.nextElementSibling?.tagName ?? null,
  };
}

// modal.md — "a caller passing a string renders exactly what it rendered before composed titles
// existed: the same heading element, the same place, the same close control beside it".
describe('Modal — a string title is the heading it has always been (REQ-10)', () => {
  it('draws a string title as the dialog’s own heading, alone on the chrome where no close control was asked for', () => {
    render(
      <Modal open title="Compare filesystems" onClose={() => {}}>
        the dialog body
      </Modal>,
    );

    const slot = titleSlot();
    expect(slot.tagName).toBe('H2');
    expect(slot.className).toBe('ui-modal__title');
    expect(slot.textContent).toBe('Compare filesystems');
    expect(screen.getByRole('heading', { name: 'Compare filesystems' })).toBe(slot);
    expect(titlePlacement()).toEqual({ tag: 'H2', parent: 'ui-modal', indexInParent: 0, nextSibling: 'DIV' });
  });

  it('draws a string title beside the close control on the chrome band where one was asked for', () => {
    render(
      <Modal open title="Layer stack — registry:2" onClose={() => {}} closeControl size="large">
        the dialog body
      </Modal>,
    );

    const slot = titleSlot();
    const header = slot.parentElement as HTMLElement;
    expect(slot.tagName).toBe('H2');
    expect(header.className).toBe('ui-modal__header');
    expect(Array.from(header.children).indexOf(slot)).toBe(0);
    expect(slot.nextElementSibling).toBe(screen.getByRole('button', { name: 'Close dialog' }));
  });
});

// modal.md — composed content "is drawn in that same place — on the chrome band, beside the close
// control where one was asked for, above the body where none was — and the caller owns what it
// holds".
describe('Modal — composed title content (REQ-6)', () => {
  const composed = (
    <Row align="center" gap="var(--space-3)">
      <Badge tone="success">RUNNING</Badge>
    </Row>
  );

  it('draws composed content in the same slot a string occupies, beside the close control', () => {
    render(
      <Modal open title={composed} onClose={() => {}} closeControl size="large">
        the dialog body
      </Modal>,
    );
    const composedPlacement = titlePlacement();
    cleanup();

    render(
      <Modal open title="a string title" onClose={() => {}} closeControl size="large">
        the dialog body
      </Modal>,
    );

    expect({ ...composedPlacement, tag: 'H2' }, 'composed content is not drawn where a string is').toEqual(titlePlacement());
  });

  it('carries the composed content itself, adding no prefix, separator or heading of its own', () => {
    render(
      <Modal open title={composed} onClose={() => {}} closeControl size="large">
        the dialog body
      </Modal>,
    );

    const slot = titleSlot();
    expect(slot.textContent).toBe('RUNNING');
    expect(slot.querySelector('.ui-badge')).not.toBeNull();
    // "A composed title carries no heading of the component's own": the caller composing one owns
    // the heading inside it, so the dialog is not given two.
    expect(slot.tagName).not.toBe('H2');
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
  });

  it('leaves the close control on the band, still one and still labelled', () => {
    render(
      <Modal open title={composed} onClose={() => {}} closeControl size="large">
        the dialog body
      </Modal>,
    );

    expect(screen.getAllByRole('button', { name: 'Close dialog' })).toHaveLength(1);
  });
});

// REQ-10 — "no other dialog's header changes": the composed path is asked for by one caller, and
// every other dialog in the product goes on handing the component a string.
describe('Modal — every other dialog still hands it a string (REQ-10)', () => {
  const composedTitleCallers = ['ContainersScreen.tsx'];

  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && /\.tsx$/.test(entry.name) ? [path] : [];
    });
  }

  /** The `<Modal …>` opening tags of one source, braces matched so a prop holding JSX is one tag. */
  function modalTags(source: string): string[] {
    const tags: string[] = [];
    for (const match of source.matchAll(/<Modal\b/g)) {
      const start = match.index ?? 0;
      let depth = 0;
      for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (character === '{') depth += 1;
        else if (character === '}') depth -= 1;
        else if (character === '>' && depth === 0) {
          tags.push(source.slice(start, index + 1));
          break;
        }
      }
    }
    return tags;
  }

  /** The `title` prop's expression, or `null` where the title is written as a plain string. */
  function titleExpression(tag: string): string | null {
    const opening = tag.indexOf('title={');
    if (opening < 0) return null;
    let depth = 0;
    for (let index = opening + 'title='.length; index < tag.length; index += 1) {
      if (tag[index] === '{') depth += 1;
      else if (tag[index] === '}') {
        depth -= 1;
        if (depth === 0) return tag.slice(opening + 'title='.length, index + 1);
      }
    }
    return null;
  }

  it('finds a composed title only where this change put one', () => {
    const withComposedTitle = sourceFiles(join(process.cwd(), 'src')).filter((path) => {
      const tags = modalTags(readFileSync(path, 'utf8'));
      // A string or a template literal built from one holds no element; composed content does.
      return tags.some((tag) => /<[A-Z]/.test(titleExpression(tag) ?? ''));
    });

    expect(withComposedTitle.map((path) => path.split('/').pop())).toEqual(composedTitleCallers);
  });
});
