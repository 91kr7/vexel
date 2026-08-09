// The product's own statement of what it covers of Docker (REQ-105), held as
// data so that a change of coverage is one line here rather than an edit to a
// screen. Every area is either covered by a dedicated screen, reachable only
// through the raw console, or outside what this product is.
//
// The gaps are deliberate and each carries its reason: image building, swarm
// stack deployment, build-cache export/import and TCP+TLS context creation were
// withdrawn on 2026-08-07 (departures One and Three of the plan), and
// vulnerability scanning was never modelled. This file is where the
// "100% of Docker" claim is kept honest.

export type CoverageState = 'dedicated-screen' | 'console-only' | 'not-applicable';

export interface CoverageArea {
  id: string;
  /** The Docker capability area, named as an operator would name it. */
  name: string;
  /** What the area covers, in one line. */
  summary: string;
  state: CoverageState;
  /** The screen covering it, as a navigation screen id. Set exactly when the state is `dedicated-screen`. */
  screenId?: string;
  /** The command that reaches it in the raw console. Set exactly when the state is `console-only`. */
  command?: string;
  /** Why the area has no screen of its own. Set exactly when the state is not `dedicated-screen`. */
  reason?: string;
}

export const coverageAreas: CoverageArea[] = [
  {
    id: 'host-overview',
    name: 'Host overview',
    summary: 'Container, image, volume and stack counts, disk usage and recent activity for the active daemon.',
    state: 'dedicated-screen',
    screenId: 'dashboard',
  },
  {
    id: 'daemon-events',
    name: 'Daemon event stream',
    summary: 'The live event feed of the daemon, each entry with its timestamp, object type and action.',
    state: 'dedicated-screen',
    screenId: 'dashboard',
  },
  {
    id: 'container-lifecycle',
    name: 'Container lifecycle',
    summary: 'List, start, stop, restart, pause, unpause, kill, rename, remove and prune containers.',
    state: 'dedicated-screen',
    screenId: 'containers',
  },
  {
    id: 'container-create',
    name: 'Container creation and run',
    summary: 'Create and run a container: image, command, ports, mounts, environment, network, restart policy and resource limits.',
    state: 'dedicated-screen',
    screenId: 'containers',
  },
  {
    id: 'container-logs',
    name: 'Container logs',
    summary: "Follow, tail, time-bound and search a container's stdout and stderr.",
    state: 'dedicated-screen',
    screenId: 'containers',
  },
  {
    id: 'container-stats',
    name: 'Container statistics and processes',
    summary: 'Live CPU, memory, network and block I/O, and the processes running inside a container.',
    state: 'dedicated-screen',
    screenId: 'containers',
  },
  {
    id: 'container-exec',
    name: 'Interactive exec and attach',
    summary: 'An interactive shell inside a running container, and attaching to its main process.',
    state: 'dedicated-screen',
    screenId: 'containers',
  },
  {
    id: 'container-inspect',
    name: 'Container inspection and configuration',
    summary: 'The full inspect payload, and editing the settings that require the container to be recreated.',
    state: 'dedicated-screen',
    screenId: 'containers',
  },
  {
    id: 'container-filesystem-transfer',
    name: 'Container filesystem export and import',
    summary: "Download a container's filesystem as a tarball, and upload one back as an image.",
    state: 'dedicated-screen',
    screenId: 'containers',
  },
  {
    id: 'container-file-copy',
    name: 'Copying files in and out of a container',
    summary: 'Moving a single file between the host and a running container.',
    state: 'console-only',
    command: 'docker cp',
    reason:
      "This application browses an image's filesystem, not a running container's: a container's files are copied from the console, or its whole filesystem is exported from the Containers screen.",
  },
  {
    id: 'image-inventory',
    name: 'Image inventory and registry transfer',
    summary: 'List, inspect, pull, push, tag, untag, remove and prune images, with per-layer transfer progress.',
    state: 'dedicated-screen',
    screenId: 'images-layers',
  },
  {
    id: 'image-save-load',
    name: 'Image save and load',
    summary: 'Download images as a tarball, and upload one back into the daemon.',
    state: 'dedicated-screen',
    screenId: 'images-layers',
  },
  {
    id: 'image-layers',
    name: 'Layer stack and changesets',
    summary: 'The ordered layers of an image with their size and build instruction, and what each layer added, changed or deleted.',
    state: 'dedicated-screen',
    screenId: 'images-layers',
  },
  {
    id: 'image-filesystem',
    name: 'Image filesystem browsing',
    summary: 'The merged filesystem of an image, browsable without running it, with file previews, search and downloads.',
    state: 'dedicated-screen',
    screenId: 'images-layers',
  },
  {
    id: 'image-diff',
    name: 'Image comparison',
    summary: 'The filesystem difference between two images, path by path.',
    state: 'dedicated-screen',
    screenId: 'images-layers',
  },
  {
    id: 'image-efficiency',
    name: 'Layer efficiency and secret signals',
    summary: "Wasted bytes, duplicated content and credential-looking paths found across an image's layers.",
    state: 'dedicated-screen',
    screenId: 'images-layers',
  },
  {
    id: 'image-build',
    name: 'Image building',
    summary: 'Building an image from a Dockerfile, with or without BuildKit.',
    state: 'console-only',
    command: 'docker build · docker buildx build',
    reason:
      'This application manages an existing Docker installation and does not produce images for it. A build also needs a build context and a Dockerfile on the machine running the server, which the operator cannot see when it runs on a remote host.',
  },
  {
    id: 'volumes',
    name: 'Volumes',
    summary: 'List, inspect, create, remove and prune volumes, with their size and the containers using them.',
    state: 'dedicated-screen',
    screenId: 'volumes-networks',
  },
  {
    id: 'networks',
    name: 'Networks',
    summary: 'List, inspect, create, remove and prune networks, and attach or detach containers.',
    state: 'dedicated-screen',
    screenId: 'volumes-networks',
  },
  {
    id: 'compose',
    name: 'Compose projects',
    summary: 'Discovered projects with up, down, restart, per-service scaling and aggregated logs, and the compose file itself.',
    state: 'dedicated-screen',
    screenId: 'compose',
  },
  {
    id: 'swarm-cluster',
    name: 'Swarm cluster and nodes',
    summary: 'Swarm state with init, join and leave, the join tokens, and the nodes with their role, availability and removal.',
    state: 'dedicated-screen',
    screenId: 'swarm',
  },
  {
    id: 'swarm-services',
    name: 'Swarm services',
    summary: 'Service inventory with create, update, scale, inspect with their tasks, and removal.',
    state: 'dedicated-screen',
    screenId: 'swarm',
  },
  {
    id: 'swarm-secrets',
    name: 'Swarm secrets and configs',
    summary: 'Secrets and configs listed and created, their value written once and never read back.',
    state: 'dedicated-screen',
    screenId: 'swarm',
  },
  {
    id: 'swarm-stacks',
    name: 'Swarm stacks',
    summary: 'Deployed stacks listed with the services they own, and stack removal.',
    state: 'dedicated-screen',
    screenId: 'swarm',
  },
  {
    id: 'swarm-stack-deploy',
    name: 'Swarm stack deployment',
    summary: 'Deploying a stack to the cluster from a compose file.',
    state: 'console-only',
    command: 'docker stack deploy',
    reason:
      'A deployment consumes a compose file on the machine running the server, and a deployed stack keeps no link to it: its services, networks, secrets and configs become cluster objects. Listing and removing stacks needs no file and is covered by the Swarm screen.',
  },
  {
    id: 'registries',
    name: 'Registries and authentication',
    summary:
      'Configured registries with their credential store and authentication state, login and logout through the host credential store, and anonymous repository and tag browsing.',
    state: 'dedicated-screen',
    screenId: 'registries',
  },
  {
    id: 'builders',
    name: 'Buildx builders',
    summary: 'The builder inventory, with create, remove and switching the active one.',
    state: 'dedicated-screen',
    screenId: 'builders-cache',
  },
  {
    id: 'build-cache',
    name: 'Build cache',
    summary: 'Build-cache records with their size and usage state, cache prune, and the images and layers a record produced.',
    state: 'dedicated-screen',
    screenId: 'builders-cache',
  },
  {
    id: 'build-cache-transfer',
    name: 'Build-cache export and import',
    summary: 'Exporting a build cache for another machine, and importing one from it.',
    state: 'console-only',
    command: 'docker buildx build --cache-to · --cache-from',
    reason:
      'buildx exports and imports a cache only as flags of a build, and this application does not build images. The inventory and the prune, which is where a local build cache costs disk, are covered by the Builders & cache screen.',
  },
  {
    id: 'contexts',
    name: 'Contexts and daemon information',
    summary:
      'Every context whatever its endpoint kind, with switching, removal, local-socket and SSH creation, and the information of the daemon behind the active one.',
    state: 'dedicated-screen',
    screenId: 'contexts',
  },
  {
    id: 'context-tls-create',
    name: 'TCP+TLS context creation',
    summary: 'Creating a context that reaches a daemon over TCP with client certificates.',
    state: 'console-only',
    command: 'docker context create --docker "host=tcp://…,ca=…,cert=…,key=…"',
    reason:
      'Creating one needs CA, certificate and key files readable by the machine running the server, which the operator cannot see when it runs on a remote host. A TCP+TLS context created elsewhere is listed, selectable and usable on the Contexts screen like any other.',
  },
  {
    id: 'plugins',
    name: 'Plugins',
    summary:
      "The CLI plugins of the local installation and the daemon's managed plugins, with install once its privileges are granted, enable, disable, inspect and remove.",
    state: 'dedicated-screen',
    screenId: 'plugins',
  },
  {
    id: 'system-prune',
    name: 'Disk usage and prune',
    summary: 'What each category of reclaimable space holds, with a per-category prune and a scoped system prune.',
    state: 'dedicated-screen',
    screenId: 'system-prune',
  },
  {
    id: 'raw-console',
    name: 'Raw CLI and Engine API',
    summary:
      'Any docker command and any Engine API call against the active context, with streamed output, cancellation, history and the same destructive confirmation as the rest of the application.',
    state: 'dedicated-screen',
    screenId: 'raw-console',
  },
  {
    id: 'vulnerability-scanning',
    name: 'Vulnerability scanning (Docker Scout)',
    summary: 'CVE analysis, policy evaluation and SBOM extraction of an image.',
    state: 'console-only',
    command: 'docker scout cves · docker sbom',
    reason:
      'Scout is a separate Docker product with its own account, its own data and its own release cycle; this application models the daemon, not Scout, and never presented itself as doing otherwise.',
  },
  {
    id: 'long-tail-commands',
    name: 'Long-tail and experimental commands',
    summary: 'Multi-architecture manifests, content trust, checkpoints and filtered event queries.',
    state: 'console-only',
    command: 'docker manifest · docker trust · docker checkpoint · docker events --filter',
    reason:
      'Command groups that are rarely used or still experimental have no dedicated surface; the console runs them in full, with their output as the CLI prints it.',
  },
  {
    id: 'docker-desktop',
    name: 'Docker Desktop application settings',
    summary: 'Resource allocation, file sharing and update settings of the Docker Desktop application.',
    state: 'not-applicable',
    reason:
      "This application manages a Docker daemon over the Engine API and the docker CLI. Docker Desktop's own settings belong to that application, not to the daemon, and are reachable from neither channel.",
  },
  {
    id: 'project-scaffolding',
    name: 'Project scaffolding',
    summary: 'Generating a Dockerfile and a compose file for a source tree.',
    state: 'not-applicable',
    reason:
      "docker init asks questions and writes files into a working directory on the machine it runs on. It belongs to the developer's own terminal, next to their sources, and produces nothing a daemon manager could act on.",
  },
];

export interface CoverageCounts {
  total: number;
  dedicatedScreen: number;
  consoleOnly: number;
  notApplicable: number;
}

export function countCoverage(areas: CoverageArea[]): CoverageCounts {
  return {
    total: areas.length,
    dedicatedScreen: areas.filter((area) => area.state === 'dedicated-screen').length,
    consoleOnly: areas.filter((area) => area.state === 'console-only').length,
    notApplicable: areas.filter((area) => area.state === 'not-applicable').length,
  };
}
