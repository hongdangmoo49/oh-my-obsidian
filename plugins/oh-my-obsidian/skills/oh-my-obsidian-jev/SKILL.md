---
name: oh-my-obsidian-jev
description: Connect, inspect or disable optional Jev search reranking for Obsidian memory, without collecting credentials in chat.
---

Resolve the plugin root two directories above this SKILL.md, not from cwd.
Read docs/jev.md under that root before acting. Use scripts/jev.mjs from the same
root. Keep cwd at the user's actual project so consent binds to that project.

Never ask for a key in chat, arguments, a tool call or a file. For connect/key
rotation, give the user the absolute terminal command to run themselves; do not
execute connect in an agent tool or collect its input. Windows provides masked
Credential Manager storage; other OSes currently require protected environment
credentials. Do not write profiles, plaintext keys or bypass OS storage failure.

Status is read-only. Enable requires explicit approval of paid query/excerpt
transmission to TypeSafe for this project and vault; a key alone is not consent.
Synthetic tests require separate approval of the potential charge. Disable or
shared credential removal requires the user's request. Never claim real-provider
verification or performance gains from mocked tests.
