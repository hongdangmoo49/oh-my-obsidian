# VM Validation Runbook

This directory contains a public-safe validation framework for testing the
Codex plugin in disposable environments.

## Scope

The goal is to validate real user flows in clean VMs without committing any
machine-specific or secret material to the repository.

The framework is split into:

- `scripts/`: reusable assertions and environment bootstrap helpers
- `scenarios/`: human-readable scenario definitions for Linux, Windows, and
  other platform contexts
- `artifacts/`: local-only output directory for transcripts, logs, screenshots,
  and copied state files. This directory is ignored on purpose.

## Public Repo Safety Rules

These files are meant to live in a public repository. Do not commit:

- auth tokens
- PATs, SSH keys, or cloud credentials
- real email addresses or usernames used outside test fixtures
- private hostnames, internal domains, or VPN-only IPs
- copied `.codex`, `.oh-my-obsidian`, or vault data from a real workstation
- raw VM transcripts containing secrets

Only commit:

- placeholders like `<repo-root>`, `<vault-path>`, `<temp-home>`
- generic example identities such as `qa-user`
- sanitized transcripts if you later decide to publish sample runs

## Environment Rules

Each scenario should run in a disposable environment with all of the following
isolated per run:

- OS user
- `HOME`
- `.codex`
- `.oh-my-obsidian`
- repository clone
- vault path
- bare git remote

The helper scripts in `scripts/` assume disposable targets. They intentionally
avoid hidden defaults to reduce accidental writes into a real home directory.

## Recommended Execution Order

1. Run repo-local regression first:
   - plugin-local tests
   - root helper tests
2. Run Linux native VM acceptance:
   - fresh setup
   - attach/reconcile
   - recall/session-save
   - vault manager
   - hook preview
3. Run platform smoke cases:
   - Windows native preflight
   - macOS native preflight
   - WSL/container limitations

## Sparse / Local Codex Install Note

For a local checkout, the supported Codex marketplace path is the repository
file:

```text
.agents/plugins/marketplace.json
```

That entry resolves the plugin from:

```text
./plugins/oh-my-obsidian
```

If you use a local checkout, run `codex plugin marketplace add <repo-root>`.
The `--sparse` flag is only supported for git marketplace sources, not local
directory sources. For remote git sources, keep `.agents/` and
`plugins/oh-my-obsidian/` available in the sparse checkout.

## Minimal Manual Loop

For a single Linux VM acceptance run:

1. Clone the repo to `<repo-root>`.
2. Create a disposable home:
   ```bash
   qa/scripts/reset-home.sh <temp-home>
   ```
3. Create a disposable bare remote:
   ```bash
   qa/scripts/make-bare-remote.sh <temp-workdir>
   ```
4. Add the Codex marketplace:
   ```bash
   HOME=<temp-home> codex plugin marketplace add <repo-root>
   ```
5. Follow one of the scenario YAMLs in `scenarios/linux-native/`.
6. Use the assertion scripts to verify final state.
7. Save logs under `qa/artifacts/` if you need them locally.
8. Delete the VM or revert to a snapshot.

## Assertions

### Setup state

```bash
qa/scripts/assert-setup-state.sh <vault-path> [expected-status]
```

Checks:

- `setup-state.json` exists
- schema matches
- `vaultRealPath` matches the real path of the vault
- `managedArtifacts[]` is shaped correctly
- applied artifacts exist on disk

### Git safety

```bash
qa/scripts/assert-git-safe.sh <repo-path> [--expect-clean] [--expect-no-staged] [--expect-branch BRANCH]
```

Checks:

- repo availability
- staged/index cleanliness if requested
- branch name if requested
- head commit message if requested

### Hook merge

```bash
qa/scripts/assert-hook-merge.sh <hooks.json> <expected-command> [preserved-command]
```

Checks:

- valid JSON
- `hooks.Stop` remains an array
- expected hook command exists exactly once
- existing hook command is preserved when supplied

### Public-safety scan

```bash
qa/scripts/check-public-safety.sh qa
```

Scans for obvious secret material or machine-specific paths in the QA files
before committing them.

## Scenario Files

Each scenario file is intentionally declarative and public-safe. It describes:

- prerequisites
- approvals to give or deny
- commands to run
- Codex prompts to use
- assertions to check
- artifacts to capture locally
- public-redaction reminders

Start with:

- `scenarios/linux-native/fresh-setup.yaml`
- `scenarios/linux-native/session-save-ambiguous.yaml`
- `scenarios/linux-native/attach-existing.yaml`
- `scenarios/linux-native/hook-preview.yaml`
- `scenarios/windows-native/preflight.yaml`

## Suggested Artifact Capture

Keep these local-only when a scenario fails:

- Codex transcript
- `setup-state.json`
- `git status --porcelain=v1`
- `git log --oneline -n 5`
- `.codex/hooks.json` before/after
- `.obsidian/community-plugins.json`
- helper JSON output

Do not commit captured artifacts back into the repo.

## Synthetic Recall Evaluation

```text
node qa/scripts/recall-evaluation.mjs
node qa/scripts/recall-evaluation.mjs --jev --allow-billed-test
```

The first command is offline/local-only. The second permits up to 50 paid Jev
requests using the already configured environment/OS credential; no retries.
Only the bundled synthetic corpus is eligible. No actual vault is read, global
consent changed, key printed or agent model session started.

The fixture has 25 topics and 50 Korean/mixed-language questions, each with one
labeled active decision. Every topic also has an obsolete decision and an
unapproved keyword-list distractor (75 Markdown files total). This is a small
hand-authored stress suite, not representative production evidence or a held-out
training set. Labels and data are fixed before the first provider run.

Reports are written to ignored dist/recall-evaluation-20-local.json and
dist/recall-evaluation-20-jev.json. The original top-10 reports are retained.
They contain only public synthetic question ids,
paths, metrics and validated token counts, not credentials or response bodies.
The corpus and source hashes identify the tested version.

The comparison now uses `recall --local-only --limit 20` to inspect the real
lexical candidate cap without reading a key or making a provider call, then
passes that same pool to the production reranker (normal top-10 output).
Report candidate Recall@20 separately from Hit@1, Hit@5, MRR@10 and nDCG@5;
conditional Hit@5 excludes candidate misses. Jev failure falls
back to local results and counts as a fallback, not a successful rerank.
P95 includes local CLI process startup plus rerank time. It is not a production
latency SLA. Costs are estimates from known provider-reported input tokens at
the recorded official list price, not a bill; missing/failed responses can leave
usage unaccounted for. Unknown usage is never treated as free.

### Historical Top-10 Stress Run (2026-10-08)

Corpus SHA256: `1a2d4d21f5eef6fed29a742ace64228a559dd8ad3edce0d0422f097fffa14b33`.
Model: `jev-1.13.0`. The paired comparison used the same local top-10 pool.

| Metric | Local | Jev reranked |
| --- | ---: | ---: |
| Hit@1 | 0% | 98% |
| Hit@5 | 94% | 98% |
| Candidate Recall@10 | 98% | 98% |
| MRR@10 | 0.4498 | 0.9800 |
| nDCG@5 | 0.5723 | 0.9800 |
| P95 including CLI startup | 357 ms | 1,570 ms |

All 50 provider requests succeeded with no fallback. Reported usage: 82,896 input
tokens and 7,255 output tokens. Estimated list-price input cost: USD 0.003481632,
not an invoice. Korean Hit@1 was 100%; mixed-language Hit@1 was 96% after reranking.
The known list price is USD 0.042 per million input tokens, output free, checked
against https://docs.typesafe.ai/models on the run date.

The unresolved query `revision-guard-1` (expected hash mismatch with Korean words)
missed its gold document in the local top-10. Reranking cannot repair that miss.
Two mixed-language answers moved into the top five (`external-consent-1` and
`catalog-privacy-1`). No reachable gold answer moved down in this run.

The 0% local Hit@1 is driven by deliberately keyword-stuffed distractors, not a
measurement of ordinary user queries. Do not advertise the 98% score as real-vault
accuracy or infer production top-20 performance. Before changing retrieval,
evaluate candidate expansion and Korean/English terminology on a held-out set.

### Production-Cap Top-20 Stress Run (2026-10-08)

Same fixed corpus, with a cap of 20 candidates and no retrieval algorithm change:
local Hit@1 0%, Hit@5 94%; Jev Hit@1/Hit@5 100%. Candidate Recall@20 was 100%.
The previous hash-revision miss was present in the actual top-20 pool; that
earlier top-10 miss must not be described as a production retrieval failure.
All 50 requests succeeded, with 109,854 reported input tokens and an estimated
USD 0.004613868 list-price cost. Paired P95: local 129 ms, Jev total 924 ms.
Do not compare timings across separate runs as controlled speed improvements.
These remain synthetic keyword-stuffing stress results, not real-vault accuracy.

### Separate Query Set

`node qa/scripts/recall-evaluation.mjs --heldout` evaluates 50 different questions
against the unchanged 75-document corpus. Keyword distractors retain the original
questions: the new test questions are not copied into the documents. Query hashes
are recorded separately from the corpus hash.

Before search changes, this set had candidate Recall@20 94% (three misses),
Hit@1 22% and Hit@5 90%. The misses were an English hash-mismatch query and two
Korean queries with attached particles. Once used to diagnose and fix those
misses, this set is a development regression set, not independent evidence of
generalization. Keep the before-change report rather than overwriting it.

### Development Regression After Bounded Query Expansion

Only three technical equivalences (`hash`/해시, `mismatch`/불일치, `overwrite`/덮어)
and common attached Korean particles are expanded. Original terms are retained
and score three times as strongly as expansions. Repeated synonyms count once.
This is not a translator or a full Korean morphological analyzer.

| Separate 50-question set | Before | After local expansion | After Jev reranking |
| --- | ---: | ---: | ---: |
| Candidate Recall@20 | 94% | 100% | 100% |
| Hit@1 | 22% | 26% | 100% |
| Hit@5 | 90% | 96% | 100% |

The three diagnosed misses are present after expansion. The original stress
set still has 100% candidate Recall@20 and local Hit@5 is 98% after the change.
The after-change separate-set live run used 50 requests, with 105,802 reported
input tokens and estimated USD 0.004443684 cost; no fallback occurred. Paired
P95 was 120 ms for local recall and 879 ms including Jev. The two live runs in
this work used 100 requests total, estimated USD 0.009057552 before tax.

The query set was inspected to diagnose these fixes, so these are development
regression results, not unbiased held-out accuracy. A fresh independent corpus
and negative/unanswerable cases are still needed before production accuracy
claims. Limited particle stripping can introduce false matches; retain the
stronger exact-match weight and review real-vault cases only with user approval.

### Adversarial Fix Verification

The evaluator executes a fresh snapshot of all six runtime helper dependencies,
including `vault-core.mjs`, safety/recovery code and the Windows credential
helper. Local retrieval and Jev imports both use that snapshot. Source and copied
bytes are checked before provider calls and before saving a report; changing a
shared helper during an offline reproduction now fails without writing results.
The runner's own loaded-version hash and Node/platform metadata are also recorded.
These are version-consistency checks, not a security boundary against the OS user.

Question overlap and duplicate checks use NFKC, case folding, trimming and
whitespace normalization. Technical query aliases now require an exact term
after the bounded particle handling: a compound such as 해시태그 does not become
cryptographic `hash` merely because it starts with 해시.

The corrected 2026-10-08 separate-set live run completed 50 Jev requests with no
fallback. Local Hit@1 was 26%, a query-blind filter retaining visible
`Active decision` headings reached 94%, and Jev reached 100%. All three had
100% candidate Recall@20; local Hit@5 was 96%, the status filter and Jev were 100%.
The status filter uses only the same excerpt text visible to Jev, not gold paths.
It is a synthetic-corpus diagnostic, not a new production filtering policy.

Paired P95 was 190 ms for the status filter (including local CLI startup) versus
1,244 ms with Jev. Reported input was 105,802 tokens, estimated USD 0.004443684
excluding tax and not an invoice. Thus the measured incremental first-rank gain
over this cheap baseline was 6 percentage points, not 74 points over raw lexical
ordering. This inspected development set still cannot establish real-vault
accuracy, generalization or that an external model is always necessary.

### Follow-up Boundary Checks

Snapshot verification now requires the complete fingerprint set and regular
source/copy files on every check. A same-byte module symlink is refused because
Node can otherwise resolve its relative imports from an unverified directory.
This still does not make the process a sandbox against its own OS account.

Fixture and question collections must be actual arrays; two-character strings
are not two questions. Whitespace-only answer bodies are rejected. The cheap
status baseline reads only the first nonempty Markdown heading (not headings in
later examples, fenced code, indented code or split lines).
The excerpt generator also keeps ordinary backtick/tilde fence context and does
not promote example headings to section status. Real ATX headings start separate
contexts even when the author omitted surrounding blank lines. This is bounded
Markdown handling, not a full parser for every extension.

Inferred Korean hash matches also require a bounded word form in document text.
English `hash` no longer matches a hashtag-only note through the 해시 alias.
Scoring and excerpts share full-source match spans so truncation cannot invent a
word boundary. Original literal substring matching remains unchanged.

These follow-up changes were checked offline. The live measurements above are
historical evidence from their recorded source hashes, not a new paid run of
this later version.
