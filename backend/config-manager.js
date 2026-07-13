import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  repoPath: 'C:\\Users\\Sachi\\.gemini\\antigravity\\scratch\\git-auto-committer\\target-repo',
  minCommits: 1,
  maxCommits: 15,
  startHour: 9,
  endHour: 18,
  enabled: false,
  usePresetPhrases: true,
  customPhrases: [],
  lastRunDate: null,
  history: [], // internal log of scheduler operations
  passwordHash: null, // SHA-256 hashed password
  sessionSecret: crypto.randomBytes(32).toString('hex'), // generated key for JWT-like token signing
  llmProvider: 'none', // none, openai, anthropic
  llmApiKey: '', // user's personal API key
  llmModel: '', // e.g. gpt-4o-mini, claude-3-5-sonnet
  llmLanguage: 'JavaScript' // target language for code patches
};

export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      writeConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(data);
    // Merge with defaults in case of missing keys
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    console.error('Error reading config file, using defaults:', err.message);
    return DEFAULT_CONFIG;
  }
}

export function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing config file:', err.message);
  }
}
