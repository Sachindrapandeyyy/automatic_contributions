import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { readConfig } from './config-manager.js';

/**
 * Ensures git local configuration is set up in the target repository.
 * @param {string} repoPath 
 */
function ensureGitConfig(repoPath) {
  try {
    const authorName = process.env.GIT_AUTHOR_NAME || process.env.GITHUB_ALLOWED_USER || 'Auto Committer';
    const authorEmail = process.env.GIT_AUTHOR_EMAIL || 'auto-committer@example.com';
    
    execSync(`git config --local user.name "${authorName}"`, { cwd: repoPath });
    execSync(`git config --local user.email "${authorEmail}"`, { cwd: repoPath });
  } catch (configErr) {
    console.error('Failed to configure local Git identity:', configErr.message);
  }
}

/**
 * Checks if target directory is a git repository. If not, initializes it.
 * @param {string} repoPath 
 */
export function ensureRepositoryExists(repoPath) {
  const absolutePath = path.resolve(repoPath);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }

  const gitPath = path.join(absolutePath, '.git');
  if (!fs.existsSync(gitPath)) {
    // Check if we should clone instead of initializing a blank repository
    const config = readConfig();
    if (config.githubRepoName && config.githubUserToken && absolutePath.includes('workspace')) {
      try {
        console.log(`[Auto-Recover] Workspace git directory missing. Auto-cloning ${config.githubRepoName}...`);
        if (fs.existsSync(absolutePath)) {
          fs.rmSync(absolutePath, { recursive: true, force: true });
        }
        const workspaceDir = path.dirname(absolutePath);
        if (!fs.existsSync(workspaceDir)) {
          fs.mkdirSync(workspaceDir, { recursive: true });
        }
        const authedCloneUrl = `https://oauth2:${config.githubUserToken}@github.com/${config.githubRepoName}.git`;
        execSync(`git clone "${authedCloneUrl}" "${absolutePath}"`);
        console.log('[Auto-Recover] Repository cloned successfully.');
        ensureGitConfig(absolutePath);
        return;
      } catch (cloneErr) {
        console.error('[Auto-Recover] Failed to clone repository, falling back to local init:', cloneErr.message);
      }
    }

    console.log(`Initializing new Git repository at: ${absolutePath}`);
    execSync('git init', { cwd: absolutePath });
    try {
      execSync('git branch -M main', { cwd: absolutePath });
    } catch (e) {
      // ignore
    }
    
    // Create initial commit to establish the main branch
    const readmePath = path.join(absolutePath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, '# Auto Committer Target Repository\n\nThis repository is used by the Auto Committer service to simulate daily coding activity.\n');
    }
    
    ensureGitConfig(absolutePath);
    execSync('git add README.md', { cwd: absolutePath });
    
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    const dateStr = now.toISOString();
    execSync('git commit -m "Initial commit - Repository Setup"', {
      cwd: absolutePath,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: dateStr,
        GIT_COMMITTER_DATE: dateStr
      }
    });
  } else {
    ensureGitConfig(absolutePath);
    try {
      const currentBranch = execSync('git branch --show-current', { cwd: absolutePath }).toString().trim();
      if (currentBranch === 'master' || !currentBranch) {
        execSync('git branch -M main', { cwd: absolutePath });
      }
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Queries LLM provider using the user's API key to generate a code change.
 * @param {object} config Config object
 * @returns {object|null} Generated content or null on error
 */
async function generateLLMCommitContent(config) {
  const provider = config.llmProvider;
  const apiKey = config.llmApiKey;
  const model = config.llmModel;
  const language = config.llmLanguage || 'JavaScript';

  if (!provider || provider === 'none' || !apiKey) {
    return null;
  }

  try {
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an automated software engineer. Generate a short, realistic coding change (e.g. a small helper function, validation logic, docstring, or test) in the ${language} language. 
              Output ONLY a raw JSON object with the following keys (no explanation, no markdown blocks, no backticks):
              {
                "filename": "src/patch.${language === 'JavaScript' ? 'js' : 'txt'}",
                "code": "the actual code lines",
                "commitMessage": "A short, professional commit message"
              }`
            }
          ]
        })
      });
      
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      const text = data.choices[0].message.content.trim();
      // Remove any markdown block syntax if the model ignored instructions
      const cleanJson = text.replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
      
    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-20240620',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `You are an automated software engineer. Generate a short, realistic coding change in the ${language} language.
              Output ONLY a raw JSON object with the following keys (no explanation, no markdown backticks):
              {
                "filename": "src/patch.${language === 'JavaScript' ? 'js' : 'txt'}",
                "code": "the actual code lines",
                "commitMessage": "A short, professional commit message"
              }`
            }
          ]
        })
      });
      
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      const text = data.content[0].text.trim();
      const cleanJson = text.replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(cleanJson);
    }
  } catch (err) {
    console.error('LLM generation failed, falling back to presets:', err.message);
    return null;
  }
  return null;
}

/**
 * Performs a single commit using a random phrase and specific timestamp.
 * Supports BYOK LLM code generation.
 * @param {string} repoPath 
 * @param {string} phrase 
 * @param {Date} commitDate 
 * @param {boolean} pushAfterCommit Whether to push to remote immediately
 * @returns {object} Details of the committed state
 */
export async function makeSingleCommit(repoPath, phrase, commitDate, pushAfterCommit = true) {
  const absolutePath = path.resolve(repoPath);
  ensureRepositoryExists(absolutePath);

  const config = readConfig();
  let commitMessage = phrase;
  let filename = 'activity.txt';
  let isLLM = false;
  
  if (config.llmProvider && config.llmProvider !== 'none' && config.llmApiKey) {
    console.log(`Requesting AI commit via ${config.llmProvider}...`);
    const llmContent = await generateLLMCommitContent(config);
    if (llmContent) {
      commitMessage = llmContent.commitMessage || phrase;
      filename = llmContent.filename || 'activity.txt';
      const filePath = path.join(absolutePath, filename);
      
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, llmContent.code || '');
      isLLM = true;
    }
  }

  if (!isLLM) {
    const logFilePath = path.join(absolutePath, filename);
    const dateStr = commitDate.toISOString();
    const logEntry = `[${dateStr}] - ${commitMessage}\n`;
    fs.appendFileSync(logFilePath, logEntry);
  }

  const dateStr = commitDate.toISOString();
  execSync(`git add "${filename}"`, { cwd: absolutePath });
  
  // Commit with custom environment date variables
  execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
    cwd: absolutePath,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: dateStr,
      GIT_COMMITTER_DATE: dateStr
    }
  });

  const commitHash = execSync('git rev-parse HEAD', { cwd: absolutePath }).toString().trim();

  // Push to remote if origin is configured and pushAfterCommit is requested
  if (pushAfterCommit) {
    try {
      const config = readConfig();
      if (config.githubUserToken && config.githubRepoName) {
        const authedUrl = `https://oauth2:${config.githubUserToken}@github.com/${config.githubRepoName}.git`;
        try {
          execSync(`git remote set-url origin "${authedUrl}"`, { cwd: absolutePath });
        } catch (e) {
          try {
            execSync(`git remote add origin "${authedUrl}"`, { cwd: absolutePath });
          } catch (errAdd) {
            // ignore
          }
        }
      }
      const remoteCheck = execSync('git remote', { cwd: absolutePath }).toString().trim();
      if (remoteCheck) {
        const branchName = execSync('git branch --show-current', { cwd: absolutePath }).toString().trim() || 'main';
        console.log(`Pushing commit ${commitHash.substring(0, 7)} to remote: origin/${branchName}...`);
        execSync(`git push -u origin "${branchName}"`, { cwd: absolutePath });
      }
    } catch (pushErr) {
      console.error('Failed to push commit to remote:', pushErr.message);
    }
  }

  return {
    hash: commitHash.substring(0, 7),
    phrase: commitMessage,
    date: dateStr,
    isLLM
  };
}

/**
 * Generates random timestamps distributed across the configured time window of a day.
 * @param {Date} baseDate Date object representing the target day
 * @param {number} count Number of timestamps to generate
 * @param {number} startHour Start hour (0-23)
 * @param {number} endHour End hour (0-23)
 * @returns {Date[]} Sorted list of Date objects
 */
export function generateRandomTimestamps(baseDate, count, startHour = 9, endHour = 18) {
  const timestamps = [];
  const startMs = new Date(baseDate).setHours(startHour, 0, 0, 0);
  const endMs = new Date(baseDate).setHours(endHour, 0, 0, 0);
  const diffMs = endMs - startMs;

  for (let i = 0; i < count; i++) {
    const randomMs = startMs + Math.random() * diffMs;
    timestamps.push(new Date(randomMs));
  }

  // Sort chronologically so commits flow sequentially
  return timestamps.sort((a, b) => a - b);
}

/**
 * Performs multiple commits for a specific date, spreading them randomly across the hour range.
 * Supports BYOK LLM code generation.
 * @param {string} repoPath 
 * @param {string[]} phrases 
 * @param {number} count Number of commits to perform
 * @param {Date} date Target date to assign the commits to
 * @param {number} startHour 
 * @param {number} endHour 
 * @returns {object[]} Details of all commits created
 */
export async function performDailyCommits(repoPath, phrases, count, date = new Date(), startHour = 9, endHour = 18) {
  const absolutePath = path.resolve(repoPath);
  const timestamps = generateRandomTimestamps(date, count, startHour, endHour);
  const results = [];

  for (let i = 0; i < count; i++) {
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    // Make commits, but skip pushing on individual iterations
    const commitResult = await makeSingleCommit(absolutePath, randomPhrase, timestamps[i], false);
    results.push(commitResult);
  }
  // Push the final state once at the end of the batch
  try {
    const config = readConfig();
    if (config.githubUserToken && config.githubRepoName) {
      const authedUrl = `https://oauth2:${config.githubUserToken}@github.com/${config.githubRepoName}.git`;
      try {
        execSync(`git remote set-url origin "${authedUrl}"`, { cwd: absolutePath });
      } catch (e) {
        try {
          execSync(`git remote add origin "${authedUrl}"`, { cwd: absolutePath });
        } catch (errAdd) {
          // ignore
        }
      }
    }
    const remoteCheck = execSync('git remote', { cwd: absolutePath }).toString().trim();
    if (remoteCheck) {
      const branchName = execSync('git branch --show-current', { cwd: absolutePath }).toString().trim() || 'main';
      console.log(`Pushing daily batch of ${count} commits to remote: origin/${branchName}...`);
      execSync(`git push -u origin "${branchName}"`, { cwd: absolutePath });
    }
  } catch (pushErr) {
    console.error('Failed to push daily batch to remote:', pushErr.message);
  }
  return results;
}
