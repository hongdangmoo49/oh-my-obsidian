#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  printf 'usage: %s <repo-path> [--expect-clean] [--expect-no-staged] [--expect-branch BRANCH] [--expect-head-message MSG]\n' "$0" >&2
  exit 2
fi

repo_path="$1"
shift

expect_clean=false
expect_no_staged=false
expect_branch=""
expect_head_message=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --expect-clean)
      expect_clean=true
      ;;
    --expect-no-staged)
      expect_no_staged=true
      ;;
    --expect-branch)
      shift
      expect_branch="${1:-}"
      ;;
    --expect-head-message)
      shift
      expect_head_message="${1:-}"
      ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  printf 'not a git repository: %s\n' "$repo_path" >&2
  exit 1
}

status_output="$(git -C "$repo_path" status --porcelain=v1 --untracked-files=all)"

if [ "$expect_clean" = true ] && [ -n "$status_output" ]; then
  printf 'expected clean repo, found:\n%s\n' "$status_output" >&2
  exit 1
fi

if [ "$expect_no_staged" = true ]; then
  staged="$(printf '%s\n' "$status_output" | awk 'NF && substr($0,1,1) != " " {print}')"
  if [ -n "$staged" ]; then
    printf 'expected no staged changes, found:\n%s\n' "$staged" >&2
    exit 1
  fi
fi

if [ -n "$expect_branch" ]; then
  actual_branch="$(git -C "$repo_path" branch --show-current)"
  [ "$actual_branch" = "$expect_branch" ] || {
    printf 'expected branch %s, got %s\n' "$expect_branch" "$actual_branch" >&2
    exit 1
  }
fi

if [ -n "$expect_head_message" ]; then
  actual_message="$(git -C "$repo_path" log -1 --pretty=%s)"
  [ "$actual_message" = "$expect_head_message" ] || {
    printf 'expected head message %s, got %s\n' "$expect_head_message" "$actual_message" >&2
    exit 1
  }
fi

printf 'ok - git state validated for %s\n' "$repo_path"
