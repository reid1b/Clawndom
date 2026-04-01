const fs = require('fs');
const path = require('path');
const os = require('os');

const ALLOW_FILE = path.join(os.homedir(), '.clawndom', 'allow.json');

function loadAllowlist() {
  try {
    if (!fs.existsSync(ALLOW_FILE)) return { packages: [] };
    return JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf-8'));
  } catch {
    return { packages: [] };
  }
}

function saveAllowlist(allowlist) {
  const dir = path.dirname(ALLOW_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ALLOW_FILE, JSON.stringify(allowlist, null, 2) + '\n');
}

function isAllowed(name, version) {
  const allowlist = loadAllowlist();
  return allowlist.packages.some(
    (entry) => entry === name || entry === `${name}@${version}`
  );
}

function addToAllowlist(nameWithVersion) {
  const allowlist = loadAllowlist();
  if (!allowlist.packages.includes(nameWithVersion)) {
    allowlist.packages.push(nameWithVersion);
    saveAllowlist(allowlist);
  }
}

function removeFromAllowlist(nameWithVersion) {
  const allowlist = loadAllowlist();
  allowlist.packages = allowlist.packages.filter((e) => e !== nameWithVersion);
  saveAllowlist(allowlist);
}

function listAllowlist() {
  return loadAllowlist().packages;
}

module.exports = { isAllowed, addToAllowlist, removeFromAllowlist, listAllowlist, ALLOW_FILE };
