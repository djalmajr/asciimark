// Deterministic outbound secret scrubbing (omp-informed, built native).
// Context preambles and file-read tool results can accidentally carry API
// keys/tokens; scrub them BEFORE they reach the provider and restore the
// originals when the model echoes a placeholder back. Deterministic: the same
// secret always maps to the same placeholder within one scrub pass, so the
// model can refer to it coherently.
//
// Placeholders are `[secret-<nonce>-N]`, where <nonce> is chosen once per
// scrub map. Without the nonce a user file that legitimately contains the
// literal "[secret-1]" would be rewritten to a REAL secret on restore, and a
// model could fabricate placeholders that happen to hit map entries.

/** Patterns for high-confidence secret shapes. Deliberately conservative —
 *  false positives redact useful context, so each pattern anchors on a
 *  well-known prefix or an explicit assignment to a secret-looking key. */
const SECRET_PATTERNS: readonly RegExp[] = [
  // Vendor-prefixed API keys (OpenAI/Anthropic/Stripe-style "sk-", GitHub
  // "ghp_"/"gho_", Slack "xox", Google "AIza").
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  // AWS access key ids.
  /\bAKIA[0-9A-Z]{16}\b/g,
  // Bearer tokens in headers/snippets.
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/g,
  // PEM private key blocks (multiline).
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // Explicit assignments: api_key/token/secret/password = "value".
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{12,}["']?/gi,
];

/** Reserved map key holding the session nonce. Placeholders are always
 *  bracketed `[secret-...]` strings and never contain a NUL character, so this
 *  key can never collide with a placeholder entry — the nonce can live inside
 *  the same map without changing the public API shape. */
const NONCE_KEY = "\u0000nonce";

const NONCE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const NONCE_LENGTH = 8;

/** Read the map's nonce, generating and persisting one on first use. The
 *  slight modulo bias is fine — the nonce guards against accidental collision
 *  and fabrication, not against a cryptographic attacker. */
function mapNonce(map: Map<string, string>): string {
  const existing = map.get(NONCE_KEY);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  let nonce = "";
  for (const byte of bytes) nonce += NONCE_ALPHABET[byte % NONCE_ALPHABET.length];
  map.set(NONCE_KEY, nonce);
  return nonce;
}

export interface ScrubResult {
  /** Placeholder → original secret, for {@link restoreSecrets}. */
  map: Map<string, string>;
  text: string;
}

/** Replace recognized secrets with stable `[secret-<nonce>-N]` placeholders.
 *  Pass the `map` from a previous result to keep placeholders stable across
 *  multiple scrub calls in one turn (context + several tool results). */
export function scrubSecrets(text: string, map: Map<string, string> = new Map()): ScrubResult {
  let out = text;
  // Reverse lookup so an already-seen secret reuses its placeholder; count
  // only placeholder entries so the nonce entry never skews the numbering.
  const bySecret = new Map<string, string>();
  let count = 0;
  for (const [placeholder, secret] of map) {
    if (placeholder === NONCE_KEY) continue;
    bySecret.set(secret, placeholder);
    count += 1;
  }

  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      const existing = bySecret.get(match);
      if (existing) return existing;
      count += 1;
      // Nonce derived lazily, so a secret-free scrub leaves the map empty.
      const placeholder = `[secret-${mapNonce(map)}-${count}]`;
      map.set(placeholder, match);
      bySecret.set(match, placeholder);
      return placeholder;
    });
  }
  return { map, text: out };
}

/** Put the original secrets back into model output before display, so the
 *  user sees real values while the provider only ever saw placeholders.
 *  Entries are keyed by their FULL placeholder string, so legacy `[secret-N]`
 *  entries present in a map restore exactly like nonce-format ones. */
export function restoreSecrets(text: string, map: Map<string, string>): string {
  let out = text;
  for (const [placeholder, secret] of map) {
    if (placeholder === NONCE_KEY) continue;
    out = out.split(placeholder).join(secret);
  }
  return out;
}

/** Replace every placeholder-shaped token still present after a restore pass
 *  (legacy `[secret-N]` and nonce `[secret-<nonce>-N]`) with `label`. For
 *  DISPLAY paths only: rehydrated chats can reference a map from a previous
 *  session, and showing the raw placeholder would read like a real value.
 *  Tool-args restore must NOT use this — there a stale placeholder has to
 *  keep failing its find-match (fail-safe), not silently morph. */
export function replaceUnrestoredPlaceholders(text: string, label: string): string {
  // Lower bound 6 keeps leniency toward shorter historical nonces; the upper
  // bound tracks NONCE_LENGTH so a future bump can't silently stop matching.
  const pattern = new RegExp(`\\[secret-(?:[a-z0-9]{6,${NONCE_LENGTH}}-)?\\d+\\]`, "g");
  return text.replace(pattern, label);
}
