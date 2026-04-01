// Configuration management for Clawndom.
// Stores config in ~/.clawndom/config.json.

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.clawndom');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  enabled: true,
};

const VALID_KEYS = Object.keys(DEFAULTS);

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

function getConfig(key) {
  const config = loadConfig();
  if (key) return config[key];
  return config;
}

function setConfig(key, value) {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`Unknown config key: ${key}. Valid keys: ${VALID_KEYS.join(', ')}`);
  }

  const config = loadConfig();

  // Parse boolean values
  if (typeof DEFAULTS[key] === 'boolean') {
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else throw new Error(`${key} must be true or false`);
  }

  config[key] = value;
  saveConfig(config);
  return config;
}

module.exports = { loadConfig, saveConfig, getConfig, setConfig, CONFIG_FILE, VALID_KEYS };
