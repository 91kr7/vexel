import { describe, expect, it } from 'vitest';
import { daemonEventConcerns, type DaemonEvent } from '../../src/data/event-stream';

// The attribution rule of events/specs/event-stream-client.md: whether an event
// is about the object a detail view was opened for
// (plan-docker_management_app-refresh_cache/REQ-7), and what happens when it
// cannot be told (REQ-8).

const FULL_ID = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0';
const OTHER_FULL_ID = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function event(fields: Partial<DaemonEvent> = {}): DaemonEvent {
  return { id: 'e1', timestamp: '2026-08-28T10:00:00.000Z', type: 'container', action: 'start', ...fields };
}

describe('daemonEventConcerns', () => {
  // event-stream-client.md — true when the event's actorId names that object
  it('is true when the identifier is the one the event carries', () => {
    expect(daemonEventConcerns(event({ actorId: FULL_ID, actor: 'database' }), FULL_ID)).toBe(true);
  });

  // event-stream-client.md — false otherwise: the event is about another object (REQ-7)
  it('is false when the event names another object of the same kind', () => {
    expect(daemonEventConcerns(event({ actorId: OTHER_FULL_ID, actor: 'other' }), FULL_ID)).toBe(false);
  });

  // event-stream-client.md — true when the event's actor names the object, the id having not
  it('is true when the name the event carries is the object, even if the identifier is not', () => {
    expect(daemonEventConcerns(event({ type: 'volume', actorId: OTHER_FULL_ID, actor: 'app-data' }), 'app-data')).toBe(true);
  });

  // event-stream-client.md — true when the event carries no actorId: an event that cannot be
  // attributed is treated as one about the shown object (REQ-8)
  it('is true when the event carries no identifier, whatever name it carries', () => {
    expect(daemonEventConcerns(event({ actor: 'someone-else' }), FULL_ID)).toBe(true);
  });

  // event-stream-client.md — true when `identifier` is undefined
  it('is true when no object is named to match against', () => {
    expect(daemonEventConcerns(event({ actorId: FULL_ID }), undefined)).toBe(true);
  });

  // event-stream-client.md — two identifiers name one object ignoring case, a leading sha256:
  // and surrounding blanks
  it.each([
    ['a leading sha256:', `sha256:${FULL_ID}`, FULL_ID],
    ['case', FULL_ID.toUpperCase(), FULL_ID],
    ['surrounding blanks', `  ${FULL_ID}  `, FULL_ID],
  ])('ignores %s when comparing the two identifiers', (_case, actorId, identifier) => {
    expect(daemonEventConcerns(event({ actorId }), identifier)).toBe(true);
  });

  // event-stream-client.md — "or when the shorter is the truncated form of the longer"
  it('reads Docker\'s short form as the same object, whichever side carries it', () => {
    const shortId = FULL_ID.slice(0, 12);
    expect(daemonEventConcerns(event({ actorId: FULL_ID }), shortId)).toBe(true);
    expect(daemonEventConcerns(event({ actorId: shortId }), FULL_ID)).toBe(true);
  });

  // event-stream-client.md — "Truncation is read only into hexadecimal identifiers ... so two names
  // sharing a prefix stay two objects"
  it('keeps two names sharing a prefix as two objects', () => {
    expect(daemonEventConcerns(event({ type: 'volume', actorId: 'project-data-cache' }), 'project-data')).toBe(false);
  });

  // event-stream-client.md — "and only from 12 characters — Docker's short form"
  it('refuses a hexadecimal prefix shorter than Docker\'s short form as evidence of identity', () => {
    expect(daemonEventConcerns(event({ actorId: FULL_ID }), FULL_ID.slice(0, 11))).toBe(false);
  });
});
