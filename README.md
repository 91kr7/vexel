# Vexel

A self-hosted web interface for managing a Docker daemon — containers, images and layers,
volumes and networks, Compose projects, Swarm, registries, builders and build cache, contexts,
plugins, system pruning and a raw console.

Vexel talks to the Docker Engine API over the socket of the active Docker context, so it
manages whichever daemon your CLI is pointed at, local or remote.

## Requirements

- Node.js 22 or later
- A reachable Docker daemon

## Running it

```bash
npm install
npm start
```

`npm start` builds the interface, builds the server, then runs the single process that serves
both the interface and the API on <http://localhost:3000> (set `PORT` to move it). There is
nothing else to start.

Other workspace scripts, all run from the repository root:

| Command             | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `npm run serve`     | Runs an already-built application, without rebuilding it          |
| `npm run build`     | Builds client and server                                          |
| `npm run lint`      | Lints the client                                                  |
| `npm run test`      | Runs the server and client suites                                 |

### Developing

For working on Vexel itself there is a second arrangement — two processes with hot reload,
`npm run dev:server` (Express on 3000) and `npm run dev:client` (Vite on 5173, proxying `/api`).
It is for manual development only; it is not how the product is run.

The tests exercise a **real Docker daemon**. They create and destroy their own labelled
fixtures and never assert on daemon-wide totals, but they are not a sandbox — read the testing
rules in [CLAUDE.md](CLAUDE.md) before running them against a machine you care about.

## Licensing

Vexel is free software under the **GNU Affero General Public License, version 3**
(`AGPL-3.0-only`), supplemented by additional terms permitted under section 7 of that license.

- Full license text: [`LICENSE`](LICENSE)
- Additional terms: [`LICENSE-ADDITIONAL-TERMS.md`](LICENSE-ADDITIONAL-TERMS.md)
- Attribution notice: [`NOTICE`](NOTICE)

**What you may do.** Anything, including commercially: run it, study it, modify it, host it
for others, redistribute it, fork it.

**What is asked in return.** Three things, and they are the whole point of the license:

1. **Share alike, including over a network.** If you distribute Vexel or a modified version —
   or merely let other people use your modified version *as a network service* — you must make
   the complete corresponding source of that version available to them under the AGPL. Section
   13 is what closes the hosted-service loophole; an ordinary GPL would not.
2. **Keep the attribution.** The copyright notice, the license and a link to the source must
   stay visible in the running interface, in `NOTICE`, and in the source headers. Add your own
   notices next to it, don't replace it.
3. **Name your fork something else.** The AGPL grants copyright permission, not trademark
   permission. "Vexel" is the name of this project; a fork needs its own.

**If the AGPL does not work for you.** The copyright holder is not bound by it and can grant
a separate commercial license — for embedding Vexel in a closed-source product, for instance.
Ask: marianikry@gmail.com.

Copyright (C) 2026 Christian Mariani. Provided without warranty of any kind. Vexel can stop
containers, delete volumes and remove images; point it at infrastructure you are willing to
lose.
