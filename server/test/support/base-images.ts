/**
 * The images the daemon-facing fixtures are built on, and the one guarantee the
 * suite needs about them: that they are on the daemon when a test needs them.
 *
 * A suite that only passes on a warm daemon passes by accident. After a
 * `docker system prune -af` the daemon holds nothing, and a fixture that assumes
 * a base image is local fails for a reason that says nothing about the product
 * — a compose file with `pull_policy: never` cannot find its image, a test that
 * contracts "no pull happens for a local image" watches one happen, and every
 * file pulling at once turns a registry hiccup into a failed assertion.
 *
 * Base images are shared infrastructure, not fixtures: no test removes them,
 * they carry no ownership label, and the sweep therefore never sees them.
 *
 * This is the server-side counterpart of `client/e2e/support/global-setup.ts`,
 * which does the same job once per Playwright run. Two entry points use it: the
 * `test:images` npm script, which pre-pulls before a whole pass so a single
 * process does the network work, and the test files themselves, which ensure
 * what they need before their first test — that is what keeps
 * `node --test test/api/<one-file>.test.ts` working on a pruned daemon.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The image a fixture uses whenever it only needs a container that starts
 * instantly. It declares no `VOLUME`, so it can never orphan an anonymous one.
 */
export const ALPINE_IMAGE = "alpine:3.20";
/** The multi-layer, registry-pulled image the layer and diff analyses need. */
export const REGISTRY_IMAGE = "registry:2";
/** The single-layer image, small enough to be pulled inside a test. */
export const HELLO_WORLD_IMAGE = "hello-world:latest";

/** Every base image the suite is allowed to build a fixture on. Kept small on purpose: roughly 50 MB in total. */
export const BASE_IMAGES = [ALPINE_IMAGE, REGISTRY_IMAGE, HELLO_WORLD_IMAGE];

/**
 * Pulls in flight in this process, so two fixtures asking for the same image at
 * the same moment wait on one pull instead of racing two. Deliberately not a
 * cache of past results: another process in the same run may remove an image
 * (`hello-world` is removed on purpose by the tests that contract pulling), so
 * presence has to be re-checked every time rather than remembered.
 */
const inFlight = new Map<string, Promise<void>>();

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function isPresent(reference: string): Promise<boolean> {
  return await execFileAsync("docker", ["image", "inspect", reference]).then(
    () => true,
    () => false,
  );
}

async function pullOnce(reference: string): Promise<void> {
  await execFileAsync("docker", ["pull", "-q", reference]);
}

async function ensureOnce(reference: string): Promise<void> {
  if (await isPresent(reference)) return;
  try {
    await pullOnce(reference);
  } catch (firstFailure) {
    // A registry hiccup is worth one retry: the alternative is every test that
    // needs the image failing for a reason that has nothing to do with the code.
    await delay(1_000);
    await pullOnce(reference).catch(async (secondFailure: unknown) => {
      // A concurrent process may have pulled it meanwhile, which is a success
      // for the caller even though this pull failed.
      if (await isPresent(reference)) return;
      throw new Error(
        `base image ${reference} is missing and could not be pulled (${String(firstFailure)} / ${String(secondFailure)})`,
      );
    });
  }
}

/** Makes sure the image is on the daemon, pulling it — once, retried once — only if it is not. */
export function ensureImage(reference: string): Promise<void> {
  const pending = inFlight.get(reference);
  if (pending) return pending;
  const attempt = ensureOnce(reference).finally(() => inFlight.delete(reference));
  inFlight.set(reference, attempt);
  return attempt;
}

/** Same, for the images one test file declares it builds its fixtures on. One at a time: a cold daemon has no reason to fetch three at once. */
export async function ensureImages(references: readonly string[]): Promise<void> {
  for (const reference of references) {
    await ensureImage(reference);
  }
}

/** Makes sure every base image is on the daemon. Used by the `test:images` script, before a whole pass. */
export function ensureBaseImages(): Promise<void> {
  return ensureImages(BASE_IMAGES);
}

/**
 * Whether a failure message describes the network between here and the registry
 * giving way, rather than the daemon or the application refusing something.
 *
 * Only tests that deliberately make the product pull — the ones contracting
 * "an image missing locally is pulled first" — are exposed to this, and for them
 * pre-pulling the image is not an option: it would delete the very condition
 * under test. Retrying the request once tells the two apart, since a product
 * defect fails again and a hiccup does not.
 */
export function isRegistryHiccup(message: string): boolean {
  return /EOF|i\/o timeout|timeout exceeded|TLS handshake|connection reset|connection refused|temporary failure|failed to do request|unexpected status: 5\d\d|toomanyrequests|no such host/i.test(
    message,
  );
}
