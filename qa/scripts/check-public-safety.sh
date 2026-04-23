#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  printf 'usage: %s <path> [path...]\n' "$0" >&2
  exit 2
fi

patterns=(
  'BEGIN [A-Z ]*PRIVATE KEY'
  'ghp_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'glpat-[A-Za-z0-9_-]{10,}'
  'AKIA[0-9A-Z]{16}'
  'authorization:[[:space:]]*bearer'
  'aws_secret_access_key'
  '/home/[A-Za-z0-9._-]+/'
  '/Users/[A-Za-z0-9._-]+/'
  'C:\\\\Users\\\\[A-Za-z0-9._-]+\\\\'
  'C:/Users/[A-Za-z0-9._-]+/'
)

for pattern in "${patterns[@]}"; do
  if rg -n -i "$pattern" "$@" -g '!qa/scripts/check-public-safety.sh' -g '!check-public-safety.sh' >/dev/null; then
    printf 'public-safety check failed for pattern: %s\n' "$pattern" >&2
    rg -n -i "$pattern" "$@" -g '!qa/scripts/check-public-safety.sh' -g '!check-public-safety.sh' >&2
    exit 1
  fi
done

printf 'ok - no obvious secret or machine-specific patterns found in %s\n' "$*"
