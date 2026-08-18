# @bounded-systems/verbspec

Spec-driven CLI core — author a verb once, project it everywhere.

A verb's input and output are Zod schemas. JSON Schema (`z.toJSONSchema`) is the
projection IR, and every surface is a pure projection of the one spec: the CLI
parser and `--help`, the MCP tool, the Anthropic tool-use schema, and the
OpenAPI operation. There is no codegen and no build step — the schema is the
single source of truth, so the surfaces can't drift.

```
VerbSpec (Zod — canonical, runtime + static)
  └─ z.toJSONSchema ──▶ JSON Schema (the interchange IR)
        ├─ toHelp / parseArgs   ──▶ argv → typed input, `--help`
        ├─ toMcpTool            ──▶ { name, description, inputSchema }
        ├─ toAnthropicTool      ──▶ { name, description, input_schema }
        └─ toOpenApiOperation   ──▶ POST /{id} (request/response schemas)
```

## Install

```sh
npm install @bounded-systems/verbspec zod
```

`zod` is a peer dependency (`^3.25 || ^4`).

## Usage

```ts
import { z } from "zod";
import {
  defineVerb,
  parseArgs,
  dispatch,
  toMcpTool,
  toAnthropicTool,
  toOpenApiOperation,
  render,
} from "@bounded-systems/verbspec";

// Author the verb once.
const greet = defineVerb({
  id: "greet",
  summary: "Greet someone by name",
  actor: "work",
  positionals: ["name"],
  input: z.object({ name: z.string(), loud: z.boolean().default(false) }),
  output: z.object({ message: z.string() }),
  run: ({ name, loud }) => ({ message: loud ? `HELLO ${name}!` : `hello ${name}` }),
});

// CLI: argv → validated input → run → printed result.
const result = await dispatch({ greet }, ["greet", "Ada", "--loud"]);
if (result.kind === "ok") console.log(render(result.output)); // { "message": "HELLO Ada!" }

// MCP / Anthropic / OpenAPI: the same schema, seen from other sides.
toMcpTool(greet); //        { name, description, inputSchema }
toAnthropicTool(greet); //  { name, description, input_schema }
toOpenApiOperation(greet); // POST /greet
```

`parseArgs` carries the CLI-isms (positionals, boolean flags, repeated and
comma-split array values); the Zod `parse` is the only validation. The
MCP/OpenAPI/Anthropic projections take structured JSON and consume only
`input`/`output` — never the CLI-only `render`/`exitCode`/`warnings` hooks.

### `positionals` vs. input fields

`input` declares every field a verb accepts. `positionals` only *selects* which
of those fields are read as bare arguments instead of `--flags`, in order — it
never declares a field on its own:

```ts
positionals: ["name"],
input: z.object({ name: z.string(), loud: z.boolean().default(false) }),
// `greet Ada --loud`   →  name from the positional, loud from the flag
```

Two consequences, both enforced rather than silently absorbed:

- **A field not listed in `positionals` is flag-only.** Declaring
  `slug: z.string().optional()` with `positionals: []` means `myverb somevalue`
  is an error, not a filter — pass `--slug somevalue`. Bare arguments are never
  auto-bound to a leftover field, because a mis-bound argument that "works"
  silently is how a scoped command becomes an unscoped one.
- **A name in `positionals` that no input field declares is a spec error.** It
  would bind a value that `input.parse` then strips as an unknown key, so
  `parseArgs` rejects the spec instead.

More generally: any argument that maps to nothing the verb declares — an unknown
flag, an extra positional, or a positional naming no field — throws. Nothing
falls through to a default.

### Boolean flags and `--no-`

Every boolean input gets both spellings: `--loud` sets it true, `--no-loud` sets
it false. So a boolean that is *on by default* can be turned off from the command
line with the one field that declares it:

```ts
input: z.object({ changedOnly: z.boolean().default(true) }),
// `check`                     →  changedOnly: true   (the default)
// `check --no-changedOnly`    →  changedOnly: false
```

- **The negation is a derived CLI name, not an input field.** `no-changedOnly` is
  not a key of `input`, so it is not selectable as a positional —
  `positionals: ["no-changedOnly"]` remains a spec error. An input field that
  would shadow a generated negation (a boolean `loud` beside a field literally
  named `no-loud`) is a spec error too, rather than a flag that quietly means
  only one of the two things.
- **It takes no value and consumes no token.** `--no-loud=false` is rejected, and
  `myverb --no-loud alice` reads `alice` as a positional, not as the flag's value.
- **Booleans stay scalar.** `--loud --no-loud` is last-wins, the same rule every
  other scalar flag follows.
- **Both defaults get one.** `--no-` is generated for every boolean, not only the
  `default(true)` ones — which spelling an author needs follows from the default,
  and a default is a value the verb may change. Generating it conditionally would
  mean flipping a default silently deletes a flag from every script using it.

## Design

- **One spec, four surfaces.** The CLI, MCP server, Anthropic tool schema, and
  OpenAPI operation are pure projections of a single `VerbSpec`, so help text,
  arg parsing, validation, and tool schemas can't drift.
- **Zod-canonical.** Runtime validation *and* static types from one definition;
  `z.toJSONSchema` is the interchange IR. No codegen, no FFI, no build step to
  author a verb.
- **Self-contained.** The only production dependency is the `zod` peer dep. An
  extractability test enforces outward-only imports and no ambient authority (no
  shelling out, no `process.env`).

## License

[MIT](./LICENSE) © Bounded Systems
