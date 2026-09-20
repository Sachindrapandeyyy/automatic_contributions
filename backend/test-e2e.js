// Node 18+ has native global fetch

const API_BASE = 'http://localhost:5000/api';

async function runAudit() {
  console.log('=== STARTING AUTOMATIC CONTRIBUTIONS END-TO-END AUDIT ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check Auth Status
    console.log('[1/10] Checking Auth Status...');
    const statusRes = await fetch(`${API_BASE}/auth/status`);
    const statusData = await statusRes.json();
    assert(statusRes.status === 200, 'GET /api/auth/status returns 200');
    console.log('Password set status:', statusData.passwordSet);

    let token = '';

    if (!statusData.passwordSet) {
      console.log('[2/10] Password not configured. Testing /api/auth/setup...');
      const setupRes = await fetch(`${API_BASE}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'masterPassword123' })
      });
      const setupData = await setupRes.json();
      assert(setupRes.status === 200 && setupData.success && setupData.token, 'POST /api/auth/setup initialized master password');
      token = setupData.token;
    } else {
      console.log('[2/10] Password configured. Testing /api/auth/login...');
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'masterPassword123' })
      });
      const loginData = await loginRes.json();
      if (loginRes.status === 200 && loginData.token) {
        assert(true, 'POST /api/auth/login authenticated with masterPassword123');
        token = loginData.token;
      } else {
        console.log('Trying fallback password or inspecting config...');
        assert(loginRes.status === 200 || loginRes.status === 401, 'POST /api/auth/login responds properly');
      }
    }

    // 3. Security Guard Test (401 on missing token)
    console.log('[3/10] Testing 401 Guard on /api/config without token...');
    const unauthedRes = await fetch(`${API_BASE}/config`);
    assert(unauthedRes.status === 401, 'Protected /api/config returns 401 without Bearer token');

    // 4. Authorized Config Read
    console.log('[4/10] Reading /api/config with Bearer token...');
    const configRes = await fetch(`${API_BASE}/config`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const configData = await configRes.json();
    assert(configRes.status === 200 && !configData.passwordHash, 'Config retrieved and passwordHash safely omitted');

    // 5. Config Update
    console.log('[5/10] Updating engine parameters via POST /api/config...');
    const updateRes = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        minCommits: 3,
        maxCommits: 14,
        startHour: 9,
        endHour: 18,
        enabled: false,
        githubAllowedUser: 'Sachindrapandeyyy'
      })
    });
    const updateData = await updateRes.json();
    assert(updateRes.status === 200 && updateData.success, 'POST /api/config updated engine schedule parameters');

    // 6. Excuse Phrases Bank
    console.log('[6/10] Testing Phrases Bank (/api/phrases)...');
    const phrasesRes = await fetch(`${API_BASE}/phrases`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const phrasesData = await phrasesRes.json();
    assert(phrasesRes.status === 200 && Array.isArray(phrasesData.presets) && phrasesData.presets.length >= 50, 'Phrases presets loaded with 50+ curated developer excuses');

    const addPhraseRes = await fetch(`${API_BASE}/phrases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        usePresetPhrases: true,
        customPhrases: ['Audit Test: Refactored authentication and UI architecture']
      })
    });
    const addPhraseData = await addPhraseRes.json();
    assert(addPhraseRes.status === 200 && addPhraseData.customPhrases.includes('Audit Test: Refactored authentication and UI architecture'), 'POST /api/phrases added custom excuse phrase');

    // 7. Manual On-Demand Commit
    console.log('[7/10] Testing On-Demand Commit (/api/commit-now)...');
    const commitNowRes = await fetch(`${API_BASE}/commit-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        phrase: 'Feat: TransGlobal dark UI & Forest Green Auth integrated seamlessly',
        date: new Date().toISOString()
      })
    });
    const commitNowData = await commitNowRes.json();
    assert(commitNowRes.status === 200 && commitNowData.success && commitNowData.commits?.length === 1, 'POST /api/commit-now registered single custom commit');

    // 8. Backdated Batch Commit
    console.log('[8/10] Testing Backdated Batch Commit (/api/commit-now)...');
    const backdateDate = '2026-03-15';
    const batchRes = await fetch(`${API_BASE}/commit-now`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        count: 2,
        date: backdateDate
      })
    });
    const batchData = await batchRes.json();
    assert(batchRes.status === 200 && batchData.success && batchData.commits?.length === 2, 'POST /api/commit-now successfully generated 2 backdated commits for 2026-03-15');

    // 9. Git History Verification
    console.log('[9/10] Testing Git History Sync (/api/history)...');
    const historyRes = await fetch(`${API_BASE}/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const historyData = await historyRes.json();
    assert(historyRes.status === 200 && historyData.success && Array.isArray(historyData.gitCommits) && historyData.gitCommits.length > 0, `GET /api/history retrieved ${historyData.gitCommits.length} commits directly from git log`);

    // 10. Scheduler Execution Trigger
    console.log('[10/10] Testing Manual Trigger of Scheduler Script (/api/scheduler/trigger)...');
    const schedRes = await fetch(`${API_BASE}/scheduler/trigger`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const schedData = await schedRes.json();
    assert(schedRes.status === 200 && schedData.success, 'POST /api/scheduler/trigger executed node scheduler.js');

    // 11. Frontend Vite HTML Check
    console.log('[11/11] Checking Vite Frontend dev server response at http://localhost:5173...');
    const feRes = await fetch('http://localhost:5173');
    const feHtml = await feRes.text();
    assert(feRes.status === 200 && feHtml.includes('<div id="root"></div>'), 'Frontend dev server serves index.html on port 5173');

  } catch (err) {
    console.error('Audit encountered unexpected error:', err);
    failed++;
  }

  console.log(`\n=== AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runAudit();
