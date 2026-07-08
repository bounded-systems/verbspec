---
bump: minor
---
Add `JsonSchemaVerbSpec` — a JSON-Schema-first verb (no Zod) that the OpenRPC/MCP/OpenAPI projectors accept, so non-Zod contract sources (e.g. a Cap'n Proto schema) can be projected through the same pipeline. Projection-only; dispatch stays Zod.
