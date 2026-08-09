# coverage — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Coverage map | configuration | `client/src/coverage/coverage-map.ts` | The declaration of what the product covers of Docker: one entry per capability area with its coverage state, the screen covering it or the console command reaching it, and the reason for every gap | `specs/coverage-map.md` |
| useCoverage | frontend hook | `client/src/data/use-coverage.ts` | Joins the coverage map with the declared Docker baseline read from the server, re-reading the baseline on every context switch | `specs/use-coverage.md` |
| CoverageMatrixScreen | UI component | `client/src/coverage/CoverageMatrixScreen.tsx` | The Coverage matrix screen: the declared baseline next to the connected daemon with the mismatch made visible, and every capability area with its coverage state and the way to reach it | `specs/coverage-matrix-screen.md` |
