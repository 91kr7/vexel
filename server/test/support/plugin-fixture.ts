/**
 * A daemon plugin the tests own, published in a throwaway registry of their own.
 *
 * Installing a plugin is a host mutation and a network pull, so the plugin the
 * suite installs must be neither the operator's nor Docker Hub's: it is built
 * here from an empty rootfs and a `config.json` this file authors, pushed to a
 * `registry:2` container started for the occasion, and removed from the local
 * daemon again before any test runs. The privileges a test expects are
 * therefore the ones written below — a property of the fixture, not of the
 * machine it runs on.
 *
 * The plugin is never enabled: its entrypoint is not a real plugin binary, and
 * `enable` on the real daemon is exactly the refusal REQ-111 says must be
 * surfaced verbatim.
 */
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { REGISTRY_IMAGE, ensureImage } from "./base-images.js";
import { ownershipArgs } from "./fixtures.js";

const execFileAsync = promisify(execFile);

/** What the fixture plugin's `config.json` asks the host for, and therefore what the daemon reports. */
export interface FixturePrivilege {
  name: string;
  values: string[];
}

export interface PluginFixture {
  /** The reference the plugin is installed from, in the throwaway registry. */
  reference: string;
  /** The name the daemon files the plugin under when it is installed from the reference alone. */
  installedName: string;
  /** A name with no registry host in it, for installing the same plugin under an alias. */
  alias: string;
  /** Exactly what this plugin asks for, as authored below. */
  privileges: FixturePrivilege[];
  /** Removes the registry container and anything else this fixture left behind. */
  stop: () => Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Builds the plugin, publishes it and hands back the reference to install from.
 *
 * `uniqueSuffix` makes both the name and the rootfs content unique: Docker
 * stores plugin content by digest and refuses to create a second plugin from
 * bytes it already holds, so two fixtures alive at once must not be identical.
 */
export async function startPluginFixture(caseName: string, uniqueSuffix: string): Promise<PluginFixture> {
  await ensureImage(REGISTRY_IMAGE);
  const port = await freePort();
  const { stdout } = await execFileAsync("docker", [
    "run",
    "-d",
    "-p",
    `${port}:5000`,
    ...ownershipArgs(caseName),
    REGISTRY_IMAGE,
  ]);
  const containerId = stdout.trim();
  const host = `localhost:${port}`;
  const reference = `${host}/vexel-test-plugin-${uniqueSuffix}:v1`;
  const stateDir = `/tmp/vexel-test-plugin-${uniqueSuffix}`;
  const privileges: FixturePrivilege[] = [
    { name: "network", values: ["host"] },
    { name: "mount", values: [stateDir] },
    { name: "capabilities", values: ["CAP_SYS_ADMIN"] },
  ];

  const stop = async () => {
    for (const name of [reference, `vexel-test-plugin-${uniqueSuffix}:v1`]) {
      await execFileAsync("docker", ["plugin", "rm", "-f", name]).catch(() => undefined);
    }
    await execFileAsync("docker", ["rm", "-fv", containerId]).catch(() => undefined);
  };

  try {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const ready = await fetch(`http://${host}/v2/`).then(
        (response) => response.ok || response.status === 401,
        () => false,
      );
      if (ready) break;
      if (Date.now() > deadline) throw new Error(`the ${caseName} plugin registry did not become ready in time`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const buildDir = await mkdtemp(join(tmpdir(), "vexel-test-plugin-"));
    try {
      await mkdir(join(buildDir, "rootfs"), { recursive: true });
      // Not a working plugin binary, and deliberately so: nothing here is ever
      // enabled. The bytes carry the suffix so the plugin's content digest is
      // this fixture's own.
      await writeFile(join(buildDir, "rootfs", "vexel-test-plugin"), `#!/bin/false\n# ${uniqueSuffix}\n`, { mode: 0o755 });
      await writeFile(
        join(buildDir, "config.json"),
        JSON.stringify({
          description: "Vexel test plugin",
          documentation: "https://example.invalid/vexel-test-plugin",
          entrypoint: ["/vexel-test-plugin"],
          interface: { types: ["docker.volumedriver/1.0"], socket: "vexel.sock" },
          network: { type: "host" },
          mounts: [
            {
              name: "state",
              description: "where the fixture would keep its state",
              destination: "/state",
              source: stateDir,
              type: "bind",
              options: ["rbind"],
              settable: ["source"],
            },
          ],
          linux: { capabilities: ["CAP_SYS_ADMIN"], allowAllDevices: false, devices: [] },
        }),
        "utf8",
      );

      await execFileAsync("docker", ["plugin", "create", reference, buildDir]);
      try {
        await execFileAsync("docker", ["plugin", "push", reference]);
      } finally {
        // The local copy goes at once: a test that installs from the registry
        // must find nothing already installed.
        await execFileAsync("docker", ["plugin", "rm", "-f", reference]).catch(() => undefined);
      }
    } finally {
      await rm(buildDir, { recursive: true, force: true });
    }
  } catch (error) {
    await stop();
    throw error;
  }

  return { reference, installedName: reference, alias: `vexel-test-plugin-${uniqueSuffix}:v1`, privileges, stop };
}

/** Whether the daemon currently has a plugin under that exact name. */
export async function pluginIsInstalled(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync("docker", ["plugin", "ls", "--format", "{{.Name}}"]).catch(() => ({ stdout: "" }));
  return stdout.split("\n").some((line) => line.trim() === name);
}

/** Removes the plugin if it is there, so a failed test leaves `docker plugin ls` as it found it. */
export async function removePluginQuietly(name: string): Promise<void> {
  await execFileAsync("docker", ["plugin", "disable", "-f", name]).catch(() => undefined);
  await execFileAsync("docker", ["plugin", "rm", "-f", name]).catch(() => undefined);
}
