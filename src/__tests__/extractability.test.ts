import { test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertSeam } from "@bounded-systems/seam-check";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// verbspec is a pure spec leaf: it depends only on zod (the single VerbSpec
// projected to CLI/MCP/tool-schema/OpenAPI). The harness proves that edge and
// that prod files hold no ambient authority.
test("@bounded-systems/verbspec upholds its seam claim", () => {
  assertSeam({
    root: SRC,
    prod: ["zod"],
    test: ["@bounded-systems/verbspec", "@bounded-systems/seam-check"],
  });
});
