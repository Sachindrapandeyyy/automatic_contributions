import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig, writeConfig } from './config-manager.js';
import { performDailyCommits, ensureRepositoryExists } from './committer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPhrases(config) {
  let phrases = [];
  if (config.usePresetPhrases) {
    try {
      const presetData = fs.readFileSync(path.join(__dirname, 'phrases.json'), 'utf8');
      phrases = JSON.parse(presetData);
    } catch (e) {
      console.error('Failed to load preset phrases:', e.message);
    }
  }
  
  if (config.customPhrases && config.customPhrases.length > 0) {
    phrases = phrases.concat(config.customPhrases);
  }
  
  if (phrases.length === 0) {
    phrases = ['Refined project architecture and resolved minor warnings'];
  }
  
  return phrases;
}

function getDaysBetween(date1, date2) {
  const d1 = new Date(date1);
  d1.setHours(0, 0, 0, 0);
  const d2 = new Date(date2);
  d2.setHours(0, 0, 0, 0);
  
  const diffTime = Math.abs(d2 - d1);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

async function run() {
  console.log(`[${new Date().toISOString()}] Starting Auto-Committer Scheduled Run...`);
  const config = readConfig();

  if (!config.enabled) {
    console.log('Auto-Committer is currently disabled in configuration. Exiting.');
    return;
  }

  ensureRepositoryExists(config.repoPath);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const phrases = loadPhrases(config);
  
  // Calculate if we need to run for today and/or missed days
  const lastRun = config.lastRunDate ? new Date(config.lastRunDate) : null;
  
  if (lastRun) {
    const lastRunStr = lastRun.toISOString().split('T')[0];
    if (lastRunStr === todayStr) {
      console.log('Auto-Committer has already run for today. Exiting.');
      return;
    }

    const missedDays = getDaysBetween(lastRun, today) - 1;
    if (missedDays > 0) {
      console.log(`Detected ${missedDays} missed day(s) since last run on ${lastRunStr}. Backfilling...`);
      for (let i = missedDays; i > 0; i--) {
        const targetDate = new Date();
        targetDate.setDate(today.getDate() - i);
        
        // Roll random count for the missed day
        const min = parseInt(config.minCommits) || 1;
        const max = parseInt(config.maxCommits) || 15;
        const count = Math.floor(Math.random() * (max - min + 1)) + min;

        console.log(`Backfilling ${count} commits for ${targetDate.toISOString().split('T')[0]}...`);
        const results = await performDailyCommits(
          config.repoPath,
          phrases,
          count,
          targetDate,
          config.startHour,
          config.endHour
        );
        
        config.history.push({
          date: targetDate.toISOString().split('T')[0],
          commitsCount: count,
          backfilled: true,
          commits: results
        });
      }
    }
  }

  // Execute for today
  const min = parseInt(config.minCommits) || 1;
  const max = parseInt(config.maxCommits) || 15;
  const count = Math.floor(Math.random() * (max - min + 1)) + min;

  console.log(`Executing ${count} randomized commits for today (${todayStr})...`);
  const todayResults = await performDailyCommits(
    config.repoPath,
    phrases,
    count,
    today,
    config.startHour,
    config.endHour
  );

  config.history.push({
    date: todayStr,
    commitsCount: count,
    backfilled: false,
    commits: todayResults
  });

  // Maintain logs size
  if (config.history.length > 365) {
    config.history = config.history.slice(-365);
  }

  config.lastRunDate = today.toISOString();
  writeConfig(config);
  console.log('Scheduled execution completed successfully.');
}

run();
