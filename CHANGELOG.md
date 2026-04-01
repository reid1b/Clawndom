# Changelog

## Unreleased

- Capitalize Clawndom in display text and README
- Fix bin path in package.json (remove `./` prefix)
- Remove unused settings.json from project

## 1.0.0 — 2026-04-01

Initial release.

- PreToolUse hook for Claude Code that intercepts package install commands
- Checks packages against OSV.dev vulnerability database
- Supports npm, yarn, pnpm, npx, and npm create
- Allowlist management (`allow`, `disallow`, `allowlist`)
- Configuration (`enabled` toggle)
- Clean uninstall (`clawndom uninstall`)
- Zero dependencies
