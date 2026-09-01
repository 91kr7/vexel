# dashboard — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| useSystemOverview | frontend hook | `client/src/data/use-system-overview.ts` | Holds the host overview behind the summary tiles and the disk-usage breakdown, reading it on mount, on a 3 s clock that runs only while the hook is mounted, on the reload signal and on a context switch | `specs/use-system-overview.md` |
| DashboardScreen | UI component | `client/src/dashboard/DashboardScreen.tsx` | The Dashboard: five summary tiles re-read on a 3 s clock while the screen is open, live container activity with state/CPU/uptime, the disk-usage breakdown with its legend, the recent daemon events (the application's one home for the stream), and navigation from any tile or row to the screen owning that object | `specs/dashboard-screen.md` |
