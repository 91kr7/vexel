# list-order — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| List order | backend module | `server/src/list-order/list-order.ts` | The one comparison rule every list of named objects is ordered by: a fixed-locale, case- and diacritic-insensitive, numeric-aware name comparison, the exact identity comparison that makes it total, and the two comparator builders that compose them | `specs/list-order.md` |
| List order conformance check | build check | `server/scripts/check-list-order-conformance.mjs` | Build-time guard that no ordering is written under `server/src/` outside the ordering area, with a named allow-list for the orderings whose result carries meaning | `specs/list-order-conformance-check.md` |
