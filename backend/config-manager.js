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
  llmLanguage: 'JavaScript', // target language for code patches
  githubClientId: '', // GitHub OAuth App Client ID
  githubClientSecret: '', // GitHub OAuth App Client Secret
  githubAllowedUser: 'Sachindrapandeyyy', // Authorized GitHub Username
  githubUserToken: '', // Logged in user's GitHub OAuth Access Token
  githubRepoName: '', // Selected repo name
  githubRepoCloneUrl: '' // Selected repo clone URL
};

export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function readConfig() {
  let config = { ...DEFAULT_CONFIG };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(data);
      config = { ...config, ...parsed };
    }
  } catch (err) {
    console.error('Error reading config file, using defaults:', err.message);
  }

  // Override/fallback to environment variables for production hosting compatibility (Render/Railway)
  if (process.env.PASSWORD_HASH) config.passwordHash = process.env.PASSWORD_HASH;
  if (process.env.SESSION_SECRET) config.sessionSecret = process.env.SESSION_SECRET;
  
  if (process.env.GITHUB_CLIENT_ID) config.githubClientId = process.env.GITHUB_CLIENT_ID;
  if (process.env.GITHUB_CLIENT_SECRET) config.githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (process.env.GITHUB_ALLOWED_USER) config.githubAllowedUser = process.env.GITHUB_ALLOWED_USER;
  
  if (process.env.GITHUB_USER_TOKEN) config.githubUserToken = process.env.GITHUB_USER_TOKEN;
  if (process.env.GITHUB_REPO_NAME) config.githubRepoName = process.env.GITHUB_REPO_NAME;
  if (process.env.GITHUB_REPO_CLONE_URL) config.githubRepoCloneUrl = process.env.GITHUB_REPO_CLONE_URL;
  
  if (process.env.LLM_PROVIDER) config.llmProvider = process.env.LLM_PROVIDER;
  if (process.env.LLM_API_KEY) config.llmApiKey = process.env.LLM_API_KEY;
  if (process.env.LLM_MODEL) config.llmModel = process.env.LLM_MODEL;
  if (process.env.LLM_LANGUAGE) config.llmLanguage = process.env.LLM_LANGUAGE;

  return config;
}

export function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing config file:', err.message);
  }
}
