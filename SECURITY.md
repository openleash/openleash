# Security Policy

## Reporting vulnerabilities

If you discover a security vulnerability in openleash, please report it through [GitHub's private security advisory feature](https://github.com/openleash/openleash/security/advisories/new).

**Do not** open a public issue for security vulnerabilities.

## What to include

- **Summary** — a brief description of the vulnerability.
- **Severity** — your assessment (critical, high, medium, low).
- **Affected component** — which package or module is affected (e.g., `@openleash/core`, `@openleash/server`).
- **Steps to reproduce** — clear, minimal steps to trigger the issue.
- **Impact** — what an attacker could achieve by exploiting this.

## Response timeline

- **Acknowledgment** — we aim to acknowledge reports within 3 business days.
- **Assessment** — we'll provide an initial severity assessment within 7 business days.
- **Fix** — critical and high severity issues will be prioritized for the next patch release.

## Out of scope

The following are generally out of scope:

- Vulnerabilities in dependencies that are not exploitable through openleash.
- Issues that require physical access to the machine running openleash.
- Denial-of-service attacks against the local HTTP server (openleash is designed to run locally).
- Social engineering attacks.
