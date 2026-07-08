import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  defineVerb,
  toOpenRpcMethod,
  toOpenRpcDocument,
  toMcpTool,
  toOpenApiOperation,
  type JsonSchemaVerbSpec,
} from "@bounded-systems/verbspec";

// A JSON-Schema-first verb (no Zod) — the seam for non-Zod contract sources
// (e.g. a Cap'n Proto schema projected to JSON Schema).
const showVerb: JsonSchemaVerbSpec = {
  id: "Scout.repo",
  summary: "Read a repo through the scout door.",
  actor: "scout-read",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" }, ref: { type: "string" } },
    required: ["url"],
  },
  outputSchema: {
    type: "object",
    properties: { owner: { type: "string" }, repo: { type: "string" } },
  },
};

describe("JsonSchemaVerbSpec (non-Zod projection seam)", () => {
  test("projects to an OpenRPC method using the supplied schemas verbatim", () => {
    const m = toOpenRpcMethod(showVerb) as {
      name: string;
      summary: string;
      "x-prx-actor": string;
      params: { name: string; schema: unknown }[];
      result: { schema: unknown };
    };
    expect(m.name).toBe("Scout.repo");
    expect(m.summary).toBe(showVerb.summary);
    expect(m["x-prx-actor"]).toBe("scout-read");
    // params come straight from inputSchema.properties (no Zod round-trip).
    expect(m.params.map((p) => p.name).sort()).toEqual(["ref", "url"]);
    expect(m.result.schema).toEqual(showVerb.outputSchema);
  });

  test("projects to an MCP tool with the supplied input schema", () => {
    const t = toMcpTool(showVerb);
    expect(t.name).toBe("Scout.repo");
    expect(t.inputSchema).toEqual(showVerb.inputSchema);
  });

  test("projects to an OpenAPI operation", () => {
    const op = toOpenApiOperation(showVerb) as { operationId: string; "x-prx-actor": string };
    expect(op.operationId).toBe("Scout.repo");
    expect(op["x-prx-actor"]).toBe("scout-read");
  });

  test("a mixed registry (Zod verb + JSON-Schema verb) projects to one OpenRPC doc", () => {
    const zodVerb = defineVerb({
      id: "ping",
      summary: "ping",
      actor: "work",
      input: z.object({ n: z.number() }),
      output: z.object({ ok: z.boolean() }),
      run: () => ({ ok: true }),
    });
    const doc = toOpenRpcDocument(
      { ping: zodVerb, "Scout.repo": showVerb },
      { title: "mixed", version: "0.1.0" },
    ) as { openrpc: string; methods: { name: string }[] };
    expect(doc.openrpc).toBe("1.3.2");
    expect(doc.methods.map((m) => m.name).sort()).toEqual(["Scout.repo", "ping"]);
  });
});
