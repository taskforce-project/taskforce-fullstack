# Security policy

## Supported versions

Security fixes go into the latest release on the `main` branch. Older versions are not patched: update to the
latest release.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately instead:

- on GitHub, with **Security > Report a vulnerability** on this repository;
- or by email to **contact@taskforce-project.fr**, with "Security" in the subject.

Say what you found, how to reproduce it and what impact you expect. We are a small team: we acknowledge reports
within a few days and keep you informed until a fix ships. Reporters who want to be credited are credited in the
release notes.

## Scope

In scope: the code in this repository (backend, frontend, AI service, MCP server, local runner, Claude Code plugin,
landing page) and the default configuration it ships with.

Out of scope: vulnerabilities in third-party services or dependencies themselves (please report them upstream), and
attacks that need an already compromised server or administrator account.
