// Deterministic outbound secret scrubbing (omp-informed, built native).
// Context preambles and file-read tool results can accidentally carry API
// keys/tokens; scrub them BEFORE they reach the provider and restore the
// originals when the model echoes a placeholder back. Deterministic: the same
// secret always maps to the same placeholder within one scrub pass, so the
// model can refer to it coherently.

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

export interface ScrubResult {
  /** Placeholder → original secret, for {@link restoreSecrets}. */
  map: Map<string, string>;
  text: string;
}

/** Replace recognized secrets with stable `[secret-N]` placeholders. Pass the
 *  `map` from a previous result to keep placeholders stable across multiple
 *  scrub calls in one turn (context + several tool results). */
export function scrubSecrets(text: string, map: Map<string, string> = new Map()): ScrubResult {
  let out = text;
  // Reverse lookup so an already-seen secret reuses its placeholder.
  const bySecret = new Map<string, string>();
  for (const [placeholder, secret] of map) bySecret.set(secret, placeholder);

  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      const existing = bySecret.get(match);
      if (existing) return existing;
      const placeholder = `[secret-${map.size + 1}]`;
      map.set(placeholder, match);
      bySecret.set(match, placeholder);
      return placeholder;
    });
  }
  return { map, text: out };
}

/** Put the original secrets back into model output before display, so the
 *  user sees real values while the provider only ever saw placeholders. */
export function restoreSecrets(text: string, map: Map<string, string>): string {
  let out = text;
  for (const [placeholder, secret] of map) {
    out = out.split(placeholder).join(secret);
  }
  return out;
}
