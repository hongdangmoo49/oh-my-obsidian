# Vault Structure Guidance

Design the vault around three layers:

```text
vault/
├── <project-or-service>/
│   ├── <knowledge-domain-1>/
│   ├── <knowledge-domain-2>/
│   └── ...
├── 작업기록/
│   ├── 세션기록/
│   ├── 의사결정/
│   ├── 트러블슈팅/
│   └── 회의록/
├── scripts/
│   └── team-setup/
├── .obsidian/
└── README.md
```

Design principles:

- Use Korean-first category names when that fits the team.
- Keep service-layer categories broad until a folder has enough documents to
  justify splitting.
- Keep generated files plain Markdown and friendly to git.
- Use English frontmatter field names for tooling compatibility.
- Use dated ASCII slugs for generated dated documents.
- Keep Obsidian community plugin enablement and auto-sync opt-in.

The setup helper writes:

- `README.md`
- `scripts/team-setup/install.sh`
- `scripts/team-setup/install.ps1`
- `scripts/team-setup/README.md`
- `.oh-my-obsidian/setup-state.json`

Treat missing managed artifacts as reconcile candidates. Do not overwrite
unmanaged files without an explicit dry-run and approval.
