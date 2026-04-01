#!/usr/bin/env node

// Claude Code PreToolUse hook
// Intercepts Bash tool calls, checks install commands against OSV.dev.
// Exit 0 = allow, exit 0 + deny payload = block

const { checkVulnerabilities, resolvePackage, parseNameVersion } = require('../src/check');
const { isAllowed } = require('../src/allow');
const { parseInstallPackages } = require('../src/parse-command');
const { loadConfig } = require('../src/config');

/**
 * Evaluate a list of packages using the provided resolve, check, and allow functions.
 * Returns an array of issue strings for packages that should be blocked.
 *
 * Flow: allowlist pre-filter → parallel version resolve → allowlist post-filter → single batch OSV check
 *
 * @param {string[]} packages - Package names (optionally with @version)
 * @param {Function} resolveFn - async (pkg) => { name, version }
 * @param {Function} checkVulnsFn - async (Map<name, Set<version>>) => vulnerabilities[]
 * @param {Function} allowFn - (name, version) => boolean
 * @returns {Promise<string[]>} issue descriptions
 */
async function evaluatePackages(packages, resolveFn, checkVulnsFn, allowFn) {
  // Pre-resolve allowlist check: skip packages where name@version is already known and allowed
  const toResolve = [];
  for (const pkg of packages) {
    const { name, version } = parseNameVersion(pkg);
    if (version && allowFn(name, version)) continue;
    if (!version && allowFn(name, null)) continue;
    toResolve.push(pkg);
  }

  if (toResolve.length === 0) return [];

  // Parallel version resolution
  const resolveResults = await Promise.allSettled(toResolve.map((pkg) => resolveFn(pkg)));

  const resolved = [];   // { name, version, originalPkg }
  const issues = [];

  for (let i = 0; i < resolveResults.length; i++) {
    const result = resolveResults[i];
    if (result.status === 'rejected') {
      issues.push(`${toResolve[i]} — could not verify safety: ${result.reason?.message || 'unknown error'}`);
      continue;
    }
    const { name, version } = result.value;

    // Post-resolve allowlist check: skip if name@resolvedVersion is allowed
    if (allowFn(name, version)) continue;

    resolved.push({ name, version, originalPkg: toResolve[i] });
  }

  if (resolved.length === 0) return issues;

  // Build batch map and do single OSV call
  const batchMap = new Map();
  for (const { name, version } of resolved) {
    if (!batchMap.has(name)) batchMap.set(name, new Set());
    batchMap.get(name).add(version);
  }

  let vulnerabilities;
  try {
    vulnerabilities = await checkVulnsFn(batchMap);
  } catch (err) {
    for (const { originalPkg } of resolved) {
      issues.push(`${originalPkg} — could not verify safety: ${err.message || 'unknown error'}`);
    }
    return issues;
  }

  // Map vulnerabilities back to resolved packages
  const vulnsByPkg = new Map();
  for (const v of vulnerabilities) {
    const key = `${v.package}@${v.version}`;
    if (!vulnsByPkg.has(key)) vulnsByPkg.set(key, []);
    vulnsByPkg.get(key).push(v);
  }

  for (const { name, version } of resolved) {
    const key = `${name}@${version}`;
    const pkgVulns = vulnsByPkg.get(key);
    if (pkgVulns && pkgVulns.length > 0) {
      const vulnSummary = pkgVulns
        .map((v) => `  ${v.id}: ${v.summary}`)
        .join('\n');
      issues.push(
        `${name}@${version} — ${pkgVulns.length} known vulnerabilities:\n${vulnSummary}`
      );
    }
  }

  return issues;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  if (data.tool_name !== 'Bash') {
    process.exit(0);
  }

  const config = loadConfig();
  if (!config.enabled) process.exit(0);

  const command = data.tool_input?.command || '';
  const packages = parseInstallPackages(command);

  if (packages.length === 0) {
    process.exit(0);
  }

  const issues = await evaluatePackages(packages, resolvePackage, checkVulnerabilities, isAllowed);

  if (issues.length === 0) {
    process.exit(0);
  }

  // Determine if any issues are connectivity failures vs actual vulnerabilities
  const hasConnectivityIssue = issues.some((i) => i.includes('could not verify safety'));
  const hasVulnerability = issues.some((i) => i.includes('known vulnerabilities'));

  let guidance = '';
  if (hasVulnerability) {
    guidance += 'To allow a package, the user can run: clawndom allow <package>';
  }
  if (hasConnectivityIssue) {
    if (guidance) guidance += '\n';
    guidance += 'Verification failed — retry the install, or the user can run: clawndom config enabled false';
  }
  guidance += '\nRun clawndom --help for all commands.';

  // Block with structured output
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `🦞 Clawndom blocked this install:\n\n${issues.join('\n\n')}\n\n${guidance}`,
    },
  };

  console.log(JSON.stringify(output));
  process.exit(0);
}

if (require.main === module) {
  main().catch(() => process.exit(0));
}

module.exports = { evaluatePackages };
