const BATCH_SIZE = 1000;
const OSV_BATCH_API = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_API = 'https://api.osv.dev/v1/vulns';
const NPM_REGISTRY = 'https://registry.npmjs.org';

async function checkVulnerabilities(packages) {
  const queries = [];
  const queryIndex = [];

  for (const [name, versions] of packages) {
    for (const version of versions) {
      queries.push({ package: { name, ecosystem: 'npm' }, version });
      queryIndex.push({ name, version });
    }
  }

  if (queries.length === 0) return [];

  const results = [];

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    const batchIdx = queryIndex.slice(i, i + BATCH_SIZE);

    let response;
    try {
      response = await fetch(OSV_BATCH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: batch }),
      });
    } catch (err) {
      throw new Error(`Failed to reach OSV.dev API: ${err.message}`);
    }

    if (!response.ok) {
      throw new Error(`OSV.dev API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.results) continue;

    for (let j = 0; j < data.results.length; j++) {
      const entry = data.results[j];
      if (!entry.vulns || entry.vulns.length === 0) continue;

      const { name, version } = batchIdx[j];

      const DETAIL_FETCH_CAP = 25;
      const needsDetail = entry.vulns.filter((v) => !v.summary || !v.severity?.length);
      const hasDetail = entry.vulns.filter((v) => v.summary && v.severity?.length);

      const detailPromises = needsDetail.slice(0, DETAIL_FETCH_CAP).map(async (vuln) => {
        try {
          const r = await fetch(`${OSV_VULN_API}/${vuln.id}`);
          return r.ok ? await r.json() : vuln;
        } catch {
          return vuln;
        }
      });

      const fetched = await Promise.all(detailPromises);
      const allVulns = [...hasDetail, ...fetched, ...needsDetail.slice(DETAIL_FETCH_CAP)];

      for (const detail of allVulns) {
        results.push({
          package: name,
          version,
          id: detail.id,
          summary: detail.summary || 'No description available',
          severity: extractSeverity(detail),
          aliases: detail.aliases || [],
          url: `https://osv.dev/vulnerability/${detail.id}`,
        });
      }
    }
  }

  return deduplicateVulns(results);
}

function parseNameVersion(nameWithVersion) {
  let name, version;

  const lastAt = nameWithVersion.lastIndexOf('@');
  if (lastAt > 0) {
    const possibleVersion = nameWithVersion.slice(lastAt + 1);
    if (/^\d/.test(possibleVersion)) {
      name = nameWithVersion.slice(0, lastAt);
      version = possibleVersion;
    } else {
      name = nameWithVersion;
      version = null;
    }
  } else {
    name = nameWithVersion;
    version = null;
  }

  return { name, version };
}

async function resolvePackage(nameWithVersion) {
  const { name, version } = parseNameVersion(nameWithVersion);
  const resolvedVersion = version || (await resolveLatestVersion(name));
  return { name, version: resolvedVersion };
}

async function resolveLatestVersion(name) {
  let response;
  try {
    response = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(name)}/latest`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    throw new Error(`Failed to reach npm registry: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Package "${name}" not found on npm`);
    }
    throw new Error(`npm registry returned ${response.status} for "${name}"`);
  }

  const data = await response.json();
  if (!data.version) {
    throw new Error(`Could not determine latest version of "${name}"`);
  }

  return data.version;
}

function extractSeverity(vuln) {
  if (vuln.database_specific && vuln.database_specific.severity) {
    return vuln.database_specific.severity.toUpperCase();
  }

  if (vuln.severity && vuln.severity.length > 0) {
    for (const s of vuln.severity) {
      if (s.type === 'CVSS_V3' && s.score) {
        return cvssToLabel(s.score);
      }
    }
  }

  return 'UNKNOWN';
}

function cvssToLabel(cvssVector) {
  if (typeof cvssVector === 'number') {
    if (cvssVector >= 9.0) return 'CRITICAL';
    if (cvssVector >= 7.0) return 'HIGH';
    if (cvssVector >= 4.0) return 'MODERATE';
    return 'LOW';
  }

  const str = cvssVector.toUpperCase();
  if (str.includes('/C:H') && str.includes('/I:H') && str.includes('/A:H')) return 'CRITICAL';
  if (str.includes('/C:H') || str.includes('/I:H')) return 'HIGH';
  if (str.includes('/C:L') || str.includes('/I:L')) return 'MODERATE';
  return 'LOW';
}

function deduplicateVulns(vulns) {
  const seen = new Set();
  return vulns.filter((v) => {
    const key = `${v.id}|${v.package}@${v.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { checkVulnerabilities, resolvePackage, parseNameVersion };
