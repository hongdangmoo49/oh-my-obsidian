#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf 'usage: %s <temp-home>\n' "$0" >&2
  exit 2
fi

home_dir="$1"

rm -rf "$home_dir"
mkdir -p "$home_dir/.codex" "$home_dir/.oh-my-obsidian"

cat > "$home_dir/.gitconfig" <<'EOF'
[user]
    name = qa-user
    email = qa@example.invalid
EOF

printf '%s\n' "$home_dir"
