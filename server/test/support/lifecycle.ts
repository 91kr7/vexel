/**
 * Everything that runs *around* a test, in one place.
 *
 * The distinction this file exists to draw: `base-images.ts` is what a test
 * **asks for** — an image, a mirrored reference, the run's registry — and is
 * imported by four dozen test files for exactly that. This is what **runs**,
 * on its own, at the four moments a pass has:
 *
 * | when | what | who calls it |
 * |------|------|--------------|
 * | on demand, by hand | {@link ensureDaemonImages} then {@link prepareRunRegistry} | `test:images`, `test:registry` |
 * | before every test **file** | {@link resetDaemon} | `client/e2e/support/lifecycle.ts`, `api-lifecycle.ts` |
 * | after a whole pass | {@link stopSharedRegistry} | Playwright's `globalTeardown`, and the closing `test:sweep` |
 * | after a killed run | {@link sweepLeftovers} | `test:sweep` |
 *
 * The first and the third are defined in `base-images.ts`, where the registry
 * and the images they act on are; they are re-exported here so that this table
 * is the whole list and nobody has to know which file to read first. One entry
 * point stands behind all four npm scripts: `run-lifecycle.ts`.
 *
 * The application's own state is a different axis and is wired separately:
 * `run-data-dir.ts` clears it before **every test**, not around a file or a
 * pass, and nothing on that path may import the application at module scope.
 */
import {
  BASE_IMAGES,
  REGISTRY_CONTAINER,
  ensureDaemonImages,
  ensureImages,
  ensureRunRegistrySeeded,
  prepareRunRegistry,
  stopSharedRegistry,
} from "./base-images.js";
import { execFileAsync } from "./docker-cli.js";
import { OWNER_LABEL } from "./ownership.js";

export { ensureDaemonImages, prepareRunRegistry, stopSharedRegistry };

/**
 * The deadline the removal steps get, against the 30s a question to the daemon
 * gets by default: a first reset on a machine with months of images on it is
 * honest work, and every reset after it is on an almost-empty daemon.
 */
const RESET_TIMEOUT_MS = 180_000;

/**
 * Past this, the reset says how long it took. A file whose own `beforeAll` then
 * dies on its thirty seconds deserves to find the reason in the log rather than
 * a hook timeout that names nothing.
 */
const SLOW_RESET_MS = 20_000;

/** The full id of the container the reset spares, or an empty string when no registry of ours is up. */
async function sparedContainerId(): Promise<string> {
  const { stdout } = await execFileAsync("docker", [
    "container",
    "inspect",
    REGISTRY_CONTAINER,
    "--format",
    "{{.Id}}",
  ]).catch(() => ({ stdout: "" }));
  return stdout.trim();
}

/** Answers the lines of a listing, trimmed and without the empty one a trailing newline leaves. */
function lines(stdout: string): string[] {
  return stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * Removes every plugin. They are the one kind no prune of any sort reaches, they
 * survive a daemon restart, and a volume plugin left enabled holds mounts.
 */
async function removeEveryPlugin(): Promise<void> {
  const { stdout } = await execFileAsync("docker", ["plugin", "ls", "-q"]).catch(() => ({ stdout: "" }));
  const installed = lines(stdout);
  if (installed.length === 0) return;
  // `-f` because an enabled plugin refuses removal otherwise, and a test that
  // left one enabled is exactly the leftover this is here for.
  await execFileAsync("docker", ["plugin", "rm", "-f", ...installed], { timeout: RESET_TIMEOUT_MS }).catch(
    () => undefined,
  );
}

/**
 * Removes every context but the one in use and `default`.
 *
 * A context is client configuration rather than a daemon object, and emptying it
 * is a decision this module makes deliberately: a fixture context left standing
 * is a row on the next file's screen that no test of that file created. The
 * active one is spared because removing it would take away how this machine
 * reaches its daemon, and `default` cannot be removed at all.
 */
async function removeCreatedContexts(): Promise<void> {
  const { stdout } = await execFileAsync("docker", [
    "context",
    "ls",
    "--format",
    "{{.Name}}|{{.Current}}",
  ]).catch(() => ({ stdout: "" }));
  for (const line of lines(stdout)) {
    const [name, current] = line.split("|");
    if (name === undefined || name === "default" || current === "true") continue;
    await execFileAsync("docker", ["context", "rm", "-f", name]).catch(() => undefined);
  }
}

/**
 * Removes every builder that is not the daemon's own — the `docker-container`
 * ones a test creates, and anything else with a driver of its own.
 *
 * Before the containers, deliberately: asked while its container is still there,
 * buildx takes the container and the state volume with the entry. Asked after,
 * it would leave an entry pointing at nothing. The daemon-backed builders
 * (driver `docker`: `default`, `desktop-linux`) are the installation's, not a
 * run's, and removing one is client configuration damage, not emptying Docker.
 */
async function removeCreatedBuilders(): Promise<void> {
  const { stdout } = await execFileAsync("docker", [
    "buildx",
    "ls",
    "--format",
    "{{.Builder.Name}}|{{.Builder.Driver}}",
  ]).catch(() => ({ stdout: "" }));
  // One line per node, so a builder with several appears several times.
  const created = new Set(
    lines(stdout)
      .map((line) => line.split("|"))
      .filter((parts) => parts.length === 2 && parts[1] !== "docker")
      .map((parts) => parts[0]!),
  );
  for (const builder of created) {
    await execFileAsync("docker", ["buildx", "rm", "-f", builder], { timeout: RESET_TIMEOUT_MS }).catch(
      () => undefined,
    );
  }
}

async function removeEveryContainerBut(spared: string): Promise<void> {
  const { stdout } = await execFileAsync("docker", ["ps", "-aq", "--no-trunc"]).catch(() => ({ stdout: "" }));
  const doomed = lines(stdout).filter((id) => id !== spared);
  if (doomed.length === 0) return;
  // One call: `docker rm` removes what it can and reports the rest, so a container
  // the daemon is already removing costs a message rather than the run.
  await execFileAsync("docker", ["rm", "-fv", ...doomed], { timeout: RESET_TIMEOUT_MS }).catch(() => undefined);
}

/**
 * The clean daemon every end-to-end file starts from: **empty, except the run's
 * own registry** — that container, the volume holding what has been pushed into
 * it, and the `registry:2` image it runs from, which survives every prune here
 * by being in use.
 *
 * The suite is serial and every file drives the same daemon, so a file used to
 * inherit whatever the file before it left standing — a container that outlived
 * a failed assertion, an image a build produced, a network nobody removed. That
 * is invisible from the file that then fails, and it fails differently depending
 * on which files ran first, which is what a flake is.
 *
 * The order is load-bearing:
 *
 * 1. **The registry first**, before anything is removed. Sparing it is what
 *    keeps `registry:2` in use — an image in use is an image the prune cannot
 *    take, and `registry:2` is the one image that cannot be restored from the
 *    registry.
 * 2. **What the tests pull is published**, so that step 8 costs a call to
 *    localhost rather than a call to Docker Hub.
 * 3. **Plugins and contexts**, which no prune of any kind reaches.
 * 4. **Builders that are not the daemon's own**, while their containers are
 *    still there for buildx to take with them.
 * 5. **Every other container**, with `-v`.
 * 6. **Images, networks, build cache and every volume not in use.** `--volumes`
 *    prunes only the anonymous ones, so the named pass after it is what makes
 *    this total.
 * 7. **The selected builder's cache and its build records**, neither of which
 *    the prune above empties.
 * 8. **The base images come back.** Half the specs use `alpine:3.20` without
 *    asking for it, so an empty daemon would trade one class of flake for
 *    another. This is the one thing the reset puts back, and it is a *known*
 *    state rather than an inherited one — restored from the run's own registry,
 *    or rebuilt locally.
 *
 * **This empties the machine it runs on, and is deliberately not scoped to the
 * suite's own objects.** An operator's containers, images, volumes, networks,
 * builders and plugins go with the suite's. That is the opposite of the rule the
 * rest of the suite follows, and it is a decision about this repository's own
 * development machine, not something a fixture may ever do on its own.
 *
 * One thing is **not** emptied, and it is not an oversight: **swarm** is not
 * touched at all — it left the product on 2026-08-27, and no check of this
 * project ever initialises one. Contexts are emptied, bar the two Docker will
 * not part with: the one in use and `default`.
 */
export async function resetDaemon(): Promise<void> {
  const started = Date.now();
  await ensureRunRegistrySeeded();

  await removeEveryPlugin();
  await removeCreatedContexts();
  await removeCreatedBuilders();
  await removeEveryContainerBut(await sparedContainerId());

  // Raised, not swallowed: a reset that could not empty the daemon has not
  // established the state its file is about to assume, and fails saying so.
  await execFileAsync("docker", ["system", "prune", "-af", "--volumes"], { timeout: RESET_TIMEOUT_MS });
  // The named volumes the line above leaves. Nothing in use is a candidate, which
  // is what keeps the registry's own storage — and everything pushed into it.
  await execFileAsync("docker", ["volume", "prune", "-af"], { timeout: RESET_TIMEOUT_MS });

  // Asked explicitly because the prune above has been seen to leave cache behind:
  // this is the selected builder only, and a machine with none is not a broken one.
  await execFileAsync("docker", ["builder", "prune", "-af"], { timeout: RESET_TIMEOUT_MS }).catch(
    (failure: unknown) => {
      console.warn(`could not prune the build cache before this file (${String(failure)})`);
    },
  );
  // Build records are kept by the builder beside its cache and outlive every
  // prune; older buildx versions have no such command, and that is not a failure.
  await execFileAsync("docker", ["buildx", "history", "rm", "--all"], { timeout: RESET_TIMEOUT_MS }).catch(
    () => undefined,
  );

  await ensureImages(BASE_IMAGES);

  const took = Date.now() - started;
  if (took > SLOW_RESET_MS) console.warn(`the daemon reset before this file took ${Math.round(took / 1000)}s`);
}

async function listOwned(args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync("docker", [...args, "-q", "--filter", `label=${OWNER_LABEL}`]).catch(() => ({
    stdout: "",
  }));
  return stdout.split("\n").filter((id) => id.length > 0);
}

async function sweepKind(kind: string, listArgs: string[], removeArgs: string[]): Promise<void> {
  const ids = await listOwned(listArgs);
  if (ids.length === 0) return;
  // One at a time for the kinds a single refusal would otherwise abort: a volume
  // still mounted, or an image still referenced by a container outside the run.
  for (const id of ids) {
    await execFileAsync("docker", [...removeArgs, id]).catch(() => undefined);
  }
  console.log(`swept ${ids.length} leftover test ${kind}(s)`);
}

/**
 * Removes the Docker objects left behind by test runs — including runs that were
 * killed before their own cleanup could execute.
 *
 * Scoped to the ownership label the fixtures stamp, so an object the operator
 * created is never a candidate: a run that finds nothing labelled removes
 * nothing at all. That is the opposite bargain from {@link resetDaemon}, and it
 * is why this one is safe to run on any machine at any time.
 *
 * Containers go first, so the volumes, networks and images they hold are free by
 * the time their turn comes.
 */
export async function sweepLeftovers(): Promise<void> {
  // First, because it is the only thing that can still name what the daemon
  // pulled out of the run's registry: once the container is gone, the port it was
  // published on is gone with it.
  await stopSharedRegistry();

  // `-v` so a container's anonymous volumes go with it: Docker attaches one per
  // `VOLUME` an image declares, and it carries no label of ours, so nothing else
  // could ever recognise it as ours.
  await sweepKind("container", ["ps", "-a"], ["rm", "-fv"]);
  await sweepKind("volume", ["volume", "ls"], ["volume", "rm"]);
  await sweepKind("network", ["network", "ls"], ["network", "rm"]);
  // `-a`, because `docker images` without it omits untagged images entirely — and an
  // image that has lost its tag while a container still referenced it is exactly the
  // leftover this sweep exists for. The label filter still stands between it and
  // anything of the operator's.
  await sweepKind("image", ["images", "-a"], ["rmi", "-f"]);
}
