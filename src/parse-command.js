// Command parser for npm, yarn, pnpm, npx, and npm create/init.
// Pure function: command string in, package name array out.
//
// Not a full shell parser — covers the common commands an AI agent runs.
// Shell operators (&&, ||, ;, |) are split so only install segments are parsed.
// Redirects (>, <) truncate the segment.

'use strict';

/**
 * Parse an install command and return the list of packages it would install.
 * Supports npm, yarn, pnpm, npx, and npm create/init.
 */
function parseInstallPackages(command) {
  if (typeof command !== 'string' || !command.trim()) return [];

  const segments = splitShellCommands(command);
  const packages = [];

  for (const raw of segments) {
    const segment = stripEnvVars(raw);
    if (!segment) continue;

    const result =
      matchNpm(segment) ||
      matchYarn(segment) ||
      matchPnpm(segment) ||
      matchNpx(segment) ||
      matchNpmCreate(segment);

    if (result) {
      packages.push(...result);
    }
  }

  return packages;
}

/**
 * Split a command string on shell operators: &&, ||, ;, |
 * Truncate at redirect operators: >, <
 */
function splitShellCommands(cmd) {
  // First, truncate at redirects (but not >> or << which are less common in install commands,
  // but we truncate conservatively)
  const segments = [];
  // Split on &&, ||, ;, | (but not ||)
  // We split on && first, then || , then ;, then |
  // Simpler approach: use regex to split on these operators
  const parts = cmd.split(/\s*(?:&&|\|\||[;|])\s*/);

  for (const part of parts) {
    // Truncate at redirect operators
    const truncated = part.replace(/\s*[><].*$/, '').trim();
    if (truncated) {
      segments.push(truncated);
    }
  }

  return segments;
}

/**
 * Strip leading KEY=value environment variable assignments.
 */
function stripEnvVars(segment) {
  // Match KEY=value or KEY="value" or KEY='value' at the start
  return segment.replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/i, '').trim();
}

/**
 * Match: npm install|i|add <packages>
 * Returns array of package names, or null if no match.
 */
function matchNpm(segment) {
  const match = segment.match(/^npm\s+(?:install|i|add)\s+([\s\S]+)/);
  if (!match) return null;

  return extractPackageTokens(match[1]);
}

/**
 * Match: yarn add <packages>
 * (bare `yarn install` or `yarn` installs from lockfile — not interesting)
 */
function matchYarn(segment) {
  const match = segment.match(/^yarn\s+add\s+([\s\S]+)/);
  if (!match) return null;

  return extractPackageTokens(match[1]);
}

/**
 * Match: pnpm add|install <packages>
 * Bare `pnpm install` (no args after flags) installs from lockfile — skip it.
 */
function matchPnpm(segment) {
  const match = segment.match(/^pnpm\s+(?:add|install|i)\s+([\s\S]+)/);
  if (!match) return null;

  const tokens = extractPackageTokens(match[1]);
  // If no actual packages (only flags), it's a bare install
  return tokens.length > 0 ? tokens : null;
}

/**
 * Match: npx <command> and -p/--package args
 * Returns the first non-flag token (the command package) plus any -p/--package values.
 */
function matchNpx(segment) {
  const match = segment.match(/^npx\s+([\s\S]+)/);
  if (!match) return null;

  const tokens = match[1].split(/\s+/).filter(Boolean);
  const packages = [];
  let foundCommand = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // -p or --package flag: next token is a package
    if ((token === '-p' || token === '--package') && i + 1 < tokens.length) {
      i++;
      packages.push(tokens[i]);
      continue;
    }

    // --package=value
    if (token.startsWith('--package=')) {
      packages.push(token.slice('--package='.length));
      continue;
    }

    // Skip flags
    if (token.startsWith('-')) continue;

    // First non-flag token is the command (package to run)
    if (!foundCommand) {
      // Skip local paths
      if (!isLocalPath(token)) {
        packages.push(token);
      }
      foundCommand = true;
    }
  }

  return packages.length > 0 ? packages : null;
}

/**
 * Match: npm create|init <initializer>
 * `npm create foo` → runs `create-foo`, so we check `create-foo`.
 * `npm create @scope/foo` → runs `@scope/create-foo`.
 */
function matchNpmCreate(segment) {
  const match = segment.match(/^npm\s+(?:create|init)\s+([\s\S]+)/);
  if (!match) return null;

  const tokens = match[1].split(/\s+/).filter(Boolean);
  const packages = [];

  for (const token of tokens) {
    if (token.startsWith('-')) continue;

    if (token.startsWith('@')) {
      // Scoped: @scope/foo → @scope/create-foo
      const slashIdx = token.indexOf('/');
      if (slashIdx !== -1) {
        const scope = token.slice(0, slashIdx);
        const name = token.slice(slashIdx + 1).split('@')[0]; // strip version
        packages.push(`${scope}/create-${name}`);
      }
    } else {
      // Unscoped: foo → create-foo
      const name = token.split('@')[0]; // strip version
      packages.push(`create-${name}`);
    }

    // Only the first non-flag token is the initializer
    break;
  }

  return packages.length > 0 ? packages : null;
}

/**
 * Extract package tokens from an argument string.
 * Skips flags (starting with -) and local paths (., /, ~).
 */
function extractPackageTokens(argString) {
  const tokens = argString.split(/\s+/).filter(Boolean);
  const packages = [];

  for (const token of tokens) {
    if (token.startsWith('-')) continue;
    if (isLocalPath(token)) continue;
    packages.push(token);
  }

  return packages;
}

/**
 * Check if a token looks like a local file path.
 */
function isLocalPath(token) {
  return token.startsWith('.') || token.startsWith('/') || token.startsWith('~');
}

module.exports = {
  parseInstallPackages,
  splitShellCommands,
  stripEnvVars,
};
