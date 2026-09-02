/**
 * The images the daemon-facing fixtures are built on, and the one guarantee the
 * suite needs about them: that they are there when a test needs them.
 *
 * A suite that only passes on a warm daemon passes by accident. After a
 * `docker system prune -af` the daemon holds nothing, and a fixture that assumes
 * a base image is local fails for a reason that says nothing about the product
 * — a compose file with `pull_policy: never` cannot find its image, a test that
 * contracts "no pull happens for a local image" watches one happen, and every
 * file pulling at once turns a registry hiccup into a failed assertion.
 *
 * So Docker Hub is kept out of the middle of a run. Each image gets there
 * without it:
 *
 * - {@link TINY_IMAGE} is **built here**, `FROM scratch`, every time it is
 *   missing. Nothing is fetched at all — not even from the run's own registry,
 *   which would be seven times slower — and that is the whole point: the
 *   `hello-world` it replaces failed to re-pull often enough, after a system
 *   prune, to lose whole specs to `production.cloudfront.docker.com … EOF`.
 * - {@link ALPINE_IMAGE} is **mirrored into the run's own registry** the first
 *   time it is ensured — taken from the daemon's local copy when it has one, so
 *   usually no network at all — and restored from there whenever it goes
 *   missing again (a prune spec in this pass prunes the host mid-run). Hub is asked
 *   once per run at most, and only on a daemon that does not hold it.
 * - {@link REGISTRY_IMAGE} is **the one irreducible exception**: it is the image
 *   that run's registry is itself run from, so it cannot come out of it. It has
 *   to be on the daemon, pulled from Hub if it is not.
 *
 * The two pulled images are shared infrastructure in the strictest sense: no
 * test removes them, they carry no ownership label, and the sweep therefore
 * never sees them. What this module builds and starts — the tiny image, the
 * mirrored copies, the registry container — carries the ownership labels like
 * anything else the suite creates, so a killed run is swept by
 * `npm run test:sweep`; putting any of it back costs local seconds.
 *
 * Two entry points use it: the `test:images` npm script, which prepares
 * everything before a whole server pass so a single process does the work, and
 * the test files themselves, which ensure what they need before their first test
 * — that is what keeps `node --test test/api/<one-file>.test.ts` working on a
 * pruned daemon. The end-to-end suite has no preparation step of its own at all:
 * every spec file re-establishes this through `lifecycle.ts`.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileAsync } from "./docker-cli.js";
import { ownershipArgs } from "./ownership.js";

/**
 * The image a fixture uses whenever it only needs a container that starts
 * instantly. It declares no `VOLUME`, so it can never orphan an anonymous one.
 */
export const ALPINE_IMAGE = "alpine:3.20";
/**
 * The multi-layer, registry-pulled image the layer and diff analyses need — and
 * the image the run's own registry is run from, which is what makes it the one
 * exception to everything else here: it can be mirrored nowhere, because the
 * mirror does not exist until it has been started from this.
 */
export const REGISTRY_IMAGE = "registry:2";

/**
 * The single-layer image a fixture is made from whenever all it needs is
 * something a container can instantly be created out of.
 *
 * Built here, `FROM scratch`, rather than pulled: it is a few kilobytes with one
 * layer and one file of known content, and — the reason it exists — it needs no
 * network at all. The `hello-world` it replaces had to be fetched from Docker
 * Hub, and after a system prune that fetch failed often enough to lose whole
 * specs to `EOF` errors that said nothing about the product.
 *
 * A `CMD` is part of the contract: `docker create` refuses an image that names
 * no command, and creating a container is this image's entire purpose.
 */
export const TINY_IMAGE = "vexel-test-tiny:1";
/** The one file {@link TINY_IMAGE}'s single layer adds — what a filesystem or changeset assertion looks for. */
export const TINY_IMAGE_FILE = "single-file.txt";
/** The command {@link TINY_IMAGE}'s config names, as `docker inspect` reports it. */
export const TINY_IMAGE_COMMAND = `/${TINY_IMAGE_FILE}`;
const TINY_IMAGE_CONTENT = "vexel single-file fixture\n";

/** Every base image the suite is allowed to build a fixture on. Kept small on purpose: roughly 35 MB in total. */
export const BASE_IMAGES = [ALPINE_IMAGE, REGISTRY_IMAGE, TINY_IMAGE];

/**
 * The image `docker buildx` boots a `docker-container` builder from.
 *
 * Not an image any fixture is built on — an image the toolchain needs — but it
 * reaches the same registry, and worse: buildx contacts the registry on **every**
 * bootstrap, even when the daemon already holds the image (measured: "pulling
 * image moby/buildkit:buildx-stable-1 1.4s done" on a machine that had it). So
 * having it locally is not enough; the builder has to be pointed at a copy that
 * is not on the internet. That is what {@link localBuilderDriverArgs} is for.
 */
const BUILDER_IMAGE = "moby/buildkit:buildx-stable-1";

/**
 * Every image that is **fetched** keeps a copy in the run's own registry, so
 * that needing one costs a call to localhost and never a call to Docker Hub.
 *
 * Two images are not here, for opposite reasons. {@link REGISTRY_IMAGE} cannot
 * be, and not by choice: the registry is started from it, so it cannot come out
 * of it. {@link TINY_IMAGE} has no reason to be — it is built, not fetched, and
 * building it is **seven times cheaper than pulling it back**: 0.32s against
 * 2.39s, measured, and paid once per test file. Publishing it was tried, for the
 * tidiness of one rule with no exceptions, and cost five minutes of suite.
 */
const MIRRORED_IMAGES = [ALPINE_IMAGE, BUILDER_IMAGE];

/**
 * The suite's own registry, and what is published in it.
 *
 * It exists for two jobs. The first is mirroring, above. The second is the
 * opposite of everything else here: a handful of tests contract that a reference
 * the daemon does **not** hold is fetched before it is used. They need an image
 * that is genuinely absent and genuinely pullable, which no local image can be —
 * and which Docker Hub should not be asked to provide, since that is precisely
 * the dependency this module exists to remove. So the suite publishes one of its
 * own and the product pulls from there: a real pull, over a network that cannot
 * give way.
 *
 * One container per machine, under a fixed name, shared by every process of a
 * run — starting it is idempotent, so a single spec file run on its own gets it
 * just the same. It carries the ownership labels, so a killed run is swept.
 */
export const REGISTRY_CONTAINER = "vexel-test-registry";
/** The repository the pullable fixture is published under, and what a search field is filled with to find it. */
export const PULLABLE_REPOSITORY = "vexel-test-pullable";
const PULLABLE_TAG = "1";
/** Deliberately not {@link TINY_IMAGE_FILE}: different content means a different layer, so this is a transfer and not a no-op. */
const PULLABLE_FILE = "pullable-file.txt";
const PULLABLE_CONTENT = "vexel pullable fixture\n";

/**
 * Work in flight in this process, so two fixtures asking for the same thing at
 * the same moment wait on one attempt instead of racing two. Deliberately not a
 * cache of past results: another process in the same run may remove an image
 * (a prune spec in this pass prunes the host), so presence has to be re-checked every
 * time rather than remembered.
 */
const inFlight = new Map<string, Promise<unknown>>();

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

/**
 * Builds a one-layer image `FROM scratch` holding exactly one file, and stamps
 * it as this run's. Nothing is fetched: the base is the empty rootfs, so the
 * whole build is local and its content is entirely known to the caller.
 */
async function buildSingleFileImage(tag: string, fileName: string, content: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), "vexel-test-scratch-image-"));
  try {
    await writeFile(join(contextDir, fileName), content, "utf8");
    await writeFile(
      join(contextDir, "Dockerfile"),
      ["FROM scratch", `COPY ${fileName} /${fileName}`, `CMD ["/${fileName}"]`, ""].join("\n"),
      "utf8",
    );
    await execFileAsync("docker", ["build", ...ownershipArgs("base-image"), "-t", tag, contextDir]);
  } finally {
    await rm(contextDir, { recursive: true, force: true });
  }
}

/** A reference split the way a registry reads it: everything before the last tag separator is the repository. */
function splitReference(reference: string): { repository: string; tag: string } {
  const lastColon = reference.lastIndexOf(":");
  const lastSlash = reference.lastIndexOf("/");
  if (lastColon > lastSlash) return { repository: reference.slice(0, lastColon), tag: reference.slice(lastColon + 1) };
  return { repository: reference, tag: "latest" };
}

/**
 * Publishes the daemon's copy of a base image in the run's own registry, unless
 * it is already there.
 *
 * A tag and a push, both local: nothing is fetched. The mirrored tag is dropped
 * again as soon as it is pushed, so the operator's `docker images` gains no
 * second name for an image they already had — and so the Hub digest the image
 * carries stays the only one on it.
 *
 * A failure here is not the caller's problem: the image it asked for is on the
 * daemon, which is all it wanted. Only the safety net is missing, so it is said
 * rather than raised.
 */
async function mirrorIntoRunRegistry(reference: string): Promise<void> {
  try {
    const host = await ensureRegistryHost();
    const { repository, tag } = splitReference(reference);
    if ((await publishedTags(host, repository)).includes(tag)) return;
    const mirrored = `${host}/${reference}`;
    await execFileAsync("docker", ["tag", reference, mirrored]);
    try {
      await execFileAsync("docker", ["push", mirrored]);
    } finally {
      await execFileAsync("docker", ["rmi", mirrored]).catch(() => undefined);
    }
  } catch (failure) {
    console.warn(`could not mirror ${reference} into the run's registry; a later restore would have to reach Docker Hub (${String(failure)})`);
  }
}

/** Restores a base image from the run's own registry, if that is where it already is. Answers whether it did. */
async function restoreFromRunRegistry(reference: string): Promise<boolean> {
  const host = await ensureRegistryHost();
  const { repository, tag } = splitReference(reference);
  if (!(await publishedTags(host, repository)).includes(tag)) return false;
  const mirrored = `${host}/${reference}`;
  await execFileAsync("docker", ["pull", "-q", mirrored]);
  await execFileAsync("docker", ["tag", mirrored, reference]);
  await execFileAsync("docker", ["rmi", mirrored]).catch(() => undefined);
  return true;
}

async function ensureOnce(reference: string): Promise<void> {
  if (await isPresent(reference)) return;
  // The run's own registry first, always, whatever the image is and however it
  // first got there. Only an image the registry has never held goes further, and
  // over a whole run that is at most once and never in the middle of one.
  // `registry:2` cannot take this route: the registry is started from it.
  if (MIRRORED_IMAGES.includes(reference) && (await restoreFromRunRegistry(reference).catch(() => false))) return;
  // Made here rather than fetched, and never published: a build from the empty
  // rootfs costs 0.32s where pulling the same image back costs 2.39s.
  if (reference === TINY_IMAGE) {
    await buildSingleFileImage(TINY_IMAGE, TINY_IMAGE_FILE, TINY_IMAGE_CONTENT);
    return;
  }
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
  if (MIRRORED_IMAGES.includes(reference)) await mirrorIntoRunRegistry(reference);
}

/** Runs `attempt` unless the same key is already running, in which case that one is awaited instead. */
function once<T>(key: string, attempt: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const started = attempt().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/** Makes sure the image is on the daemon — pulled, or built where the suite builds its own — only if it is not. */
export function ensureImage(reference: string): Promise<void> {
  return once(reference, () => ensureOnce(reference));
}

/** Same, for the images one test file declares it builds its fixtures on. One at a time: a cold daemon has no reason to fetch three at once. */
export async function ensureImages(references: readonly string[]): Promise<void> {
  for (const reference of references) {
    await ensureImage(reference);
  }
}

/** The host:port the suite's registry is published on, or `null` when no container of ours is running. */
async function runningRegistryHost(): Promise<string | null> {
  const { stdout: running } = await execFileAsync("docker", [
    "container",
    "inspect",
    REGISTRY_CONTAINER,
    "--format",
    "{{.State.Running}}",
  ]).catch(() => ({ stdout: "" }));
  if (running.trim() !== "true") return null;
  const { stdout: mappings } = await execFileAsync("docker", ["port", REGISTRY_CONTAINER, "5000/tcp"]).catch(() => ({
    stdout: "",
  }));
  // `docker port` answers one line per address family (0.0.0.0 and [::]); they
  // carry the same host port, so the first is as good as any.
  const mapping = mappings.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  if (!mapping) return null;
  return `localhost:${mapping.slice(mapping.lastIndexOf(":") + 1)}`;
}

/**
 * Deliberately well under the thirty seconds a Playwright hook and a docker call
 * each get, and for the reason `check-budget-conformance.mjs` exists: a wait as
 * long as the budget it runs inside can never fail with its own message. At
 * thirty this said nothing — the hook died first, naming a line and no cause.
 * A `registry:2` that is going to answer answers in under a second.
 */
const REGISTRY_READY_TIMEOUT_MS = 12_000;

async function waitForRegistry(host: string): Promise<string> {
  const deadline = Date.now() + REGISTRY_READY_TIMEOUT_MS;
  for (;;) {
    // A registry with no authentication answers 200; one with authentication
    // answers 401. Either means it is listening and ready to be talked to.
    const ready = await fetch(`http://${host}/v2/`).then(
      (response) => response.ok || response.status === 401,
      () => false,
    );
    if (ready) return host;
    if (Date.now() > deadline) throw new Error(`the suite's own registry on ${host} did not become ready in time`);
    await delay(300);
  }
}

async function ensureRegistryHost(): Promise<string> {
  const alreadyUp = await runningRegistryHost();
  if (alreadyUp) return await waitForRegistry(alreadyUp);

  // Nothing of ours is running, so a container under that name is a leftover
  // holding the name hostage — and only the name, since a stopped registry
  // serves nobody.
  await execFileAsync("docker", ["rm", "-fv", REGISTRY_CONTAINER]).catch(() => undefined);
  await ensureImage(REGISTRY_IMAGE);
  await execFileAsync("docker", [
    "run",
    "-d",
    "-P",
    "--name",
    REGISTRY_CONTAINER,
    ...ownershipArgs("shared-registry"),
    REGISTRY_IMAGE,
  ]).catch(async (failure: unknown) => {
    // Another process of the same run may have won the name between the check
    // above and here. Its container is as good as ours.
    if (!(await runningRegistryHost())) throw failure;
  });

  const host = await runningRegistryHost();
  if (!host) throw new Error(`the suite's own registry (${REGISTRY_CONTAINER}) started without publishing a host port`);
  return await waitForRegistry(host);
}

/** The tags the registry already holds for a repository; empty when it does not hold the repository at all. */
async function publishedTags(host: string, repository: string): Promise<string[]> {
  return await fetch(`http://${host}/v2/${repository}/tags/list`).then(
    async (response) => {
      if (!response.ok) return [];
      const body = (await response.json()) as { tags?: string[] | null };
      return body.tags ?? [];
    },
    () => [],
  );
}

/**
 * Makes sure the suite's registry is up and holds the pullable fixture, and
 * hands back the reference to pull it by.
 *
 * The local copy is removed as soon as it is pushed: a test that contracts "a
 * reference the daemon does not hold is fetched first" must find nothing held.
 * The image is left in the registry between processes of a run, so the second
 * caller pays for one HTTP question rather than a second build and push.
 */
export function ensurePullableImage(): Promise<string> {
  return once("pullable-image", async () => {
    const host = await ensureRegistryHost();
    const reference = `${host}/${PULLABLE_REPOSITORY}:${PULLABLE_TAG}`;
    if ((await publishedTags(host, PULLABLE_REPOSITORY)).includes(PULLABLE_TAG)) return reference;

    await buildSingleFileImage(reference, PULLABLE_FILE, PULLABLE_CONTENT);
    try {
      await execFileAsync("docker", ["push", reference]);
    } finally {
      await execFileAsync("docker", ["rmi", "-f", reference]).catch(() => undefined);
    }
    return reference;
  });
}

/**
 * The reference an image is published under in the run's own registry, making
 * sure it is there first.
 *
 * What a fixture writes in a `FROM` line when the build runs inside a
 * `docker-container` builder: BuildKit in a container has an image store of its
 * own and resolves every `FROM` against a registry, so a plain `alpine:3.20`
 * there is a call to Docker Hub in the middle of a run however warm the daemon
 * is.
 */
export async function mirroredImage(reference: string): Promise<string> {
  await ensureImage(reference);
  await mirrorIntoRunRegistry(reference);
  return `${await ensureRegistryHost()}/${reference}`;
}

/**
 * The `docker buildx create` options that keep a `docker-container` builder off
 * the internet: boot from the copy of BuildKit in the run's own registry, on the
 * host's network so that "localhost" means the same thing inside the builder as
 * it does out here.
 */
export async function localBuilderDriverArgs(): Promise<string[]> {
  return ["--driver-opt", `image=${await mirroredImage(BUILDER_IMAGE)}`, "--driver-opt", "network=host"];
}

/**
 * Removes the shared registry container.
 *
 * Called at the end of a whole pass, not by the tests that use it: it is the
 * run's infrastructure, and a test that stopped it would break every later file.
 * A run killed before this point leaves it behind, which is what the ownership
 * label on it is for.
 */
export async function stopSharedRegistry(): Promise<void> {
  // Anything the daemon pulled *from* that registry is named after it — buildx
  // pulls the BuildKit image that way — and carries no label of ours, since the
  // labels are the mirrored image's own. Its name is the only thing that can
  // identify it, and only while the registry is still there to be asked its
  // port, so the tags go first.
  const host = await runningRegistryHost();
  if (host) {
    const { stdout } = await execFileAsync("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}"]).catch(() => ({
      stdout: "",
    }));
    const own = stdout.split("\n").map((line) => line.trim()).filter((line) => line.startsWith(`${host}/`));
    for (const reference of own) {
      await execFileAsync("docker", ["rmi", "-f", reference]).catch(() => undefined);
    }
  }
  await execFileAsync("docker", ["rm", "-fv", REGISTRY_CONTAINER]).catch(() => undefined);
}

/**
 * Everything that has to be on the daemon itself, whatever else happens: the
 * body of `npm run test:images -w server`.
 *
 * The only step in the whole arrangement allowed to reach Docker Hub, and only
 * for what is genuinely not here yet. No pass runs it any more — each file's own
 * reset re-establishes what it needs — so this is a command an operator types
 * before a run on a cold machine, to keep a public registry's silence out of the
 * middle of one.
 */
export async function ensureDaemonImages(): Promise<void> {
  await ensureImages([...BASE_IMAGES, BUILDER_IMAGE]);
}

/**
 * The registry up and holding everything the tests pull, asking the daemon for
 * an image only where the registry does not already have it.
 *
 * What it does *not* do is the reason it exists: the per-file reset
 * (`lifecycle.ts`) runs on a daemon it is about to prune, so restoring
 * `moby/buildkit` onto that daemon merely to re-push a copy already published
 * would cost a hundred megabytes, discarded seconds later, once per spec file.
 * A published tag is one HTTP question, and on every file after the first the
 * answer is already yes.
 */
export async function ensureRunRegistrySeeded(): Promise<string> {
  const host = await ensureRegistryHost();
  for (const reference of MIRRORED_IMAGES) {
    const { repository, tag } = splitReference(reference);
    if ((await publishedTags(host, repository)).includes(tag)) continue;
    await ensureImage(reference);
    await mirrorIntoRunRegistry(reference);
  }
  await ensurePullableImage();
  return host;
}

/**
 * Brings up the run's own registry and puts into it everything the tests will
 * pull: the body of `npm run test:registry -w server`.
 *
 * Idempotent from end to end — an already-prepared registry is the normal case,
 * not an error — so a single test file, or a single spec, run on its own gets
 * the same arrangement rather than a second one. Answers the host it is on.
 */
export async function prepareRunRegistry(): Promise<string> {
  await ensureDaemonImages();
  return await ensureRunRegistrySeeded();
}
