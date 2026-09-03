/**
 * What a screen shows, and what it must no longer show, when a read failed
 * (plan-docker_management_app-inline_error_panels/REQ-1, /REQ-3).
 *
 * The wording is written out here rather than imported from the component: a
 * check that reads the sentence out of the source certifies whatever the source
 * says. This is the sentence the requirement states.
 */
export const FAILED_READ_WORDING = 'This data could not be loaded';

/** The placeholders standing in the place of data a read could not load. */
export function failedReadPlaceholders(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.ui-empty-state')).filter(
    (state) => state.querySelector('.ui-empty-state__title')?.textContent === FAILED_READ_WORDING,
  );
}

/** The failure panels drawn in the page: none, in a screen (…/REQ-1). */
export function errorPanels(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.ui-error-banner'));
}
