# Security policy

## Reporting a vulnerability

Please do not open a public issue. Once the repository is public, report it privately through GitHub's
private vulnerability reporting ("Report a vulnerability" on the repository's Security tab).

## How secrets are kept out of the repository

- AWS access uses short-lived AWS IAM Identity Center (SSO) credentials only; no access keys are created.
- Local values live in a git-ignored `.env`; only `.env.example`, with placeholders, is committed.
- The pre-commit hook in `.githooks/` runs gitleaks on staged changes and blocks `.env` files.

## If a secret leaks

1. Revoke or rotate the credential immediately.
2. Check AWS billing and activity for misuse.
3. Purge it from history with `git filter-repo` and force-push while the repository is still private.
4. Re-scan, then record the incident below.

## Incident log

None.
