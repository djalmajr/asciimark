// Parity gate for the i18n message bundles. Runs in pre-push and CI.
//
// Validates two invariants:
//
//   1. Every locale defines exactly the same keys as the base locale.
//      Missing keys produce empty strings at runtime; extra keys mean
//      a translator added something the source never asked for and
//      now drift silently.
//
//   2. Interpolation placeholders (`{name}`) appearing in the base
//      locale's value are present in every translated value. Catches
//      "{n} files" → "arquivos" cases where the placeholder was lost
//      in translation, which would render as a literal "{n}" hole.
//
// Exit code 1 on any violation, with a clear list of mismatches.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MESSAGES_DIR = resolve(ROOT, "packages/i18n/messages");
const BASE_LOCALE = "en";
// Keep in sync with packages/i18n/project.inlang/settings.json::locales
const LOCALES = ["en", "pt-BR", "es"] as const;

type MessageBundle = Record<string, string>;

async function loadBundle(locale: string): Promise<MessageBundle> {
  const path = resolve(MESSAGES_DIR, `${locale}.json`);
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Drop the `$schema` meta-key — it's not a translatable message.
  const out: MessageBundle = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k === "$schema") continue;
    if (typeof v !== "string") {
      throw new Error(`[i18n-check] ${locale}.${k}: expected string, got ${typeof v}`);
    }
    out[k] = v;
  }
  return out;
}

function placeholders(value: string): Set<string> {
  const set = new Set<string>();
  // Match `{name}` pattern used by the inlang message-format plugin.
  // Skips `{{` (double braces, escape).
  const re = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    set.add(match[1]!);
  }
  return set;
}

const errors: string[] = [];

const base = await loadBundle(BASE_LOCALE);
const baseKeys = new Set(Object.keys(base));

for (const locale of LOCALES) {
  if (locale === BASE_LOCALE) continue;
  const bundle = await loadBundle(locale);
  const localeKeys = new Set(Object.keys(bundle));

  // Missing keys (in base but not in this locale).
  for (const key of baseKeys) {
    if (!localeKeys.has(key)) {
      errors.push(`[${locale}] missing key: ${key}`);
    }
  }

  // Extra keys (in this locale but not in base).
  for (const key of localeKeys) {
    if (!baseKeys.has(key)) {
      errors.push(`[${locale}] extra key (not in ${BASE_LOCALE}): ${key}`);
    }
  }

  // Placeholder parity for keys that exist in both.
  for (const key of baseKeys) {
    if (!localeKeys.has(key)) continue;
    const baseHoles = placeholders(base[key]!);
    const localeHoles = placeholders(bundle[key]!);
    for (const h of baseHoles) {
      if (!localeHoles.has(h)) {
        errors.push(`[${locale}] ${key}: placeholder {${h}} dropped in translation`);
      }
    }
    for (const h of localeHoles) {
      if (!baseHoles.has(h)) {
        errors.push(`[${locale}] ${key}: placeholder {${h}} added (not in ${BASE_LOCALE})`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`✖ i18n parity check failed: ${errors.length} issue(s)\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`✔ i18n parity check passed (${LOCALES.length} locales, ${baseKeys.size} keys each)`);
