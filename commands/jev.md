---
description: Configure optional Jev search reranking without exposing API keys
argument-hint: "connect | status | enable | disable | test | disconnect"
allowed-tools: Bash, Read
---

Read "$CLAUDE_PLUGIN_ROOT/plugins/oh-my-obsidian/docs/jev.md" first.
Use the shared helper at "$CLAUDE_PLUGIN_ROOT/plugins/oh-my-obsidian/scripts/jev.mjs".
Never ask the user to paste a key into chat, a tool call, arguments or a file.
For connect/rotation, give the user the absolute terminal command to run
themselves; never execute connect inside an agent tool or collect its input.
Enabling requires explicit approval of paid query/excerpt transmission to
TypeSafe for this project/vault. A key alone is not consent. Synthetic connection
tests require separate approval of the potential charge. Disabling or deleting
shared credentials also requires the user's request. Status is read-only.
Do not claim API verification or performance gains without actual evidence.
