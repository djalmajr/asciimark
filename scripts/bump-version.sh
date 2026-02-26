#!/bin/bash
set -euo pipefail

INPUT="${1:-}"

if [ -z "$INPUT" ]; then
  echo "Usage: bun run bump:app <major|minor|patch|x.y.z>"
  echo "Examples:"
  echo "  bun run bump:app patch   # 0.3.1 -> 0.3.2"
  echo "  bun run bump:app minor   # 0.3.1 -> 0.4.0"
  echo "  bun run bump:app major   # 0.3.1 -> 1.0.0"
  echo "  bun run bump:app 0.4.0"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_PATH="${ROOT}/apps/desktop/package.json"

# Read current version
CURRENT=$(bun --eval "console.log(JSON.parse(await Bun.file('${PKG_PATH}').text()).version)")

if echo "$INPUT" | grep -qE '^(major|minor|patch)$'; then
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$INPUT" in
    major) VERSION="$((MAJOR + 1)).0.0" ;;
    minor) VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
    patch) VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  esac
elif echo "$INPUT" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  VERSION="$INPUT"
else
  echo "Error: argument must be major, minor, patch, or semver (e.g. 0.3.0)"
  exit 1
fi

echo "${CURRENT} -> ${VERSION}"

# 1. apps/desktop/package.json
bun --eval "
  const path = '${ROOT}/apps/desktop/package.json';
  const pkg = JSON.parse(await Bun.file(path).text());
  pkg.version = '${VERSION}';
  await Bun.write(path, JSON.stringify(pkg, null, 2) + '\n');
"

# 2. apps/desktop/src-tauri/tauri.conf.json
bun --eval "
  const path = '${ROOT}/apps/desktop/src-tauri/tauri.conf.json';
  const conf = JSON.parse(await Bun.file(path).text());
  conf.version = '${VERSION}';
  await Bun.write(path, JSON.stringify(conf, null, 2) + '\n');
"

# 3. apps/desktop/src-tauri/Cargo.toml (only the package version, first occurrence)
bun --eval "
  const path = '${ROOT}/apps/desktop/src-tauri/Cargo.toml';
  let toml = await Bun.file(path).text();
  toml = toml.replace(/^version = \".*\"/m, 'version = \"${VERSION}\"');
  await Bun.write(path, toml);
"

echo "Bumped to ${VERSION}:"
echo "  - apps/desktop/package.json"
echo "  - apps/desktop/src-tauri/tauri.conf.json"
echo "  - apps/desktop/src-tauri/Cargo.toml"
echo ""
echo "Next steps:"
echo "  git add -u && git commit -m 'chore: bump version to ${VERSION}'"
echo "  git tag v${VERSION}"
echo "  git push origin main --tags"
