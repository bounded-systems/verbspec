import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  defineVerb,
  dispatch,
  parseArgs,
  toHelp,
  toMcpTool,
  toOpenApiPaths,
} from "@bounded-systems/verbspec";

// parseArgs CLI-isms for array-typed input fields: repeated flags accumulate,
// comma-separated values split, and the two forms compose. Scalars take the
// last value. (The Zod schema stays free of CLI quirks; this is the projection.)

const verb = defineVerb({
  id: "args-probe",
  summary: "test-only verb for parseArgs array handling",
  actor: "work",
  input: z.object({
    allow: z.array(z.string()).default([]),
    name: z.string().optional(),
    n: z.coerce.number().default(0),
  }),
  output: z.object({}),
  run: () => ({}),
});

const allow = (argv: string[]) => (parseArgs(verb, argv) as { allow: string[] }).allow;

describe("parseArgs array flags", () => {
  test("repeated flags accumulate", () => {
    expect(allow(["--allow", "a", "--allow", "b"])).toEqual(["a", "b"]);
  });

  test("comma-separated values split", () => {
    expect(allow(["--allow", "a,b,c"])).toEqual(["a", "b", "c"]);
  });

  test("repeated and comma forms compose", () => {
    expect(allow(["--allow", "a,b", "--allow", "c"])).toEqual(["a", "b", "c"]);
  });

  test("--k=v form accumulates too", () => {
    expect(allow(["--allow=a", "--allow=b,c"])).toEqual(["a", "b", "c"]);
  });

  test("empty when the flag is absent (schema default)", () => {
    expect(allow([])).toEqual([]);
  });

  test("scalars still take the last value; arrays don't leak into them", () => {
    const out = parseArgs(verb, ["--name", "x", "--name", "y", "--n", "3"]) as {
      name: string;
      n: number;
    };
    expect(out.name).toBe("y");
    expect(out.n).toBe(3);
  });
});

// A variadic (array-typed) positional collects every positional value, merged
// with same-name flag occurrences — `cmd resolve a b --id c`-style verbs.
const variadic = defineVerb({
  id: "variadic-probe",
  summary: "test-only verb with a variadic positional",
  actor: "work",
  positionals: ["ids"],
  input: z.object({ ids: z.array(z.string()).default([]) }),
  output: z.object({}),
  run: () => ({}),
});

const ids = (argv: string[]) => (parseArgs(variadic, argv) as { ids: string[] }).ids;

describe("parseArgs variadic positionals", () => {
  test("collects all positional values", () => {
    expect(ids(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("merges positionals ahead of same-name flag occurrences", () => {
    expect(ids(["a", "b", "--ids", "c"])).toEqual(["a", "b", "c"]);
  });

  test("flag-only still works", () => {
    expect(ids(["--ids", "a", "--ids", "b"])).toEqual(["a", "b"]);
  });

  test("comma-splits positional values too", () => {
    expect(ids(["a,b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("empty when nothing is given", () => {
    expect(ids([])).toEqual([]);
  });
});

// Strict mapping: an arg that maps to nothing the verb declares is an error, not
// a silent no-op. This exists because `spd deploy on_hand_location_freshness` —
// where the filter is a `--slug` flag, not a positional, and the verb declares
// `positionals: []` — silently dropped the token and deployed EVERY card to live
// Metabase. An unmapped arg must halt, not fall through to a default.
const flagVerb = defineVerb({
  id: "flag-probe",
  summary: "test-only verb: one optional flag, no positionals",
  actor: "work",
  positionals: [],
  input: z.object({ slug: z.string().optional(), dryRun: z.boolean().default(false) }),
  output: z.object({}),
  run: () => ({}),
});

const scalarPos = defineVerb({
  id: "scalar-pos-probe",
  summary: "test-only verb with a single scalar positional",
  actor: "work",
  positionals: ["name"],
  input: z.object({ name: z.string(), verbose: z.boolean().default(false) }),
  output: z.object({}),
  run: () => ({}),
});

describe("parseArgs strict mapping — extra positionals", () => {
  test("a verb with no positionals rejects a bare arg (the deploy footgun)", () => {
    expect(() => parseArgs(flagVerb, ["on_hand_location_freshness"])).toThrow(
      /unexpected positional|unexpected argument/i,
    );
  });

  test("the rejection names the offending token", () => {
    expect(() => parseArgs(flagVerb, ["on_hand_location_freshness"])).toThrow(
      /on_hand_location_freshness/,
    );
  });

  test("more positionals than declared is rejected", () => {
    expect(() => parseArgs(scalarPos, ["alice", "bob"])).toThrow(/unexpected/i);
  });

  test("exactly the declared positionals is accepted", () => {
    expect(parseArgs(scalarPos, ["alice"])).toMatchObject({ name: "alice" });
  });

  test("a variadic positional still absorbs any number of args", () => {
    expect(() => parseArgs(variadic, ["a", "b", "c", "d"])).not.toThrow();
  });
});

// The other half of strict mapping: `positionals` names INPUT FIELDS, it does not
// declare them. A name with no matching input field binds a value that `input.parse`
// then strips as an unknown key, so the token vanishes with no error — the same
// silent-drop footgun as an unmapped flag, just reached through a typo'd spec.
const typoPos = defineVerb({
  id: "typo-pos-probe",
  summary: "test-only verb whose positional names no input field",
  actor: "work",
  positionals: ["slugg"], // typo: the input field is `slug`
  input: z.object({ slug: z.string().optional() }),
  output: z.object({}),
  run: () => ({}),
});

describe("parseArgs strict mapping — undeclared positional names", () => {
  test("a positional naming no input field is rejected, not silently dropped", () => {
    expect(() => parseArgs(typoPos, ["somevalue"])).toThrow(
      /positional|undeclared|unknown/i,
    );
  });

  test("the rejection names the offending positional", () => {
    expect(() => parseArgs(typoPos, ["somevalue"])).toThrow(/slugg/);
  });

  test("it is rejected even when no positional value is supplied", () => {
    expect(() => parseArgs(typoPos, [])).toThrow(/slugg/);
  });

  test("a positional that does name an input field is unaffected", () => {
    expect(parseArgs(scalarPos, ["alice"])).toMatchObject({ name: "alice" });
  });
});

describe("parseArgs strict mapping — unknown flags", () => {
  test("an unknown --flag is rejected, not silently stripped", () => {
    expect(() => parseArgs(flagVerb, ["--slog", "x"])).toThrow(/unknown flag|unrecognized/i);
  });

  test("the rejection names the offending flag", () => {
    expect(() => parseArgs(flagVerb, ["--slog", "x"])).toThrow(/slog/);
  });

  test("an unknown --flag=value form is also rejected", () => {
    expect(() => parseArgs(flagVerb, ["--slog=x"])).toThrow(/unknown flag|unrecognized/i);
  });

  test("an unknown boolean --flag is also rejected", () => {
    expect(() => parseArgs(flagVerb, ["--force"])).toThrow(/unknown flag|unrecognized/i);
  });

  test("declared flags are accepted", () => {
    expect(parseArgs(flagVerb, ["--slug", "abc", "--dryRun"])).toMatchObject({
      slug: "abc",
      dryRun: true,
    });
  });

  test("a verb with no fields rejects any flag", () => {
    const noFields = defineVerb({
      id: "no-fields-probe",
      summary: "test-only verb with no input fields",
      actor: "work",
      input: z.object({}),
      output: z.object({}),
      run: () => ({}),
    });
    expect(() => parseArgs(noFields, ["--anything"])).toThrow(/unknown flag|unrecognized/i);
  });
});

describe("dispatch surfaces strict-mapping errors", () => {
  test("an extra positional through dispatch throws", async () => {
    await expect(dispatch({ "flag-probe": flagVerb }, ["flag-probe", "stray"])).rejects.toThrow(
      /unexpected/i,
    );
  });

  test("an unknown flag through dispatch throws", async () => {
    await expect(
      dispatch({ "flag-probe": flagVerb }, ["flag-probe", "--slog", "x"]),
    ).rejects.toThrow(/unknown flag|unrecognized/i);
  });

  test("a correct invocation through dispatch still works", async () => {
    const out = await dispatch({ "flag-probe": flagVerb }, ["flag-probe", "--slug", "abc"]);
    expect(out).toMatchObject({ kind: "ok", input: { slug: "abc" } });
  });
});

const searchNotes = defineVerb({
  id: "search recent notes",
  summary: "Search recent notes",
  actor: "read",
  input: z.object({
    q: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  output: z.object({
    data: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
      }),
    ),
  }),
  run: () => ({ data: [] }),
});

describe("multi-word verb projection", () => {
  test("projects a typed search verb to an MCP tool", () => {
    const tool = toMcpTool(searchNotes);

    expect(tool.name).toBe("search_recent_notes");
    expect(tool.description).toBe("Search recent notes");
    expect(tool.inputSchema).toHaveProperty("properties");
  });

  test("projects a typed search verb to an OpenAPI operation", () => {
    const paths = toOpenApiPaths({ [searchNotes.id]: searchNotes }) as Record<string, any>;
    const operation = paths["/search/recent/notes"]?.post;

    expect(operation.operationId).toBe("search_recent_notes");
    expect(operation.summary).toBe("Search recent notes");
    expect(operation.requestBody.content["application/json"].schema).toHaveProperty("properties");
    expect(operation.responses["200"].content["application/json"].schema).toHaveProperty("properties");
  });
});

describe("dispatch multi-word ids", () => {
  const planSession = defineVerb({
    id: "plan session",
    summary: "open a plan session",
    actor: "work",
    positionals: ["name"],
    input: z.object({ name: z.string() }),
    output: z.object({ name: z.string() }),
    run: ({ name }) => ({ name }),
  });

  const plan = defineVerb({
    id: "plan",
    summary: "short plan verb",
    actor: "work",
    input: z.object({ session: z.string().optional() }),
    output: z.object({ kind: z.string() }),
    run: () => ({ kind: "plan" }),
  });

  test("resolves a space-separated argv prefix as one verb id", async () => {
    const out = await dispatch({ "plan session": planSession }, ["plan", "session", "alpha"]);
    expect(out).toMatchObject({
      kind: "ok",
      id: "plan session",
      input: { name: "alpha" },
      output: { name: "alpha" },
    });
  });

  test("prefers the longest matching verb id", async () => {
    const out = await dispatch({ plan, "plan session": planSession }, ["plan", "session", "beta"]);
    expect(out).toMatchObject({
      kind: "ok",
      id: "plan session",
      input: { name: "beta" },
    });
  });

  test("keeps exact one-token ids working", async () => {
    const out = await dispatch({ plan, "plan session": planSession }, ["plan"]);
    expect(out).toMatchObject({ kind: "ok", id: "plan", output: { kind: "plan" } });
  });
});

// ── boolean negation (#12) ───────────────────────────────────────────────────
// `z.boolean().default(true)` had no way to be turned OFF from the CLI: only
// presence-is-true worked, so "on by default, opt out on the CLI" forced authors
// to declare a SECOND override flag and compute the effective value by hand —
// two flags for one boolean dimension. `--no-<field>` is that missing spelling.
const negVerb = defineVerb({
  id: "neg-probe",
  summary: "test-only verb with a default-true boolean",
  actor: "work",
  positionals: [],
  input: z.object({
    changedOnly: z.boolean().default(true),
    dryRun: z.boolean().default(false),
    slug: z.string().optional(),
  }),
  output: z.object({}),
  run: () => ({}),
});

const negPos = defineVerb({
  id: "neg-pos-probe",
  summary: "test-only verb with a positional beside a boolean",
  actor: "work",
  positionals: ["name"],
  input: z.object({ name: z.string(), loud: z.boolean().default(true) }),
  output: z.object({}),
  run: () => ({}),
});

describe("parseArgs boolean negation", () => {
  test("--no-<field> turns a default(true) boolean off", () => {
    expect(parseArgs(negVerb, ["--no-changedOnly"])).toMatchObject({ changedOnly: false });
  });

  test("the default still applies when the negation is absent", () => {
    expect(parseArgs(negVerb, [])).toMatchObject({ changedOnly: true });
  });

  test("every boolean gets one, not only the default(true) ones", () => {
    expect(parseArgs(negVerb, ["--dryRun", "--no-dryRun"])).toMatchObject({ dryRun: false });
  });

  test("a boolean stays scalar — the last spelling wins in either order", () => {
    expect(parseArgs(negVerb, ["--no-changedOnly", "--changedOnly"])).toMatchObject({
      changedOnly: true,
    });
    expect(parseArgs(negVerb, ["--changedOnly", "--no-changedOnly"])).toMatchObject({
      changedOnly: false,
    });
  });

  test("the negation carries its own value — it never eats the next token", () => {
    expect(parseArgs(negVerb, ["--no-changedOnly", "--slug", "abc"])).toMatchObject({
      changedOnly: false,
      slug: "abc",
    });
    // The sharper case: a bare token after the negation is still a positional,
    // not the flag's value.
    expect(parseArgs(negPos, ["--no-loud", "alice"])).toMatchObject({
      name: "alice",
      loud: false,
    });
  });

  test("--no-<field>=value is rejected rather than silently ignored", () => {
    expect(() => parseArgs(negVerb, ["--no-changedOnly=false"])).toThrow(/takes no value/i);
  });

  test("only booleans get a negation — --no-<string field> is an unknown flag", () => {
    expect(() => parseArgs(negVerb, ["--no-slug", "x"])).toThrow(/unknown flag|unrecognized/i);
  });

  test("the negation of an undeclared field is an unknown flag", () => {
    expect(() => parseArgs(negVerb, ["--no-bogus"])).toThrow(/unknown flag|unrecognized/i);
  });

  test("the unknown-flag message lists the negations among the valid flags", () => {
    expect(() => parseArgs(negVerb, ["--nope"])).toThrow(/--no-changedOnly/);
  });

  test("a negation reaches the same field through dispatch", async () => {
    const out = await dispatch({ "neg-probe": negVerb }, ["neg-probe", "--no-changedOnly"]);
    expect(out).toMatchObject({ kind: "ok", input: { changedOnly: false } });
  });
});

// The negation names are DERIVED CLI spellings, not input fields. Widening the
// one set that gated both questions would have made `positionals: ["no-loud"]`
// legal — it binds a value `input.parse` then strips, the silent-drop this
// package exists to refuse. The two sets stay separate; these hold that line.
describe("parseArgs boolean negation — derived names are not input fields", () => {
  test("a negation name in `positionals` is still a spec error", () => {
    const negAsPositional = defineVerb({
      id: "neg-as-positional-probe",
      summary: "test-only verb naming a negation as a positional",
      actor: "work",
      positionals: ["no-loud"],
      input: z.object({ loud: z.boolean().default(true) }),
      output: z.object({}),
      run: () => ({}),
    });
    expect(() => parseArgs(negAsPositional, [])).toThrow(/no input field/i);
    expect(() => parseArgs(negAsPositional, [])).toThrow(/no-loud/);
  });

  test("an input field colliding with a generated negation is a spec error", () => {
    const collide = defineVerb({
      id: "neg-collision-probe",
      summary: "test-only verb whose field shadows a generated negation",
      actor: "work",
      input: z.object({ loud: z.boolean().default(true), "no-loud": z.string().optional() }),
      output: z.object({}),
      run: () => ({}),
    });
    expect(() => parseArgs(collide, [])).toThrow(/collides/i);
    expect(() => parseArgs(collide, [])).toThrow(/no-loud/);
  });
});

describe("toHelp boolean negation", () => {
  test("a boolean renders both spellings instead of a value placeholder", () => {
    const help = toHelp(negVerb);
    expect(help).toContain("--changedOnly / --no-changedOnly");
    expect(help).not.toContain("--changedOnly <boolean>");
  });

  test("the default is shown, since it decides which spelling is useful", () => {
    const help = toHelp(negVerb);
    expect(help).toContain("--changedOnly / --no-changedOnly (default: true)");
    expect(help).toContain("--dryRun / --no-dryRun (default: false)");
  });

  test("non-boolean flags are unchanged apart from their default", () => {
    expect(toHelp(negVerb)).toContain("--slug <string>");
  });
});

// Fallout from showing a boolean's default: `z.toJSONSchema` lists a DEFAULTED
// field in `required` (the parsed output always carries it), so the old renderer
// labelled `--limit` required — and beside a printed default that reads as a
// flat contradiction. The default is the truthful half.
describe("toHelp defaults", () => {
  test("a defaulted field is not also labelled required", () => {
    expect(toHelp(negVerb)).not.toContain("(required) (default:");
    expect(toHelp(searchNotes)).toContain("--limit <integer> (default: 20)");
  });

  test("a field with no default keeps its required marker", () => {
    expect(toHelp(searchNotes)).toContain("--q <string> (required)");
  });
});
