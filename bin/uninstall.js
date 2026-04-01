#!/usr/bin/env node

// npm preuninstall hook — removes clawndom from Claude Code settings and cleans up data.

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeSettingsFile = path.join(os.homedir(), '.claude', 'settings.json');
const clawndomDir = path.join(os.homedir(), '.clawndom');

// Remove hook from Claude Code settings
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
      }
    }
  }
} catch {
  // Best effort — don't block uninstall
}

// Remove ~/.clawndom/ (allowlist, config)
try {
  if (fs.existsSync(clawndomDir)) {
    fs.rmSync(clawndomDir, { recursive: true });
  }
} catch {
  // Best effort — don't block uninstall
}
