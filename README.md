# clawndom

Security hook for Claude Code. Checks every package your agent installs against the [OSV.dev](https://osv.dev/) vulnerability database. Clean packages pass through. Packages with known vulnerabilities get blocked.

Zero dependencies. Uses only Node.js built-ins.

## Setup

```bash
npm install -g clawndom
clawndom init
```

Done. The hook is active for all future Claude Code sessions.

`init` adds a PreToolUse hook to `~/.claude/settings.json`. This tells Claude Code to run clawndom before every Bash command. clawndom checks if the command installs packages — if it does, each package is verified against OSV.dev before the command executes.

No other files are modified. The allowlist and config are stored in `~/.clawndom/`.

## When a package gets blocked

clawndom tells the agent why. If you've reviewed the package and it's fine:

```bash
clawndom allow <package>           # allow all versions
clawndom allow <package>@1.2.3     # allow a specific version
clawndom disallow <package>        # remove from allowlist
clawndom allowlist                 # see what's allowed
```

## What it covers

The hook intercepts `npm install`, `yarn add`, `pnpm add`, `npx`, and `npm create`. Each package is checked against OSV.dev before the command runs. If a package has known vulnerabilities and isn't on your allowlist, the install is denied.

## Configuration

```bash
clawndom config                    # show current config
clawndom config enabled false      # disable clawndom without uninstalling
clawndom config enabled true       # re-enable
```

## Limitations

- **Zero-day gap** — Only catches vulnerabilities already reported to OSV.dev.
- **No typosquatting detection** — Doesn't catch `expresss` as a typosquat of `express`.
- **No dependency confusion** — Checks the named package, not private registry hijacking.
- **No code analysis** — Doesn't inspect what the package does. A clean record doesn't mean safe code.
- **Fail-closed** — If OSV.dev is unreachable, installs are blocked. Run `clawndom config enabled false` to temporarily disable if needed.

For deeper protection, consider [Socket.dev](https://socket.dev/). clawndom is not affiliated with Socket.dev or OSV.dev.

## Uninstall

```bash
clawndom uninstall
npm uninstall -g clawndom
```

`clawndom uninstall` removes the hook from `~/.claude/settings.json` and deletes `~/.clawndom/` (allowlist and config). Then `npm uninstall -g` removes the package itself. Clean uninstall, nothing left behind.

## Requirements

Node 18+.

## License

MIT
