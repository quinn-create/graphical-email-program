# Security Guardrails

- Gmail readonly only
- Clio runtime allowlist; DELETE/PATCH rejected
- Drive no delete/overwrite
- Quest no auth/writes
- AI cannot commit
- `pnpm safety-check` enforces static + runtime checks
