/**
 * The shared progress dialog's ending, observed as a **sequence over time**.
 *
 * Both halves are the point. "The dialog is gone" is true of a dialog that never
 * said it had finished, and "the dialog is present and has text" is true of one
 * that has been showing `Starting…` under a full bar for as long as it has been
 * open — both were true before this fix, after it, and with the defect active
 * (plan-docker_management_app-progress_completion_autoclose/REQ-18). What
 * distinguishes them is the order: the caption stating the completion **while
 * the dialog is still on screen**, and only then the dialog leaving — or, for
 * the two dialogs that carry their operation's only result, deliberately not
 * leaving.
 *
 * Written once and shared by the specs of all six surfaces, because the
 * behaviour belongs to the one library component they all show
 * (`ui-library/specs/transfer-progress-dialog.md`), not to any screen.
 */
import { expect, type Locator } from '@playwright/test';

/** The fixed second the surface waits before dismissing itself, named once. */
export const AUTO_CLOSE_MS = 1_000;

/**
 * Comfortably longer than the auto-close window: what a dialog excluded from the
 * self-dismissal must survive, and long enough that a wrongly armed close would
 * have fired several times over.
 */
const WELL_PAST_AUTO_CLOSE_MS = 3 * AUTO_CLOSE_MS;

/** How long a self-dismissal is given, once completion has been seen: the second, with room around it. */
const DISMISSAL_TIMEOUT_MS = 10_000;

/**
 * The dialog's visible caption. Located by its own class rather than by its
 * words: the completion is *also* exposed as a status message for assistive
 * technology, so `Completed` is deliberately in the dialog twice and a text
 * locator would match both.
 */
export function progressCaption(progressDialog: Locator): Locator {
  return progressDialog.locator('.ui-transfer-progress-dialog__caption');
}

/**
 * Asserts the completion is stated while the dialog is still on screen. Returned
 * as its own step so a caller can assert more about the dialog at that moment —
 * the references it carries, for instance — before it goes.
 */
export async function expectCompletionStated(progressDialog: Locator, completionTimeout: number): Promise<void> {
  await expect(
    progressCaption(progressDialog),
    'the progress dialog never stated its completion: its caption kept naming a phase, or the "no phase yet" wording of a cached run, under a full bar',
  ).toHaveText('Completed', { timeout: completionTimeout });

  // The other half of the same moment: the completion is also perceivable without sight, exposed as
  // a status message — and *only* as one, occupying no visible space, so what a sighted operator
  // reads is the caption alone and not the word twice
  // (progress_completion_autoclose/REQ-14, REQ-16). Checked here rather than in the component tests
  // because it is a question about layout, which the jsdom checks cannot answer: they load no
  // stylesheet.
  const announcement = progressDialog.getByRole('status');
  await expect(
    announcement,
    'the completion was not announced: the dialog carries no status message stating it',
  ).toContainText('Completed');
  const box = await announcement.boundingBox();
  expect(box, 'the completion status message is not rendered at all, so nothing is announced').not.toBeNull();
  expect(
    Math.max(box!.width, box!.height),
    'the completion status message is drawn: the operator sees the completion wording twice over',
  ).toBeLessThanOrEqual(1);
}

/**
 * The four analyses: the completion is stated, and then the dialog leaves **on
 * its own**, with nothing pressed and nothing else touched.
 */
export async function expectCompletedThenSelfDismissed(progressDialog: Locator, completionTimeout: number): Promise<void> {
  await expectCompletionStated(progressDialog, completionTimeout);
  await expect(
    progressDialog,
    'the progress dialog stated its completion but was still on screen: it has to leave on its own, with nothing pressed',
  ).toHaveCount(0, { timeout: DISMISSAL_TIMEOUT_MS });
}

/**
 * The two tarball transfers: the completion is stated and the dialog **stays**,
 * because it is the only place the references of the images just created are
 * shown. Their `Close` press is the correct behaviour, not a race, and the
 * caller keeps it.
 */
export async function expectCompletedAndStillWaiting(progressDialog: Locator, completionTimeout: number): Promise<void> {
  await expectCompletionStated(progressDialog, completionTimeout);
  // A real wait, deliberately: what is being contracted is that nothing happens
  // for longer than the window in which something would have.
  await progressDialog.page().waitForTimeout(WELL_PAST_AUTO_CLOSE_MS);
  await expect(
    progressDialog,
    'the progress dialog of a tarball transfer dismissed itself, carrying away the only place the created image references are shown',
  ).toBeVisible();
}
