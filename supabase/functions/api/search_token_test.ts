import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeSearchToken } from "./_shared/validation.ts";

/**
 * PostgREST `or=` filter-injection guards.
 *
 * supabase-js `.or()` takes a raw filter string, so a search term is spliced
 * into a mini-grammar where `,` `(` `)` `:` `%` and `.` are operators. The
 * regression these tests pin is not hypothetical: the library shelf route and
 * the smart-search route both interpolated an unescaped value, which (a) made
 * ordinary titles containing `:` or `,` 500 the endpoint and (b) let a caller
 * append their own disjuncts to the filter.
 *
 * The search route has a sharper variant. There the term usually does not come
 * from the user at all -- it comes from `JSON.parse` of raw LLM output, so it is
 * untrusted input arriving by a side channel that sanitising the user's `query`
 * never touched.
 *
 * These assert the property directly rather than through a mocked PostgREST: a
 * sanitised term must contain no character that the `or=` grammar can read as
 * structure, and must still match the words the user actually typed.
 */

const GRAMMAR_CHARS = [",", "(", ")", ":", "%", "."];

/** Build the same `or=` group the routes build, for readable assertions. */
function buildOrFilter(term: string): string {
  return `title.ilike.%${term}%,author_names_first_last.ilike.%${term}%`;
}

Deno.test("search token: no grammar character survives sanitisation", () => {
  const hostile = [
    'x",library_id.eq.11111111-1111-1111-1111-111111111111',
    "x),or(id.not.is.null",
    "x):or((a.eq.1)",
    "%",
    "100%",
    "..",
    "a,b.c(d)e:f%",
  ];
  for (const input of hostile) {
    const clean = sanitizeSearchToken(input);
    for (const ch of GRAMMAR_CHARS) {
      assert(
        !clean.includes(ch),
        `sanitizeSearchToken left ${JSON.stringify(ch)} in ${
          JSON.stringify(clean)
        } (from ${JSON.stringify(input)})`,
      );
    }
  }
});

Deno.test("search token: an injected disjunct cannot escape the group", () => {
  // Pre-fix this produced, on the wire:
  //   or=(title.ilike.%x",library_id.eq.1111...%,author_names_first_last.ilike.%x",...%)
  // -- the caller's `library_id.eq.<victim>` became its own OR branch.
  const hostile = 'x",library_id.eq.11111111-1111-1111-1111-111111111111';
  const clean = sanitizeSearchToken(hostile);
  const filter = buildOrFilter(clean);

  // Count the top-level disjuncts the grammar will see. Anything other than
  // exactly one pair of outer parens means the caller added a branch.
  assertEquals(
    (filter.match(/\(/g) ?? []).length,
    0,
    `filter gained parentheses: ${filter}`,
  );
  assert(
    !filter.includes("library_id.eq"),
    `caller-injected predicate survived: ${filter}`,
  );
});

Deno.test("search token: ordinary punctuation in a real title is handled", () => {
  // The bug was reachable without any malice: this is a real book title.
  assertEquals(
    sanitizeSearchToken("Sapiens: A Brief History of Humankind, 2015"),
    "Sapiens A Brief History of Humankind 2015",
  );
  // Still searchable by the words the user typed.
  assert(sanitizeSearchToken("Sapiens: A Brief History").includes("Sapiens"));
});

Deno.test("search token: idempotent and whitespace-trimmed", () => {
  const once = sanitizeSearchToken("  Dune: Part Two, 1965  ");
  assertEquals(once, "Dune Part Two 1965");
  assertEquals(
    sanitizeSearchToken(once),
    once,
    "sanitising twice changed the value",
  );
});

Deno.test("search token: an ilike wildcard cannot be smuggled in", () => {
  // A single unescaped `%` turns `title.ilike.%%%` into match-everything, which
  // is both a wrong answer and a cheap way to pull the whole table.
  const clean = sanitizeSearchToken("%");
  assertEquals(clean, "");
  assert(!buildOrFilter(clean).includes("%%%"));
});
