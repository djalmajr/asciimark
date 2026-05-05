import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { filterCommands, type Command, type CommandGroup } from "../command-palette.ts";

const groupArb = fc.constantFrom<CommandGroup>("File", "View", "Theme", "Workspace", "Help");
const titleArb = fc.stringMatching(/^[A-Z][A-Za-z ]{2,30}$/);

const commandArb: fc.Arbitrary<Command> = fc.tuple(
  fc.uuid(),
  groupArb,
  titleArb,
  fc.boolean(),
).map(([id, group, title, visible]): Command => ({
  id,
  group,
  title,
  run: () => {},
  when: visible ? undefined : () => false,
}));

const catalogArb = fc.uniqueArray(commandArb, {
  selector: (c) => c.id,
  minLength: 1,
  maxLength: 30,
});

describe("filterCommands invariants (property)", () => {
  it("never returns more entries than the visible subset of the catalog", () => {
    fc.assert(
      fc.property(catalogArb, fc.string({ maxLength: 8 }), (catalog, query) => {
        const visible = catalog.filter((c) => !c.when || c.when());
        const result = filterCommands(query, catalog);
        expect(result.length).toBeLessThanOrEqual(visible.length);
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("never includes a command whose when() returned false", () => {
    fc.assert(
      fc.property(catalogArb, fc.string({ maxLength: 8 }), (catalog, query) => {
        const result = filterCommands(query, catalog);
        for (const command of result) {
          if (command.when) expect(command.when()).toBe(true);
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("(empty query) returns every visible command exactly once", () => {
    fc.assert(
      fc.property(catalogArb, (catalog) => {
        const visible = catalog.filter((c) => !c.when || c.when());
        const result = filterCommands("", catalog);
        expect(result.length).toBe(visible.length);
        const visibleIds = new Set(visible.map((c) => c.id));
        const resultIds = new Set(result.map((c) => c.id));
        expect(resultIds).toEqual(visibleIds);
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("the result has no duplicate ids", () => {
    fc.assert(
      fc.property(catalogArb, fc.string({ maxLength: 8 }), (catalog, query) => {
        const result = filterCommands(query, catalog);
        const ids = new Set(result.map((c) => c.id));
        expect(ids.size).toBe(result.length);
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("typing the full lowercased title surfaces that command", () => {
    fc.assert(
      fc.property(catalogArb, fc.nat(), (catalog, idxSeed) => {
        const visible = catalog.filter((c) => !c.when || c.when());
        if (visible.length === 0) return true;
        const target = visible[idxSeed % visible.length]!;
        const result = filterCommands(target.title.toLowerCase(), catalog);
        expect(result.map((c) => c.id)).toContain(target.id);
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("(empty query) ordering is grouped — every group is contiguous", () => {
    fc.assert(
      fc.property(catalogArb, (catalog) => {
        const result = filterCommands("", catalog);
        // For every group that appears in the result, all instances of
        // that group must form one contiguous run — no group ever shows
        // up twice with a different group between its members.
        const seen = new Set<CommandGroup>();
        let lastGroup: CommandGroup | null = null;
        for (const command of result) {
          if (command.group !== lastGroup) {
            if (seen.has(command.group)) {
              throw new Error(`Group ${command.group} appears non-contiguously`);
            }
            if (lastGroup !== null) seen.add(lastGroup);
            lastGroup = command.group;
          }
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });
});
