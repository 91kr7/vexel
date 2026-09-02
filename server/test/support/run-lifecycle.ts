/**
 * The one entry point behind every lifecycle npm script:
 * `tsx test/support/run-lifecycle.ts <step>`.
 *
 * Four scripts used to be four files whose whole body was one call and one log
 * line, which made the number of files a poor guide to how much there was to
 * understand. The steps themselves are in `lifecycle.ts`; this decides which one
 * was asked for and says what it did.
 *
 * The npm scripts keep their own names — `test:images`, `test:registry`,
 * `test:reset-daemon`, `test:sweep` — because those are what `test:api`, the
 * documentation and a developer's fingers already know.
 */
import { BASE_IMAGES } from "./base-images.js";
import { ensureDaemonImages, prepareRunRegistry, resetDaemon, sweepLeftovers } from "./lifecycle.js";

const steps: Record<string, () => Promise<string>> = {
  // The only step allowed to reach Docker Hub, and only for what is genuinely
  // not on the daemon yet.
  images: async () => {
    await ensureDaemonImages();
    return `base images ready: ${BASE_IMAGES.join(", ")}`;
  },
  registry: async () => `test registry ready on ${await prepareRunRegistry()}`,
  reset: async () => {
    await resetDaemon();
    return "daemon reset: nothing running but the run's registry, nothing unused left";
  },
  sweep: async () => {
    await sweepLeftovers();
    return "swept every labelled leftover of a test run";
  },
};

const asked = process.argv[2];
const step = asked === undefined ? undefined : steps[asked];
if (step === undefined) {
  console.error(
    `run-lifecycle: ${asked === undefined ? "no step named" : `unknown step \`${asked}\``}. One of: ${Object.keys(steps).join(", ")}.`,
  );
  process.exit(1);
}

console.log(await step());
