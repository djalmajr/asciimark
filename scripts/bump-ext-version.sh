#!/bin/bash
set -euo pipefail

INPUT="${1:-}"

if [ -z "$INPUT" ]; then
  echo "Usage: bun run bump:ext <major|minor|patch|x.y.z>"
  echo "Examples:"
  echo "  bun run bump:ext patch   # 1.1.0 -> 1.1.1"
  echo "  bun run bump:ext minor   # 1.1.0 -> 1.2.0"
  echo "  bun run bump:ext major   # 1.1.0 -> 2.0.0"
  echo "  bun run bump:ext 1.2.0"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_PATH="${ROOT}/apps/extension/package.json"

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
  echo "Error: argument must be major, minor, patch, or semver (e.g. 1.1.0)"
  exit 1
fi

echo "${CURRENT} -> ${VERSION}"

# 1. apps/extension/package.json
bun --eval "
  const path = '${ROOT}/apps/extension/package.json';
  const pkg = JSON.parse(await Bun.file(path).text());
  pkg.version = '${VERSION}';
  await Bun.write(path, JSON.stringify(pkg, null, 2) + '\n');
"

# 2. apps/extension/public/manifest.json
bun --eval "
  const path = '${ROOT}/apps/extension/public/manifest.json';
  const manifest = JSON.parse(await Bun.file(path).text());
  manifest.version = '${VERSION}';
  await Bun.write(path, JSON.stringify(manifest, null, 2) + '\n');
"

echo "Bumped extension to ${VERSION}:"
echo "  - apps/extension/package.json"
echo "  - apps/extension/public/manifest.json"
