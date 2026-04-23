#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  printf 'usage: %s <root-dir> [name]\n' "$0" >&2
  exit 2
fi

root_dir="$1"
name="${2:-vault-remote.git}"
remote_path="$root_dir/$name"

mkdir -p "$root_dir"

if [ -e "$remote_path" ]; then
  printf 'target already exists: %s\n' "$remote_path" >&2
  exit 1
fi

git init --bare "$remote_path" >/dev/null
printf '%s\n' "$remote_path"
