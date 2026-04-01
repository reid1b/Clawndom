const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePackages } = require('../bin/hook');

describe('evaluatePackages', () => {
  // Helper: mock resolveFn that parses name@version or defaults to 1.0.0
  function mockResolve(pkg) {
    const lastAt = pkg.lastIndexOf('@');
    if (lastAt > 0) {
      const name = pkg.slice(0, lastAt);
      const version = pkg.slice(lastAt + 1);
      if (/^\d/.test(version)) return Promise.resolve({ name, version });
    }
    return Promise.resolve({ name: pkg, version: '1.0.0' });
  }

  // Helper: mock checkVulnsFn that returns no vulnerabilities
  function cleanCheckVulns() {
    return Promise.resolve([]);
  }

  // Helper: mock checkVulnsFn that returns vulnerabilities for every package
  function vulnCheckVulns(packages) {
    const results = [];
    for (const [name, versions] of packages) {
      for (const version of versions) {
        results.push({
          package: name,
          version,
          id: 'GHSA-1234',
          summary: 'Test vulnerability',
          severity: 'HIGH',
          aliases: [],
          url: 'https://osv.dev/vulnerability/GHSA-1234',
        });
      }
    }
    return Promise.resolve(results);
  }

  // Helper: mock resolveFn that throws
  function failingResolve() {
    return Promise.reject(new Error('Network error'));
  }

  // Helper: allowFn that allows nothing
  function allowNone() {
    return false;
  }

  // Helper: allowFn that allows everything
  function allowAll() {
    return true;
  }

  it('returns no issues for clean packages', async () => {
    const issues = await evaluatePackages(
      ['express', 'lodash'], mockResolve, cleanCheckVulns, allowNone
    );
    assert.deepStrictEqual(issues, []);
  });

  it('returns issues for vulnerable packages not on allowlist', async () => {
    const issues = await evaluatePackages(
      ['express'], mockResolve, vulnCheckVulns, allowNone
    );
    assert.equal(issues.length, 1);
    assert.ok(issues[0].includes('express'));
    assert.ok(issues[0].includes('GHSA-1234'));
  });

  it('skips vulnerable packages that are on the allowlist', async () => {
    const issues = await evaluatePackages(
      ['express'], mockResolve, vulnCheckVulns, allowAll
    );
    assert.deepStrictEqual(issues, []);
  });

  it('blocks when resolveFn throws', async () => {
    const issues = await evaluatePackages(
      ['express'], failingResolve, cleanCheckVulns, allowNone
    );
    assert.equal(issues.length, 1);
    assert.ok(issues[0].includes('could not verify safety'));
    assert.ok(issues[0].includes('Network error'));
  });

  it('blocks when checkVulnsFn throws', async () => {
    function failingCheckVulns() {
      return Promise.reject(new Error('OSV down'));
    }
    const issues = await evaluatePackages(
      ['express'], mockResolve, failingCheckVulns, allowNone
    );
    assert.equal(issues.length, 1);
    assert.ok(issues[0].includes('could not verify safety'));
    assert.ok(issues[0].includes('OSV down'));
  });

  it('handles mix of clean and vulnerable packages', async () => {
    function selectiveCheckVulns(packages) {
      const results = [];
      for (const [name, versions] of packages) {
        if (name === 'bad-pkg') {
          for (const version of versions) {
            results.push({
              package: name,
              version,
              id: 'GHSA-1234',
              summary: 'Test vulnerability',
              severity: 'HIGH',
              aliases: [],
              url: 'https://osv.dev/vulnerability/GHSA-1234',
            });
          }
        }
      }
      return Promise.resolve(results);
    }

    const issues = await evaluatePackages(
      ['clean-pkg', 'bad-pkg'], mockResolve, selectiveCheckVulns, allowNone
    );
    assert.equal(issues.length, 1);
    assert.ok(issues[0].includes('bad-pkg'));
  });

  it('returns empty array for empty package list', async () => {
    const issues = await evaluatePackages(
      [], mockResolve, cleanCheckVulns, allowNone
    );
    assert.deepStrictEqual(issues, []);
  });

  it('skips pre-resolve allowlisted packages with explicit version', async () => {
    let resolveCallCount = 0;
    function countingResolve(pkg) {
      resolveCallCount++;
      return mockResolve(pkg);
    }

    function allowExpress(name) {
      return name === 'express';
    }

    const issues = await evaluatePackages(
      ['express@4.17.1', 'lodash@4.17.21'], countingResolve, vulnCheckVulns, allowExpress
    );
    // express should be skipped pre-resolve, only lodash resolved
    assert.equal(resolveCallCount, 1);
    assert.equal(issues.length, 1);
    assert.ok(issues[0].includes('lodash'));
  });

  it('resolves in parallel', async () => {
    const timestamps = [];
    async function timedResolve(pkg) {
      timestamps.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return mockResolve(pkg);
    }

    await evaluatePackages(
      ['a', 'b', 'c'], timedResolve, cleanCheckVulns, allowNone
    );
    // All three should start near-simultaneously (within 30ms of each other)
    assert.equal(timestamps.length, 3);
    const spread = timestamps[timestamps.length - 1] - timestamps[0];
    assert.ok(spread < 30, `Resolves should be parallel, but spread was ${spread}ms`);
  });
});
