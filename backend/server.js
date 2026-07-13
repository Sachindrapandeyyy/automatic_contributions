import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { readConfig, writeConfig, hashPassword } from './config-manager.js';
import { makeSingleCommit, performDailyCommits, ensureRepositoryExists } from './committer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper to resolve full script path for Task Scheduler
const SCHEDULER_SCRIPT_PATH = path.join(__dirname, 'scheduler.js');

// --- In-Memory Caching Optimization ---
let gitHistoryCache = null;
let lastCachedRepoPath = '';

function clearGitCache() {
  gitHistoryCache = null;
  console.log('Git log cache cleared.');
}

// --- Session Hashing & Verification (HMAC-based, package-free) ---
function generateToken(secret) {
  const timestamp = Date.now();
  const rand = crypto.randomBytes(16).toString('hex');
  const raw = `${timestamp}.${rand}`;
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return `${raw}.${signature}`;
}

function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [timestamp, rand, signature] = parts;
    
    // Check if token is expired (valid for 3 days)
    const age = Date.now() - parseInt(timestamp);
    if (age > 3 * 24 * 60 * 60 * 1000) return false;
    
    const raw = `${timestamp}.${rand}`;
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    return expected === signature;
  } catch (e) {
    return false;
  }
}

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  const config = readConfig();
  
  // If password has not been initialized yet, bypass auth checks
  if (!config.passwordHash) {
    return next();
  }
  
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Authorization token required.' });
  }
  
  const token = authHeader.split(' ')[1];
  if (!verifyToken(token, config.sessionSecret)) {
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
  
  next();
}

// --- Auth Endpoints ---

// Check if a password is set up
app.get('/api/auth/status', (req, res) => {
  const config = readConfig();
  res.json({ passwordSet: !!config.passwordHash });
});

// Configure first-time password
app.post('/api/auth/setup', (req, res) => {
  const { password } = req.body;
  const config = readConfig();
  
  if (config.passwordHash) {
    return res.status(400).json({ error: 'Password already configured. Use login instead.' });
  }
  
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  
  config.passwordHash = hashPassword(password);
  // Re-generate session secret on password reset for security
  config.sessionSecret = crypto.randomBytes(32).toString('hex');
  writeConfig(config);
  
  const token = generateToken(config.sessionSecret);
  res.json({ success: true, token, message: 'Password setup completed successfully.' });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const config = readConfig();
  
  if (!config.passwordHash) {
    return res.status(400).json({ error: 'No password set up. Configure password first.' });
  }
  
  if (!password) {
    return res.status(400).json({ error: 'Password required.' });
  }
  
  const hashed = hashPassword(password);
  if (hashed !== config.passwordHash) {
    return res.status(401).json({ error: 'Invalid password.' });
  }
  
  const token = generateToken(config.sessionSecret);
  res.json({ success: true, token });
});

// GitHub OAuth authentication endpoint
app.post('/api/auth/github', async (req, res) => {
  const { code } = req.body;
  const config = readConfig();

  if (!config.githubClientId || !config.githubClientSecret) {
    return res.status(400).json({ error: 'GitHub OAuth is not configured on this server.' });
  }

  if (!code) {
    return res.status(400).json({ error: 'OAuth code missing.' });
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code
      })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'Git-Auto-Committer-App'
      }
    });

    const userData = await userRes.json();
    if (!userData.login) {
      throw new Error('Failed to retrieve GitHub profile.');
    }

    // 3. Verify user matches authorized user
    const allowedUser = config.githubAllowedUser || 'Sachindrapandeyyy';
    if (userData.login.toLowerCase() !== allowedUser.toLowerCase()) {
      return res.status(403).json({ error: `Unauthorized. Access restricted to owner: ${allowedUser}` });
    }
    config.githubUserToken = accessToken;
    writeConfig(config);

    // 4. Generate and return token
    const token = generateToken(config.sessionSecret);
    res.json({ success: true, token, username: userData.login });
  } catch (err) {
    console.error('GitHub OAuth failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch user's GitHub repositories
app.get('/api/github/repos', authMiddleware, async (req, res) => {
  const config = readConfig();

  if (!config.githubUserToken) {
    return res.status(400).json({ error: 'GitHub is not authenticated. Please log in with GitHub.' });
  }

  try {
    const reposRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `token ${config.githubUserToken}`,
        'User-Agent': 'Git-Auto-Committer-App'
      }
    });

    const reposData = await reposRes.json();
    if (reposRes.status !== 200) {
      throw new Error(reposData.message || 'Failed to fetch repositories.');
    }

    const repos = reposData.map(r => ({
      name: r.name,
      fullName: r.full_name,
      cloneUrl: r.clone_url
    }));

    res.json({ success: true, repos });
  } catch (err) {
    console.error('Fetch repositories failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Protected Scheduler Task Helpers ---
function registerWindowsTask() {
  try {
    let nodePath = 'node';
    try {
      nodePath = execSync('where node').toString().split('\r\n')[0].trim();
    } catch (e) {
      console.log('Unable to locate absolute node path using "where", falling back to default "node".');
    }

    const cmd = `schtasks /create /tn "GitAutoCommitter" /tr "\\"${nodePath}\\" \\"${SCHEDULER_SCRIPT_PATH}\\"" /sc daily /st 10:00 /f`;
    console.log(`Executing scheduler registration: ${cmd}`);
    execSync(cmd);
    return { success: true, message: 'Windows Task Scheduler task successfully registered.' };
  } catch (err) {
    console.error('Failed to register Windows Task Scheduler task:', err.message);
    return { success: false, error: err.message };
  }
}

function unregisterWindowsTask() {
  try {
    const cmd = `schtasks /delete /tn "GitAutoCommitter" /f`;
    console.log(`Executing scheduler deletion: ${cmd}`);
    execSync(cmd);
    return { success: true, message: 'Windows Task Scheduler task successfully removed.' };
  } catch (err) {
    console.log('Task delete call executed. Task may not have existed.', err.message);
    return { success: true, message: 'Task removed or was not present.' };
  }
}

function checkTaskStatus() {
  try {
    execSync('schtasks /query /tn "GitAutoCommitter"', { stdio: 'ignore' });
    return { registered: true };
  } catch (e) {
    return { registered: false };
  }
}

// --- Protected App Endpoints ---
app.get('/api/config', authMiddleware, (req, res) => {
  const config = readConfig();
  const taskStatus = checkTaskStatus();
  
  // Omit secrets from API response for security
  const safeConfig = { ...config };
  delete safeConfig.passwordHash;
  delete safeConfig.sessionSecret;
  if (safeConfig.llmApiKey) {
    safeConfig.llmApiKey = safeConfig.llmApiKey.substring(0, 7) + '...';
  }
  if (safeConfig.githubClientSecret) {
    safeConfig.githubClientSecret = safeConfig.githubClientSecret.substring(0, 7) + '...';
  }
  
  res.json({ ...safeConfig, schedulerRegistered: taskStatus.registered });
});

app.post('/api/config', authMiddleware, (req, res) => {
  const newConfig = req.body;
  const currentConfig = readConfig();

  // If password changes, hash it
  if (newConfig.password) {
    newConfig.passwordHash = hashPassword(newConfig.password);
    newConfig.sessionSecret = crypto.randomBytes(32).toString('hex');
    delete newConfig.password;
  }

  // Preserve API key if it's sent as masked
  if (newConfig.llmApiKey && newConfig.llmApiKey.endsWith('...')) {
    newConfig.llmApiKey = currentConfig.llmApiKey;
  }

  // Preserve githubClientSecret if it's sent as masked
  if (newConfig.githubClientSecret && newConfig.githubClientSecret.endsWith('...')) {
    newConfig.githubClientSecret = currentConfig.githubClientSecret;
  }

  // Merge updates
  const updatedConfig = {
    ...currentConfig,
    ...newConfig
  };

  // Handle Auto-Cloning to internal workspace on repository change
  if (updatedConfig.githubRepoName && updatedConfig.githubUserToken) {
    const targetRepoPath = path.join(__dirname, 'workspace', updatedConfig.githubRepoName.replace('/', '-'));
    updatedConfig.repoPath = targetRepoPath;

    if (!fs.existsSync(path.join(targetRepoPath, '.git'))) {
      try {
        console.log(`Auto-cloning repository ${updatedConfig.githubRepoName} into workspace...`);
        const workspaceDir = path.dirname(targetRepoPath);
        if (!fs.existsSync(workspaceDir)) {
          fs.mkdirSync(workspaceDir, { recursive: true });
        }
        
        if (fs.existsSync(targetRepoPath)) {
          fs.rmSync(targetRepoPath, { recursive: true, force: true });
        }
        
        const authedCloneUrl = `https://oauth2:${updatedConfig.githubUserToken}@github.com/${updatedConfig.githubRepoName}.git`;
        execSync(`git clone "${authedCloneUrl}" "${targetRepoPath}"`);
        console.log('Repository cloned successfully.');
      } catch (cloneErr) {
        console.error('Failed to clone repository:', cloneErr.message);
        return res.status(500).json({ success: false, error: `Failed to clone repository: ${cloneErr.message}` });
      }
    }
  }

  // If enabled status changed, update Task Scheduler
  let schedulerMsg = '';
  if (updatedConfig.enabled !== currentConfig.enabled) {
    if (updatedConfig.enabled) {
      const reg = registerWindowsTask();
      schedulerMsg = reg.success ? reg.message : `Warning: Scheduler config saved but failed to register Task: ${reg.error}`;
    } else {
      const unreg = unregisterWindowsTask();
      schedulerMsg = unreg.message;
    }
  } else if (updatedConfig.enabled) {
    registerWindowsTask();
  }

  writeConfig(updatedConfig);
  clearGitCache(); // Invalidate cache in case repoPath changed
  
  // Omit secrets
  const safeConfig = { ...updatedConfig };
  delete safeConfig.passwordHash;
  delete safeConfig.sessionSecret;
  if (safeConfig.llmApiKey) {
    safeConfig.llmApiKey = safeConfig.llmApiKey.substring(0, 7) + '...';
  }
  if (safeConfig.githubClientSecret) {
    safeConfig.githubClientSecret = safeConfig.githubClientSecret.substring(0, 7) + '...';
  }

  res.json({ success: true, config: safeConfig, schedulerMessage: schedulerMsg });
});

app.get('/api/phrases', authMiddleware, (req, res) => {
  const config = readConfig();
  let presets = [];
  try {
    const presetData = fs.readFileSync(path.join(__dirname, 'phrases.json'), 'utf8');
    presets = JSON.parse(presetData);
  } catch (e) {
    console.error('Presets loading failed:', e.message);
  }
  res.json({
    usePresetPhrases: config.usePresetPhrases,
    presets,
    customPhrases: config.customPhrases || []
  });
});

app.post('/api/phrases', authMiddleware, (req, res) => {
  const { usePresetPhrases, customPhrases } = req.body;
  const config = readConfig();

  config.usePresetPhrases = usePresetPhrases !== undefined ? usePresetPhrases : config.usePresetPhrases;
  config.customPhrases = customPhrases || config.customPhrases;

  writeConfig(config);
  res.json({ success: true, usePresetPhrases: config.usePresetPhrases, customPhrases: config.customPhrases });
});

// History endpoint (reads git log with in-memory caching)
app.get('/api/history', authMiddleware, (req, res) => {
  const config = readConfig();
  try {
    ensureRepositoryExists(config.repoPath);
    const absPath = path.resolve(config.repoPath);
    
    // Serve from cache if available and repository matches
    if (gitHistoryCache && lastCachedRepoPath === absPath) {
      return res.json({
        success: true,
        repoPath: absPath,
        gitCommits: gitHistoryCache.gitCommits,
        schedulerHistory: config.history || []
      });
    }

    let gitCommits = [];
    try {
      const gitLogOutput = execSync('git log --pretty=format:"%h|%ai|%s" -n 100', { cwd: absPath }).toString().trim();
      if (gitLogOutput) {
        gitCommits = gitLogOutput.split('\n').map(line => {
          const [hash, date, message] = line.split('|');
          return { hash, date, message };
        });
      }
    } catch (gitErr) {
      console.log('No commits or git log error:', gitErr.message);
    }

    // Populate Cache
    gitHistoryCache = { gitCommits };
    lastCachedRepoPath = absPath;

    res.json({
      success: true,
      repoPath: absPath,
      gitCommits,
      schedulerHistory: config.history || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual execution endpoint (clears cache)
app.post('/api/commit-now', authMiddleware, async (req, res) => {
  const { phrase, date, count } = req.body;
  const config = readConfig();

  try {
    ensureRepositoryExists(config.repoPath);
    
    let results = [];
    const targetDate = date ? new Date(date) : new Date();
    
    let phrasesPool = [];
    if (config.usePresetPhrases) {
      const presetData = fs.readFileSync(path.join(__dirname, 'phrases.json'), 'utf8');
      phrasesPool = JSON.parse(presetData);
    }
    if (config.customPhrases && config.customPhrases.length > 0) {
      phrasesPool = phrasesPool.concat(config.customPhrases);
    }
    if (phrasesPool.length === 0) {
      phrasesPool = ['Manual on-demand commit'];
    }

    if (phrase) {
      const result = await makeSingleCommit(config.repoPath, phrase, targetDate);
      results.push(result);
    } else {
      const commitCount = count ? parseInt(count) : 1;
      results = await performDailyCommits(
        config.repoPath,
        phrasesPool,
        commitCount,
        targetDate,
        config.startHour,
        config.endHour
      );
    }

    clearGitCache(); // Clear cache so that the new commit is reflected immediately
    res.json({ success: true, commits: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Force scheduler execution trigger (clears cache)
app.post('/api/scheduler/trigger', authMiddleware, (req, res) => {
  try {
    console.log('Manual trigger of scheduler script initiated.');
    const stdout = execSync(`node "${SCHEDULER_SCRIPT_PATH}"`).toString();
    clearGitCache(); // Clear cache to reflect the new scheduler commits
    res.json({ success: true, output: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, output: err.stdout ? err.stdout.toString() : '' });
  }
});

// Start express server
app.listen(PORT, () => {
  console.log(`Git Auto-Committer API running on port ${PORT}`);
});
