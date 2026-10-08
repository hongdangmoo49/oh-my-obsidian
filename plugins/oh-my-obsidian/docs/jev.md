# Optional Jev recall reranking

This is an opt-in experimental search enhancement, not a replacement for local
memory, summaries, filesystem authorization or safety checks. It reranks up to
20 existing lexical candidates and returns up to 10. It cannot retrieve documents
that local search missed. No speed or Korean-language accuracy gain is claimed.

## Connect a key

Run this yourself in a separate interactive terminal, not inside an agent tool:

```text
node plugins/oh-my-obsidian/scripts/jev.mjs connect
```

Windows uses masked PowerShell input and Windows Credential Manager under
`oh-my-obsidian/jev`. Running connect again replaces that credential. Keys never
belong in chat, command arguments, Markdown, Git, logs or settings files.
The key is shared by Claude and Codex for the same OS account. This does not
protect against malicious code running as that account.

For CI or temporary use, supply `TYPESAFE_API_KEY` through your secret manager or
an existing protected environment. Do not paste literal-key shell commands into
agent chat/history. Environment credentials take precedence over OS storage.
macOS/Linux persistent keychain adapters are not implemented; there is no
automatic plaintext file fallback. No shell profiles are modified.

## Consent and test

First connect a complete managed vault. Set `OBSIDIAN_VAULT` only for the command
if your existing project pointer does not resolve it. Run from the actual Git
project root (or the intended non-Git working directory):

```text
node plugins/oh-my-obsidian/scripts/jev.mjs status
node plugins/oh-my-obsidian/scripts/jev.mjs test --allow-billed-test
node plugins/oh-my-obsidian/scripts/jev.mjs enable --allow-external-text
```

The test sends a synthetic sentence only, may incur charges, and requires
separate approval. It does not send vault text or enable reranking. Connecting a
key never grants consent. Enabling permits paid requests containing the search
query, candidate types and bounded excerpts to `api.typesafe.ai`, not entire
files, paths or the vault. Local heuristic checks run before transmission but
are not comprehensive DLP. Do not enable this for confidential vaults without
reviewing provider terms and retention policies.

Candidates exclude YAML frontmatter and select a bounded keyword-relevant body
paragraph with its section heading. Long paragraphs retain their opening context
and evaluate windows near the first and last occurrence of each query term.
Equal-scoring paragraphs in append-only session logs prefer the later paragraph;
this is not a guarantee of current truth or complete context. File modification dates are
provided as hints, not authoritative event dates. Catalog-only entries containing
raw prompts or file lists stay local and are never sent for reranking.

Consent is stored without credentials under
`~/.oh-my-obsidian/jev/<project-and-vault-hash>.json`, bound to canonical project
and vault paths, outside Git/Obsidian content. Git subdirectories share project
consent. Claude and Codex use the same shared helper. New worktrees, projects or
vault paths require separate consent. This file is not an authorization boundary
against code already running as the same user.

Existing `vault-ops.mjs recall --query ...` calls automatically use Jev only with
consent. Missing keys, rejected text, invalid responses, HTTP errors and a
2-second request timeout return the original local results. A `reranking` field
reports whether Jev or local fallback was used. No retries or provider error
bodies are printed. The model is pinned to `jev-1.13.0`; upgrades need evaluation.

## Disable or remove

```text
node plugins/oh-my-obsidian/scripts/jev.mjs disable
node plugins/oh-my-obsidian/scripts/jev.mjs disconnect
```

Disable removes consent for this project/vault only. Disconnect removes the
Windows credential for both agents, not independently supplied environment
credentials. Clear those through the source that set them. Neither operation
deletes notes. Status does not print a key or make network requests.

Reapply Codex hooks after updating: copied helpers need the new `jev.mjs` and
`jev-credential.ps1`. Do not update the Agensi ZIP in place without a new reviewed
version and rerunning distribution tests. No live provider benchmark or real-key
connection test has been performed by this implementation.

Official API: https://docs.typesafe.ai/introduction/quickstart
