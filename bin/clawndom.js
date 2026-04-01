#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const os = require('os');
const { addToAllowlist, removeFromAllowlist, listAllowlist } = require('../src/allow');
const { getConfig, setConfig, VALID_KEYS } = require('../src/config');

// Claw color — oklch(0.55 0.22 25) ≈ RGB(190, 60, 30)
const CLAW = '\x1b[38;2;190;60;30m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const args = process.argv.slice(2);

const subcommand = args[0] && !args[0].startsWith('-') && !args[0].startsWith('/') && !args[0].startsWith('~') && !args[0].startsWith('.')
  ? args.shift()
  : null;

const flags = { help: false };
const positional = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') flags.help = true;
  else positional.push(arg);
}

if (flags.help || subcommand === 'help') {
  console.log(`
clawndom — Use AI agents at full speed. Safely.

Commands:
  clawndom init                    Set up the hook for Claude Code
  clawndom allow <package>         Allow a package (or package@version)
  clawndom disallow <package>      Remove a package from the allowlist
  clawndom allowlist               Show allowed packages
  clawndom config                  Show current configuration
  clawndom config <key> <value>    Set a config value (e.g. enabled false)

Uninstall:
  clawndom uninstall               Remove hook, config, and allowlist
  npm uninstall -g clawndom        Then remove the package itself

Options:
  --help       Show this help message
`);
  process.exit(0);
}

function main() {
  let exitCode;
  switch (subcommand) {
    case 'init':
      exitCode = cmdInit();
      break;
    case 'allow':
      exitCode = cmdAllow();
      break;
    case 'disallow':
      exitCode = cmdDisallow();
      break;
    case 'allowlist':
      exitCode = cmdAllowlist();
      break;
    case 'config':
      exitCode = cmdConfig();
      break;
    case 'uninstall':
      exitCode = cmdUninstall();
      break;
    default:
      console.log(`Run \x1b[1mclawndom init\x1b[0m to get started, or \x1b[1mclawndom --help\x1b[0m for all commands.`);
      exitCode = 0;
      break;
  }
  process.exit(exitCode);
}

// --- init ---

function installHook() {
  const hookPath = path.resolve(__dirname, 'hook.js');
  const claudeSettingsDir = path.join(os.homedir(), '.claude');
  const claudeSettingsFile = path.join(claudeSettingsDir, 'settings.json');

  if (!fs.existsSync(claudeSettingsDir)) {
    fs.mkdirSync(claudeSettingsDir, { recursive: true });
  }

  let settings = {};
  if (fs.existsSync(claudeSettingsFile)) {
    settings = JSON.parse(fs.readFileSync(claudeSettingsFile, 'utf-8'));
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];

  const alreadyHasHook = settings.hooks.PreToolUse.some((entry) =>
    entry.hooks?.some((h) => h.command && h.command.includes('clawndom'))
  );

  if (alreadyHasHook) {
    return { installed: false, alreadyExists: true };
  }

  settings.hooks.PreToolUse.push({
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: `node ${hookPath}`,
      },
    ],
  });

  fs.writeFileSync(claudeSettingsFile, JSON.stringify(settings, null, 2) + '\n');
  return { installed: true, alreadyExists: false };
}

function cmdInit() {
  console.log();

  let hookInstalled = false;
  try {
    const result = installHook();
    hookInstalled = true;
    if (result.alreadyExists) {
      console.log(`  ${CLAW}🦞 Already wrapped.${RESET} Go open Claude Code — you're protected.`);
    } else {
      console.log(`  ${CLAW}🦞 Wrapped.${RESET} Go open Claude Code — you're protected.`);
    }
  } catch (err) {
    const hookPath = path.resolve(__dirname, 'hook.js');
    console.log(`  \x1b[33mCould not install hook: ${err.message}\x1b[0m`);
    console.log(`  Add manually to ~/.claude/settings.json:`);
    console.log();
    console.log(`  ${JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `node ${hookPath}` }] }] }
    }, null, 2).split('\n').join('\n  ')}`);
    console.log();
  }

  console.log();

  return 0;
}

// --- allow / disallow / allowlist ---

function cmdAllow() {
  const pkg = positional[0];
  if (!pkg) {
    console.error('\x1b[31mUsage: clawndom allow <package>\x1b[0m');
    return 2;
  }
  addToAllowlist(pkg);
  console.log(`\x1b[32mAllowed: ${pkg}\x1b[0m`);
  return 0;
}

function cmdDisallow() {
  const pkg = positional[0];
  if (!pkg) {
    console.error('\x1b[31mUsage: clawndom disallow <package>\x1b[0m');
    return 2;
  }
  removeFromAllowlist(pkg);
  console.log(`\x1b[33mRemoved from allowlist: ${pkg}\x1b[0m`);
  return 0;
}

function cmdAllowlist() {
  const list = listAllowlist();
  if (list.length === 0) {
    console.log('\x1b[2mAllowlist is empty.\x1b[0m');
  } else {
    console.log('\x1b[1mAllowed packages:\x1b[0m');
    for (const entry of list) {
      console.log(`  ${entry}`);
    }
  }
  return 0;
}

// --- config ---

function cmdConfig() {
  const key = positional[0];
  const value = positional[1];

  if (!key) {
    // Show all config
    const config = getConfig();
    console.log('\x1b[1mConfiguration:\x1b[0m');
    for (const [k, v] of Object.entries(config)) {
      console.log(`  ${k} = ${v}`);
    }
    return 0;
  }

  if (value === undefined) {
    // Show single key
    const val = getConfig(key);
    if (val === undefined) {
      console.error(`\x1b[31mUnknown config key: ${key}. Valid keys: ${VALID_KEYS.join(', ')}\x1b[0m`);
      return 2;
    }
    console.log(`${key} = ${val}`);
    return 0;
  }

  // Set value
  try {
    setConfig(key, value);
    console.log(`\x1b[32mSet ${key} = ${value}\x1b[0m`);
    return 0;
  } catch (err) {
    console.error(`\x1b[31m${err.message}\x1b[0m`);
    return 2;
  }
}

// --- uninstall ---

function cmdUninstall() {
  const claudeSettingsFile = path.join(os.homedir(), '.claude', 'settings.json');
  const clawndomDir = path.join(os.homedir(), '.clawndom');

  console.log();

  // Remove hook from settings.json
  try {
    if (fs.existsSync(claudeSettingsFile)) {
      const settings = JSON.parse(fs.readFileSync(claudeSettingsFile, 'utf-8'));
      if (settings.hooks?.PreToolUse) {
        const before = settings.hooks.PreToolUse.length;
        settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
          (entry) => !entry.hooks?.some((h) => h.command && h.command.includes('clawndom'))
        );
        if (settings.hooks.PreToolUse.length < before) {
          if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
          if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
          fs.writeFileSync(claudeSettingsFile, JSON.stringify(settings, null, 2) + '\n');
          console.log(`  ${CLAW}🦞 Unwrapped.${RESET} Hook removed from ~/.claude/settings.json`);
        } else {
          console.log(`  ${DIM}No hook found in ~/.claude/settings.json${RESET}`);
        }
      } else {
        console.log(`  ${DIM}No hook found in ~/.claude/settings.json${RESET}`);
      }
    }
  } catch (err) {
    console.log(`  \x1b[33mCould not remove hook: ${err.message}\x1b[0m`);
  }

  // Remove ~/.clawndom/
  try {
    if (fs.existsSync(clawndomDir)) {
      fs.rmSync(clawndomDir, { recursive: true });
      console.log(`  ${DIM}Removed ~/.clawndom/${RESET}`);
    }
  } catch (err) {
    console.log(`  \x1b[33mCould not remove ~/.clawndom/: ${err.message}\x1b[0m`);
  }

  console.log();
  console.log(`  Run ${BOLD}npm uninstall -g clawndom${RESET} to finish.`);
  console.log();

  return 0;
}

main();
