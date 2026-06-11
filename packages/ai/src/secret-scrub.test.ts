import { describe, expect, it } from "bun:test";
import { restoreSecrets, scrubSecrets } from "./secret-scrub.ts";

describe("scrubSecrets", () => {
  it("scrubs vendor-prefixed keys and restores them", () => {
    const input = "use key sk-w7a4JDfGvnZklepfHyg1unjtehDPpY0b in the header";
    const { map, text } = scrubSecrets(input);
    expect(text).toBe("use key [secret-1] in the header");
    expect(restoreSecrets(text, map)).toBe(input);
  });

  it("is deterministic: the same secret reuses its placeholder across calls", () => {
    const { map, text: first } = scrubSecrets("a sk-aaaaaaaaaaaaaaaaaaaa b");
    const { text: second } = scrubSecrets("again sk-aaaaaaaaaaaaaaaaaaaa", map);
    expect(first).toContain("[secret-1]");
    expect(second).toContain("[secret-1]");
    expect(map.size).toBe(1);
  });

  it("numbers distinct secrets independently", () => {
    const { map, text } = scrubSecrets(
      "k1=sk-aaaaaaaaaaaaaaaaaaaa k2=ghp_bbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(map.size).toBe(2);
    expect(text).toContain("[secret-1]");
    expect(text).toContain("[secret-2]");
  });

  it("scrubs Bearer tokens, AWS ids and PEM blocks", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----";
    const input = `Authorization: Bearer abcdef1234567890XYZ\nAKIAABCDEFGHIJKLMNOP\n${pem}`;
    const { map, text } = scrubSecrets(input);
    expect(map.size).toBe(3);
    expect(text).not.toContain("Bearer abcdef");
    expect(text).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(text).not.toContain("BEGIN PRIVATE KEY");
    expect(restoreSecrets(text, map)).toBe(input);
  });

  it("scrubs explicit secret assignments but leaves ordinary prose alone", () => {
    const { map, text } = scrubSecrets(
      'config: api_key = "abc123def456ghi789" — markdown is a markup language',
    );
    expect(map.size).toBe(1);
    expect(text).toContain("markdown is a markup language");
    expect(text).not.toContain("abc123def456ghi789");
  });

  it("leaves secret-free text untouched (no map entries)", () => {
    const input = "# Notes\nJust regular markdown with code `let x = 1`.";
    const { map, text } = scrubSecrets(input);
    expect(text).toBe(input);
    expect(map.size).toBe(0);
  });
});
