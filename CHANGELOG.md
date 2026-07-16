# @bounded-systems/verbspec

## 0.4.0 — 2026-07-16

### Minor

- Add `JsonSchemaVerbSpec` — a JSON-Schema-first verb (no Zod) that the OpenRPC/MCP/OpenAPI projectors accept, so non-Zod contract sources (e.g. a Cap'n Proto schema) can be projected through the same pipeline. Projection-only; dispatch stays Zod.
- `parseArgs` now rejects CLI args that map to nothing the verb declares — unknown `--flags` (not in the input schema) and extra positionals (beyond the declared `positionals`; a trailing variadic still absorbs the rest) — instead of silently dropping them. **Behavior break:** invocations that previously passed unrecognized flags or stray positionals now throw, naming the offending token. This closes a class of footgun where a dropped arg silently reverted a verb to its schema defaults.

## 0.3.0

### Minor Changes

- c900245: Add OpenRPC and JSON-RPC/NDJSON projections to `@bounded-systems/verbspec`.

  A verb registry can now be projected to an OpenRPC document (`toOpenRpcMethod` / `toOpenRpcDocument` — the JSON-RPC analogue of the existing OpenAPI projection) and served over a line-delimited JSON-RPC 2.0 transport (`handleJsonRpc` / `dispatchNdjson`). This lets daemon-shaped libraries expose the same verbs they author once — params validated against the verb's Zod input, results derived from its output schema — with no drift between the protocol, its OpenRPC description, and the client types.

## 0.2.0

### Minor Changes

- c98caf6: Extract the spec-driven CLI core into a standalone `@bounded-systems/verbspec` package.

  `VerbSpec`, `defineVerb`, `parseArgs`, `dispatch`, and the MCP / OpenAPI / Anthropic / CLI projections move out of `packages/prx/src/cli/verbspec.ts` (now `@bounded-systems/verbspec`, a `zod`-peer-dependency library) so the `@bounded-systems` libraries can author a verb once and share every surface projection. prx's change is internal-only: all verb authoring now imports the new package; no CLI/MCP/OpenAPI behavior changes.

- 5ee5646: Make `@bounded-systems/verbspec` publish-ready as a standalone package.

  Drop `private`, add the publish metadata (MIT license, repository/homepage/bugs, keywords, `files`, `publishConfig`), a dist build (`tsconfig.build.json` + `build`/`prepublishOnly` scripts; `exports` resolve `bun`→src and `types`/`import`→dist), a README and LICENSE, and an extractability test guarding outward-only imports and no ambient authority. `toHelp` and `dispatch` take an optional `bin` argument (defaults to `"prx"`) so the CLI projection is no longer hardcoded to the prx binary name; existing callers are unaffected.
