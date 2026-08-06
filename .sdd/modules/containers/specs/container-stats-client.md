---
module: containers
component: Container stats client
type: frontend data client
---

# Container stats client

**Purpose** → the typed client-side description of a container's live statistics and of its process
listing: their shapes, the stream URL and the listing call.

## Contract

- `ContainerStatsSample = { at: string, cpuPercent: number, memoryUsageBytes: number,
  memoryLimitBytes: number, memoryPercent: number, networkRxBytes: number, networkTxBytes: number,
  blockReadBytes: number, blockWriteBytes: number, pids: number }`
- `ContainerProcess = { pid: number, user: string, command: string, cpuPercent?: number,
  memoryPercent?: number }`
- `ContainerProcessList = { titles: string[], processes: ContainerProcess[] }`
- `containerStatsStreamUrl(id) → string` — the `/api/containers/<id>/stats/stream` URL.
- `fetchContainerProcesses(id) → Promise<ContainerProcessList>`
  - rejects with the server's `error` message when the request fails, or with the HTTP status when
    the failure carries no message.

## Requirements served

- plan-docker_management_app/REQ-32
- plan-docker_management_app/REQ-33
