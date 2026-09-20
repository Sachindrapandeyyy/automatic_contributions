import React, { useState, useEffect, useMemo, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' && window.location.port === '5000' ? '/api' : 'http://localhost:5000/api');

export default function App() {
  // --- Authentication States ---
  const [token, setToken] = useState(localStorage.getItem('git_committer_token') || '');
  const [isPasswordSet, setIsPasswordSet] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [activeAuthStep, setActiveAuthStep] = useState(1);

  // --- Core Engine States ---
  const [config, setConfig] = useState({
    repoPath: '',
    minCommits: 1,
    maxCommits: 15,
    startHour: 9,
    endHour: 18,
    enabled: false,
    usePresetPhrases: true,
    customPhrases: [],
    schedulerRegistered: false,
    lastRunDate: null,
    llmProvider: 'none',
    llmApiKey: '',
    llmModel: 'gpt-4o-mini',
    llmLanguage: 'JavaScript',
    githubClientId: '',
    githubClientSecret: '',
    githubAllowedUser: 'Sachindrapandeyyy',
    githubUserToken: '',
    githubRepoName: ''
  });

  const [gitCommits, setGitCommits] = useState([]);
  const [phrases, setPhrases] = useState({ presets: [], customPhrases: [], usePresetPhrases: true });
  const [newCustomPhrase, setNewCustomPhrase] = useState('');
  const [phraseSearch, setPhraseSearch] = useState('');
  const [logs, setLogs] = useState([]);
  const [committing, setCommitting] = useState(false);
  const [triggeringScheduler, setTriggeringScheduler] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('week');

  // --- GitHub Repos Dropdown ---
  const [userRepos, setUserRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // --- Modals States ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPhrasesModal, setShowPhrasesModal] = useState(false);
  const [showManualCommitModal, setShowManualCommitModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showTerminalOverlay, setShowTerminalOverlay] = useState(false);

  // --- Manual Commit Form States ---
  const [manualCount, setManualCount] = useState(1);
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualPhraseInput, setManualPhraseInput] = useState('');

  // Logging & Toast
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-90), { timestamp, message, type }]);
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3400);
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem('git_committer_token');
    setToken('');
    setIsLoggedIn(false);
    showToast('Session locked.');
  }, []);

  // Auth fetch wrapper
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      handleLogout();
      throw new Error('Session expired. Please log in again.');
    }
    return response;
  }, [token, handleLogout]);

  const fetchData = useCallback(async (initial = false) => {
    try {
      if (initial) addLog('Synchronizing with GitGlobal engine...', 'info');

      const configRes = await authFetch(`${API_BASE}/config`);
      const configData = await configRes.json();
      setConfig(configData);

      const phrasesRes = await authFetch(`${API_BASE}/phrases`);
      const phrasesData = await phrasesRes.json();
      setPhrases(phrasesData);

      const historyRes = await authFetch(`${API_BASE}/history`);
      const historyData = await historyRes.json();
      if (historyData.success) {
        setGitCommits(historyData.gitCommits || []);
      }
    } catch (err) {
      addLog(`Sync issue: ${err.message}`, 'error');
    }
  }, [authFetch]);

  // --- Initial Auth Check & OAuth Callback ---
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code) {
          setOauthLoading(true);
          window.history.replaceState({}, document.title, window.location.pathname);
          const res = await fetch(`${API_BASE}/auth/github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          const data = await res.json();
          if (data.success && data.token) {
            localStorage.setItem('git_committer_token', data.token);
            setToken(data.token);
            setIsLoggedIn(true);
            showToast(`Welcome back, ${data.username || 'Developer'}!`);
          } else {
            setAuthError(data.error || 'GitHub Authentication failed');
          }
          setOauthLoading(false);
          setCheckingAuth(false);
          return;
        }

        const statusRes = await fetch(`${API_BASE}/auth/status`);
        const statusData = await statusRes.json();
        setIsPasswordSet(statusData.passwordSet);

        if (!statusData.passwordSet) {
          setIsLoggedIn(true);
          setCheckingAuth(false);
        } else if (token) {
          try {
            const configRes = await fetch(`${API_BASE}/config`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (configRes.status === 200) {
              setIsLoggedIn(true);
            } else {
              handleLogout();
            }
          } catch {
            handleLogout();
          }
          setCheckingAuth(false);
        } else {
          setCheckingAuth(false);
        }
      } catch (err) {
        console.error('Auth verification failed:', err);
        setCheckingAuth(false);
      }
    };
    checkAuth();
  }, [token, handleLogout]);

  // --- Reset Password for recovery on Localhost ---
  const handleResetPassword = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/reset`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        localStorage.removeItem('git_committer_token');
        setToken('');
        setIsPasswordSet(false);
        setIsLoggedIn(true);
        showToast('Password cleared! Instance unlocked.');
      } else {
        setAuthError(data.error || 'Failed to reset password.');
      }
    } catch (err) {
      setAuthError('Reset failed: ' + err.message);
    }
  };

  // --- Load Dashboard Data periodically ---
  useEffect(() => {
    if (isLoggedIn) {
      fetchData(true);
      const timer = setInterval(() => fetchData(false), 12000);
      return () => clearInterval(timer);
    }
  }, [isLoggedIn, fetchData]);

  // --- Auth Form Submit ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (!isPasswordSet) {
      if (authPassword.length < 6) {
        setAuthError('Password must be at least 6 characters.');
        return;
      }
      if (authConfirmPassword && authPassword !== authConfirmPassword) {
        setAuthError('Passwords do not match.');
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: authPassword })
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('git_committer_token', data.token);
          setToken(data.token);
          setIsPasswordSet(true);
          setIsLoggedIn(true);
          showToast('Master password initialized!');
        } else {
          setAuthError(data.error || 'Setup failed.');
        }
      } catch (err) {
        setAuthError('Connection error: ' + err.message);
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: authPassword })
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('git_committer_token', data.token);
          setToken(data.token);
          setIsLoggedIn(true);
          showToast('Session unlocked.');
        } else {
          setAuthError(data.error || 'Invalid master password.');
        }
      } catch (err) {
        setAuthError('Login failed: ' + err.message);
      }
    }
  };

  // --- GitHub OAuth Trigger ---
  const handleGitHubAuthClick = () => {
    if (config.githubClientId) {
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${config.githubClientId}&scope=repo`;
    } else {
      showToast('GitHub OAuth Client ID not configured. Please use Master Password login.');
      setActiveAuthStep(1);
    }
  };

  // --- Fetch GitHub Repos via PAT ---
  const handleFetchUserRepos = async () => {
    if (!config.githubUserToken) {
      showToast('Please provide a GitHub Personal Access Token (PAT) first.');
      return;
    }
    setLoadingRepos(true);
    try {
      const res = await authFetch(`${API_BASE}/github/repos`);
      const data = await res.json();
      if (data.success && data.repos) {
        setUserRepos(data.repos);
        showToast(`Loaded ${data.repos.length} GitHub repositories.`);
      } else {
        showToast(data.error || 'Failed to fetch repositories.');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      setLoadingRepos(false);
    }
  };

  // --- Manual / Instant Commit Trigger ---
  const handleExecuteManualCommit = async (e) => {
    if (e) e.preventDefault();
    setCommitting(true);
    showToast('Executing automated Git commit...');
    addLog(`Initiating commit sequence (count: ${manualCount})...`, 'info');

    try {
      const res = await authFetch(`${API_BASE}/commit-now`, {
        method: 'POST',
        body: JSON.stringify({
          count: manualCount,
          date: manualDate,
          phrase: manualPhraseInput.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Successfully created ${data.commits?.length || 1} commit(s)!`);
        addLog(`Registered ${data.commits?.length || 1} commit(s) to git log.`, 'success');
        setShowManualCommitModal(false);
        setManualPhraseInput('');
        fetchData(false);
      } else {
        showToast(`Commit error: ${data.error || 'Check repository'}`);
        addLog(`Commit issue: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
      addLog(`Commit failed: ${err.message}`, 'error');
    } finally {
      setCommitting(false);
    }
  };

  // --- Force Scheduler Trigger Script ---
  const handleTriggerSchedulerScript = async () => {
    setTriggeringScheduler(true);
    showToast('Triggering scheduler script execution...');
    addLog('Executing node backend/scheduler.js...', 'info');

    try {
      const res = await authFetch(`${API_BASE}/scheduler/trigger`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast('Scheduler script executed successfully!');
        addLog(`Scheduler output: ${data.output ? data.output.substring(0, 100) : 'Done'}`, 'success');
        fetchData(false);
      } else {
        showToast(`Scheduler warning: ${data.error || 'Execution check needed'}`);
        addLog(`Scheduler error: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
      addLog(`Scheduler trigger failed: ${err.message}`, 'error');
    } finally {
      setTriggeringScheduler(false);
    }
  };

  // --- Save Config Modal ---
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch(`${API_BASE}/config`, {
        method: 'POST',
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Settings saved successfully!');
        addLog('Engine parameters updated.', 'success');
        if (data.schedulerMessage) {
          addLog(data.schedulerMessage, 'info');
        }
        setShowSettingsModal(false);
        setShowAiModal(false);
        fetchData(false);
      } else {
        showToast(data.error || 'Save failed');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  // --- Phrases Management ---
  const handleAddCustomPhrase = async (e) => {
    e.preventDefault();
    if (!newCustomPhrase.trim()) return;
    const updatedCustom = [...(phrases.customPhrases || []), newCustomPhrase.trim()];
    try {
      const res = await authFetch(`${API_BASE}/phrases`, {
        method: 'POST',
        body: JSON.stringify({
          usePresetPhrases: phrases.usePresetPhrases,
          customPhrases: updatedCustom
        })
      });
      const data = await res.json();
      if (data.success) {
        setPhrases(prev => ({ ...prev, customPhrases: updatedCustom }));
        setNewCustomPhrase('');
        showToast('Custom excuse phrase added!');
      }
    } catch (err) {
      showToast('Failed to add phrase: ' + err.message);
    }
  };

  const handleDeleteCustomPhrase = async (indexToDelete) => {
    const updatedCustom = phrases.customPhrases.filter((_, i) => i !== indexToDelete);
    try {
      const res = await authFetch(`${API_BASE}/phrases`, {
        method: 'POST',
        body: JSON.stringify({
          usePresetPhrases: phrases.usePresetPhrases,
          customPhrases: updatedCustom
        })
      });
      const data = await res.json();
      if (data.success) {
        setPhrases(prev => ({ ...prev, customPhrases: updatedCustom }));
        showToast('Phrase removed.');
      }
    } catch (err) {
      showToast('Failed to delete phrase: ' + err.message);
    }
  };

  const handleTogglePresets = async (enabled) => {
    try {
      const res = await authFetch(`${API_BASE}/phrases`, {
        method: 'POST',
        body: JSON.stringify({
          usePresetPhrases: enabled,
          customPhrases: phrases.customPhrases
        })
      });
      const data = await res.json();
      if (data.success) {
        setPhrases(prev => ({ ...prev, usePresetPhrases: enabled }));
        showToast(enabled ? 'Preset excuses enabled' : 'Preset excuses disabled');
      }
    } catch (err) {
      showToast('Failed to toggle: ' + err.message);
    }
  };

  // --- 365-Day Contribution Heatmap Data Calculations ---
  const heatmapData = useMemo(() => {
    const countsByDate = {};
    gitCommits.forEach(c => {
      const d = c.date ? c.date.split('T')[0].split(' ')[0] : '';
      if (d) countsByDate[d] = (countsByDate[d] || 0) + 1;
    });

    const totalDays = 7 * 22; // 154 days representation in grid (7 rows x 22 cols)
    const now = new Date();
    const cells = [];
    const countsList = [];

    for (let i = totalDays - 1; i >= 0; i--) {
      const dayDate = new Date(now);
      dayDate.setDate(now.getDate() - i);
      const iso = dayDate.toISOString().split('T')[0];
      const count = countsByDate[iso] || 0;
      if (count > 0) countsList.push(count);

      let level = 0;
      if (count > 0) {
        if (count >= 5) level = 4;
        else if (count >= 3) level = 3;
        else if (count >= 2) level = 2;
        else level = 1;
      }

      cells.push({
        id: iso,
        date: iso,
        level,
        count
      });
    }

    const minVal = countsList.length > 0 ? Math.min(...countsList) : 1;
    const maxVal = countsList.length > 0 ? Math.max(...countsList) : (config.maxCommits || 15);
    const avgVal = countsList.length > 0
      ? Math.round(countsList.reduce((a, b) => a + b, 0) / countsList.length)
      : Math.round(((config.minCommits || 1) + (config.maxCommits || 15)) / 2);

    return { cells, minVal, maxVal, avgVal };
  }, [gitCommits, config.minCommits, config.maxCommits]);

  const latestCommit = gitCommits[0];

  // Filtered commits for the activity table
  const filteredCommits = useMemo(() => {
    if (activeFilter === 'feat') {
      return gitCommits.filter(c => {
        const msg = (c.message || '').toLowerCase();
        return msg.includes('feat') || msg.includes('add') || msg.includes('implement');
      });
    }
    if (activeFilter === 'fix') {
      return gitCommits.filter(c => {
        const msg = (c.message || '').toLowerCase();
        return msg.includes('fix') || msg.includes('bug') || msg.includes('patch');
      });
    }
    if (activeFilter === 'excuses') {
      return gitCommits.filter(c => {
        const msg = (c.message || '').toLowerCase();
        return !msg.includes('feat') && !msg.includes('fix');
      });
    }
    return gitCommits;
  }, [gitCommits, activeFilter]);

  // Counts for filter pills
  const featCount = useMemo(() => gitCommits.filter(c => {
    const msg = (c.message || '').toLowerCase();
    return msg.includes('feat') || msg.includes('add') || msg.includes('implement');
  }).length, [gitCommits]);
  const fixCount = useMemo(() => gitCommits.filter(c => {
    const msg = (c.message || '').toLowerCase();
    return msg.includes('fix') || msg.includes('bug') || msg.includes('patch');
  }).length, [gitCommits]);
  const excuseCount = useMemo(() => Math.max(0, gitCommits.length - featCount - fixCount), [gitCommits, featCount, fixCount]);

  // Helper avatar URL for user identity
  const avatarUrl = `https://github.com/${config.githubAllowedUser || 'Sachindrapandeyyy'}.png`;

  // ========================================================
  // 1. AUTH / LOGIN VIEW (STRICT CLEAN IMPLEMENTATION)
  // ========================================================
  if (checkingAuth || oauthLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: '#f2795a', fontFamily: 'var(--font-sans)', fontSize: '1.25rem', fontWeight: '700' }}>
        {oauthLoading ? 'Authenticating with GitHub...' : 'Connecting to GitGlobal Services...'}
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="auth-page-wrapper">
        <div className="auth-container">
          {/* Left Pane: Forest Green Mesh Aura */}
          <div className="auth-hero-pane">
            <div className="hero-top-brand">
              <svg className="brand-icon-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <circle cx="12" cy="18" r="3"></circle>
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="18" cy="6" r="3"></circle>
                <path d="M18 9v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
                <path d="M12 12v3"></path>
              </svg>
              <span>GitGlobal</span>
            </div>

            <div className="hero-content">
              <div>
                <h1 className="hero-heading">Get Started<br />with Us</h1>
                <p className="hero-subtext">Complete these steps to secure your instance and automate your daily Git contributions.</p>
              </div>

              {/* 3 Step Cards Row */}
              <div className="hero-steps-row">
                <div className={`step-card ${activeAuthStep === 1 ? 'active' : ''}`} onClick={() => setActiveAuthStep(1)}>
                  <div className={`step-badge ${activeAuthStep === 1 ? 'dark' : 'muted'}`}>1</div>
                  <span className="step-text">Master Password</span>
                </div>

                <div className={`step-card ${activeAuthStep === 2 ? 'active' : ''}`} onClick={() => setActiveAuthStep(2)}>
                  <div className={`step-badge ${activeAuthStep === 2 ? 'dark' : 'muted'}`}>2</div>
                  <span className="step-text">Connect GitHub</span>
                </div>

                <div className={`step-card ${activeAuthStep === 3 ? 'active' : ''}`} onClick={() => setActiveAuthStep(3)}>
                  <div className={`step-badge ${activeAuthStep === 3 ? 'dark' : 'muted'}`}>3</div>
                  <span className="step-text">Schedule Engine</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: Dark Auth Form */}
          <div className="auth-form-pane">
            <div className="form-wrapper">
              <div className="form-header">
                <h2 className="form-title">
                  {activeAuthStep === 1 && (isPasswordSet ? 'Welcome Back' : 'Master Password Setup')}
                  {activeAuthStep === 2 && 'GitHub Connection'}
                  {activeAuthStep === 3 && 'Schedule Overview'}
                </h2>
                <p className="form-subtitle">
                  {activeAuthStep === 1 && (isPasswordSet ? 'Enter your master password to access your Git synchronization hub.' : 'Configure a master password to secure your local auto-committer instance.')}
                  {activeAuthStep === 2 && 'Link your GitHub account or configure Personal Access Token (PAT).'}
                  {activeAuthStep === 3 && 'Configure your automated daily commit target and working hours.'}
                </p>
              </div>

              {authError && (
                <div style={{ color: '#f87171', fontSize: '0.78rem', background: 'rgba(248, 113, 113, 0.1)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(248, 113, 113, 0.3)' }}>
                  {authError}
                </div>
              )}

              {/* STEP 1: PASSWORD AUTHENTICATION */}
              {activeAuthStep === 1 && (
                <>
                  {!isPasswordSet && (
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#93c5fd', fontSize: '0.8rem', lineHeight: '1.4' }}>
                      <strong style={{ color: '#ffffff' }}>Instance is unlocked.</strong> No master password is currently required. You can enter the dashboard directly or set a password below to secure it.
                      <button
                        type="button"
                        className="btn-primary-auth"
                        style={{ marginTop: '0.75rem', background: '#3b82f6', borderColor: '#60a5fa', width: '100%' }}
                        onClick={() => setIsLoggedIn(true)}
                      >
                        Continue to Dashboard (Unlocked) &rarr;
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleAuthSubmit} className="auth-form-fields">
                    <div className="input-group">
                      <label>{isPasswordSet ? 'Master Password' : 'Create Master Password (Optional)'}</label>
                      <div className="password-input-wrapper">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your secure password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          required
                          minLength={6}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="eye-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            {showPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                <line x1="1" y1="1" x2="23" y2="23"></line>
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                      <span className="field-hint">Must be at least 6 characters</span>
                    </div>

                    {!isPasswordSet && (
                      <div className="input-group">
                        <label>Confirm Master Password</label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Re-enter password to confirm"
                          value={authConfirmPassword}
                          onChange={(e) => setAuthConfirmPassword(e.target.value)}
                          required
                          minLength={6}
                        />
                      </div>
                    )}

                    <button type="submit" className="btn-primary-auth">
                      {isPasswordSet ? 'Unlock Dashboard' : 'Save Password & Enter'}
                    </button>

                    {isPasswordSet && (
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          fontSize: '0.76rem',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          marginTop: '0.6rem',
                          width: '100%',
                          textAlign: 'center'
                        }}
                      >
                        Forgot Master Password? Reset Local Instance
                      </button>
                    )}
                  </form>

                  <div className="form-divider">
                    <span>Or sign in with GitHub</span>
                  </div>

                  <button
                    type="button"
                    className="btn-social"
                    style={{ width: '100%' }}
                    onClick={handleGitHubAuthClick}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <span>Sign in with GitHub</span>
                  </button>
                </>
              )}

              {/* STEP 2: GITHUB CONNECTION INFO */}
              {activeAuthStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <button
                    type="button"
                    className="btn-social"
                    style={{ width: '100%', padding: '0.85rem' }}
                    onClick={handleGitHubAuthClick}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <span>Authenticate via GitHub OAuth</span>
                  </button>

                  <div style={{ background: '#121419', border: '1px solid #242630', padding: '0.9rem', borderRadius: '12px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    <span style={{ color: '#ffffff', fontWeight: '700', display: 'block', marginBottom: '4px' }}>Personal Access Token (PAT)</span>
                    You can also link any public or private GitHub repository using a Personal Access Token with the <code style={{ color: '#f2795a' }}>repo</code> scope in the Dashboard settings.
                  </div>

                  <button
                    type="button"
                    className="btn-primary-auth"
                    onClick={() => setActiveAuthStep(1)}
                  >
                    Go Back to Login
                  </button>
                </div>
              )}

              {/* STEP 3: SCHEDULE OVERVIEW */}
              {activeAuthStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: '#121419', border: '1px solid #242630', padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#94a3b8' }}>Daily Target:</span>
                      <span style={{ color: '#ffffff', fontWeight: '700' }}>1 - 15 commits/day</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#94a3b8' }}>Working Window:</span>
                      <span style={{ color: '#ffffff', fontWeight: '700' }}>09:00 - 18:00 (Natural)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#94a3b8' }}>Phrases Bank:</span>
                      <span style={{ color: '#4ade80', fontWeight: '700' }}>50+ Curated Excuses</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary-auth"
                    onClick={() => setActiveAuthStep(1)}
                  >
                    Ready? Unlock Dashboard
                  </button>
                </div>
              )}

              <div className="auth-footer-text">
                <span>Auto-Committer Engine</span>
                <span style={{ color: '#4ade80' }}>● Local Secure Node</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // 2. MAIN DASHBOARD VIEW (AUTHENTIC TRANSGLOBAL UI)
  // ========================================================
  return (
    <div className="dashboard-window">
      {/* 1. Top Navbar */}
      <nav className="top-nav">
        <div className="brand-group">
          <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="18" cy="6" r="3"></circle>
            <path d="M18 9v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
            <path d="M12 12v3"></path>
          </svg>
          <span className="brand-name">GitGlobal</span>
        </div>

        <div className="nav-capsule">
          <button className="nav-pill active">
            <span className="active-orange-dot"></span>
            Auto-Committer
          </button>
          <button className="nav-pill" onClick={() => setShowPhrasesModal(true)}>
            Phrases Bank ({phrases.presets?.length || 50}+)
          </button>
          <button className="nav-pill" onClick={() => setShowSettingsModal(true)}>
            Scheduler & Repo
          </button>
          <button className="nav-pill" onClick={() => setShowAiModal(true)}>
            AI Generator {config.llmProvider !== 'none' ? '●' : ''}
          </button>
          <button className="nav-pill" onClick={() => setShowTerminalOverlay(!showTerminalOverlay)}>
            Sync Logs ({logs.length})
          </button>
        </div>

        <div className="nav-right-group">
          <button className="nav-icon-circle" title="Instant Manual Commit" onClick={() => handleExecuteManualCommit()}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </button>
          <button className="nav-icon-circle has-notify" title="Refresh Git History" onClick={() => fetchData(true)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            <span className="notify-dot"></span>
          </button>
          <div className="user-profile-pill" onClick={handleLogout} title="Click to lock session">
            <img
              className="user-avatar"
              src={avatarUrl}
              alt={config.githubAllowedUser}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://github.com/github.png'; }}
            />
            <div className="user-meta">
              <span className="user-name">{config.githubAllowedUser || 'Sachindrapandeyyy'}</span>
              <span className="user-role">Lock Session</span>
            </div>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" className="chevron-down">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
      </nav>

      {/* 2. Hero Header & 3 Metric Cards */}
      <section className="hero-section">
        <div className="hero-left">
          <h1 className="hero-title">Automatic Git<br />Contributions</h1>
        </div>

        <div className="hero-metric-cards">
          {/* Metric 1: Total Commits */}
          <div className="metric-card">
            <div className="metric-icon-box">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div className="metric-text-group">
              <span className="metric-label">Total Commits</span>
              <div className="metric-value-row">
                <span className="metric-number">{gitCommits.length}</span>
                <span className="trend-badge positive">origin/main ↗</span>
              </div>
            </div>
          </div>

          {/* Metric 2: Daily Target Range */}
          <div className="metric-card">
            <div className="metric-icon-box">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div className="metric-text-group">
              <span className="metric-label">Daily Target</span>
              <div className="metric-value-row">
                <span className="metric-number" style={{ fontSize: '1.45rem' }}>
                  {config.minCommits} - {config.maxCommits}
                </span>
                <span className={`trend-badge ${config.enabled ? 'positive' : 'negative'}`}>
                  {config.enabled ? 'Active ↗' : 'Paused ↘'}
                </span>
              </div>
            </div>
          </div>

          {/* Metric 3: Target Repository */}
          <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => setShowSettingsModal(true)}>
            <div className="metric-icon-box">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 3h15v13H1z"></path>
                <path d="M16 8h4l3 3v5h-7V8z"></path>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
            </div>
            <div className="metric-text-group">
              <span className="metric-label">Target Repository</span>
              <div className="metric-value-row">
                <span
                  className="metric-number"
                  style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}
                  title={config.githubRepoName || 'Local Workspace'}
                >
                  {config.githubRepoName ? config.githubRepoName.split('/').pop() : 'Workspace'}
                </span>
                <span className="trend-badge positive">synced ↗</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Action Context Bar */}
      <section className="action-context-bar">
        <div className="context-left">
          <div className="repo-location-pill" onClick={() => setShowSettingsModal(true)}>
            <div className="pin-icon-wrap">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <div className="repo-location-texts">
              <span className="repo-title-text">{config.githubRepoName || 'Local Workspace'}</span>
              <span className="repo-date-text">
                Today • {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        <div className="context-right">
          <div className="pending-warning">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#f2795a" strokeWidth="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>
              {config.enabled
                ? `Scheduler Active (${String(config.startHour).padStart(2, '0')}:00 - ${String(config.endHour).padStart(2, '0')}:00)`
                : 'Scheduler Paused (Manual triggers active)'}
            </span>
          </div>

          <button className="btn-pill-icon" onClick={() => setShowSettingsModal(true)} title="Engine Parameters">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
          </button>

          <button
            className="btn-pill-secondary"
            onClick={() => {
              const text = `GitGlobal • Contribution Activity Report\nGenerated: ${new Date().toISOString()}\nTarget: ${config.githubRepoName || 'Local Workspace'}\nTotal Commits: ${gitCommits.length}\n\n` +
                gitCommits.map(c => `[${c.hash || 'unknown'}] ${c.message || 'No message'} (${c.date || 'unknown'})`).join('\n');
              const blob = new Blob([text], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `git-contributions-report-${Date.now()}.txt`;
              a.click();
              showToast('Commit activity report downloaded!');
            }}
          >
            Download report
          </button>

          {/* Signature Coral Action Button */}
          <button
            className="btn-pill-coral"
            onClick={() => setShowManualCommitModal(true)}
            disabled={committing}
          >
            {committing ? 'Committing...' : '+ Trigger Commits'}
          </button>
        </div>
      </section>

      {/* 4. Middle Grid: Analytic View, Tracking History, Map Topology */}
      <section className="middle-grid">
        {/* Column 1: Contribution Analytics Heatmap Matrix */}
        <div className="card-analytic-view">
          <div className="card-header-row">
            <h3 className="card-title">Contribution Analytics</h3>
            <div className="timeframe-pills">
              <button className={`tf-btn ${selectedTimeframe === 'day' ? 'active' : ''}`} onClick={() => setSelectedTimeframe('day')}>Day</button>
              <button className={`tf-btn ${selectedTimeframe === 'week' ? 'active' : ''}`} onClick={() => setSelectedTimeframe('week')}>• Week</button>
              <button className={`tf-btn ${selectedTimeframe === 'month' ? 'active' : ''}`} onClick={() => setSelectedTimeframe('month')}>Month</button>
              <button className={`tf-btn ${selectedTimeframe === 'quarter' ? 'active' : ''}`} onClick={() => setSelectedTimeframe('quarter')}>Quarter</button>
              <button className={`tf-btn ${selectedTimeframe === 'year' ? 'active' : ''}`} onClick={() => setSelectedTimeframe('year')}>Year</button>
              <button className={`tf-btn ${selectedTimeframe === 'all' ? 'active' : ''}`} onClick={() => setSelectedTimeframe('all')}>All ↗</button>
            </div>
          </div>

          <div className="analytic-numbers-row">
            <div className="substat-col">
              <div className="substat-val-row">
                <span className="substat-val">{heatmapData.minVal}</span>
                <span className="substat-arr">↗</span>
              </div>
              <span className="substat-lbl">Minimal number</span>
            </div>
            <div className="substat-col">
              <div className="substat-val-row">
                <span className="substat-val">{heatmapData.avgVal}</span>
                <span className="substat-arr">↗</span>
              </div>
              <span className="substat-lbl">Average number</span>
            </div>
            <div className="substat-col">
              <div className="substat-val-row">
                <span className="substat-val">{heatmapData.maxVal}</span>
                <span className="substat-arr">↗</span>
              </div>
              <span className="substat-lbl">Maximum number</span>
            </div>
          </div>

          {/* Real Contribution Heatmap Matrix */}
          <div className="heatmap-matrix-wrapper">
            <div className="heatmap-day-labels">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
            <div className="heatmap-tiles-grid">
              {heatmapData.cells.map((cell, idx) => (
                <div
                  key={idx}
                  className={`heat-tile heat-level-${cell.level}`}
                  title={`${cell.date}: ${cell.count} commit(s)`}
                  onClick={() => {
                    setManualDate(cell.date);
                    setShowManualCommitModal(true);
                    showToast(`Selected date: ${cell.date}`);
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: Tracking History Card */}
        <div className="card-tracking-history">
          <div className="card-header-row">
            <h3 className="card-title">Revision History</h3>
            <button className="btn-dots-menu" onClick={() => setShowSettingsModal(true)}>•••</button>
          </div>

          <div className="tracking-id-row">
            <div>
              <span className="tracking-id-label">Latest Commit Revision</span>
              <h4 className="tracking-id-value">
                {latestCommit ? `#${latestCommit.hash}-sync` : '#HEAD-initial'}
              </h4>
            </div>
            <span className={`status-pill-engine ${config.enabled ? 'green' : ''}`}>
              {config.enabled ? 'Active Sync' : 'Idle Mode'}
            </span>
          </div>

          <div className="stepper-timeline">
            <div className="timeline-step">
              <div className="step-indicator green-dot"></div>
              <div className="step-info">
                <span className="step-title">Engine State</span>
                <span className="step-detail">
                  {config.enabled ? `Armed (${config.startHour}:00 - ${config.endHour}:00)` : 'Manual Execution Mode'}
                </span>
              </div>
              <span className="step-time">Today</span>
            </div>

            <div className="timeline-step">
              <div className="step-indicator muted-dot"></div>
              <div className="step-info">
                <span className="step-title">Last Commit Message</span>
                <span className="step-detail" title={latestCommit?.message || 'Waiting for commit'}>
                  {latestCommit?.message ? (latestCommit.message.length > 26 ? latestCommit.message.substring(0, 26) + '...' : latestCommit.message) : 'Initial repository setup'}
                </span>
              </div>
              <span className="step-time">{latestCommit?.date ? latestCommit.date.split(' ')[0] : 'Ready'}</span>
            </div>

            <div className="timeline-step">
              <div className="step-indicator muted-dot"></div>
              <div className="step-info">
                <span className="step-title">Remote Target</span>
                <span className="step-detail">{config.githubRepoName || 'Local Workspace'}</span>
              </div>
              <span className="step-time">origin/main</span>
            </div>
          </div>

          <div className="tracking-footer-meta">
            <div className="meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="19" r="3"></circle>
                <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path>
                <circle cx="18" cy="5" r="3"></circle>
              </svg>
              <div>
                <span className="meta-label">Git Refspec</span>
                <span className="meta-val">HEAD &rarr; origin/main</span>
              </div>
            </div>

            <div className="meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <div>
                <span className="meta-label">Execution Mode</span>
                <span className="meta-val">{config.enabled ? 'Automated Daily Window' : 'On Demand'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Route Topology Canvas & Live Terminal */}
        <div className="card-map-topology">
          <div className="map-container">
            <div className="map-bg-grid">
              <svg className="map-svg" viewBox="0 0 340 190">
                <circle cx="45" cy="45" r="2.5" fill="#444856"></circle>
                <text x="50" y="48" fill="#585e72" fontSize="8">Local Worktree</text>

                <circle cx="280" cy="50" r="2.5" fill="#444856"></circle>
                <text x="245" y="53" fill="#585e72" fontSize="8">origin/main</text>

                <circle cx="310" cy="120" r="2.5" fill="#444856"></circle>
                <text x="270" y="124" fill="#585e72" fontSize="8">Remote Sync</text>

                <circle cx="50" cy="150" r="2.5" fill="#444856"></circle>
                <text x="55" y="153" fill="#585e72" fontSize="8">Staged</text>

                <circle cx="280" cy="170" r="2.5" fill="#444856"></circle>
                <text x="285" y="174" fill="#585e72" fontSize="8">GitHub Cloud</text>

                <path d="M 40 100 Q 140 140 250 120 T 320 160" fill="none" stroke="#2c303d" strokeWidth="2" strokeDasharray="3,3"></path>
                <path d="M 40 100 Q 140 140 180 125" fill="none" stroke="#a3e635" strokeWidth="2.5"></path>

                <circle cx="180" cy="125" r="12" fill="none" stroke="#a3e635" strokeWidth="1.5" opacity="0.4" className="beacon-pulse"></circle>
                <circle cx="180" cy="125" r="6" fill="#a3e635"></circle>
                <circle cx="180" cy="125" r="2.5" fill="#131417"></circle>
                <rect x="135" y="117" width="58" height="16" rx="8" fill="#17181d" stroke="#2b2e3a"></rect>
                <text x="142" y="128" fill="#ffffff" fontSize="8" fontWeight="600">Git Node</text>
              </svg>
            </div>

            <button
              className="map-expand-btn"
              onClick={() => setShowTerminalOverlay(!showTerminalOverlay)}
              title="Toggle Live Console Stream"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>

            {showTerminalOverlay && (
              <div className="embedded-terminal-overlay font-mono">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', borderBottom: '1px solid #242630', paddingBottom: '4px' }}>
                  <span style={{ color: '#f2795a', fontWeight: '700' }}>Live Engine Stream</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.7rem' }} onClick={() => setLogs([])}>Clear</button>
                    <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }} onClick={() => setShowTerminalOverlay(false)}>✕</button>
                  </div>
                </div>
                {logs.length === 0 && (
                  <div style={{ color: '#64748b', padding: '0.5rem 0' }}>No log entries yet.</div>
                )}
                {logs.slice(-18).map((l, i) => (
                  <div key={i} style={{ marginBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>[{l.timestamp}]</span>{' '}
                    <span style={{ color: l.type === 'error' ? '#f87171' : (l.type === 'success' ? '#4ade80' : '#f2795a'), fontWeight: '700' }}>
                      [{l.type.toUpperCase()}]
                    </span>{' '}
                    {l.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="author-profile-card">
            <img
              className="author-avatar"
              src={avatarUrl}
              alt={config.githubAllowedUser}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://github.com/github.png'; }}
            />
            <div className="author-info">
              <span className="author-label">Author Identity</span>
              <span className="author-name">{config.githubAllowedUser || 'Sachindrapandeyyy'}</span>
            </div>
            <div className="author-actions">
              <button className="author-btn" title="Instant Commit (Random Excuse)" onClick={() => handleExecuteManualCommit()} disabled={committing}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
              </button>
              <button className="author-btn" title="Backdate / Batch Modal" onClick={() => setShowManualCommitModal(true)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </button>
              <button className="author-btn" title="Force Run Scheduler Now" onClick={handleTriggerSchedulerScript} disabled={triggeringScheduler}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Bottom Section: Recent Commit Activities Data Table */}
      <section className="activities-table-section">
        <div className="table-header-bar">
          <div className="table-title-group">
            <h3 className="table-title">Recent Commit Activities</h3>
            <div className="filter-pills">
              <button className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => setActiveFilter('all')}>
                • All ({gitCommits.length})
              </button>
              <button className={`filter-pill ${activeFilter === 'feat' ? 'active' : ''}`} onClick={() => setActiveFilter('feat')}>
                Features ({featCount})
              </button>
              <button className={`filter-pill ${activeFilter === 'fix' ? 'active' : ''}`} onClick={() => setActiveFilter('fix')}>
                Bugfixes ({fixCount})
              </button>
              <button className={`filter-pill ${activeFilter === 'excuses' ? 'active' : ''}`} onClick={() => setActiveFilter('excuses')}>
                Excuses ({excuseCount})
              </button>
            </div>
          </div>

          <div className="table-actions-group">
            <button className="btn-customize" onClick={() => setShowPhrasesModal(true)}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
              </svg>
              Excuse Phrases
            </button>
            <span className="pagination-text">Showing {filteredCommits.slice(0, 15).length} of {filteredCommits.length} commits</span>
          </div>
        </div>

        <div className="table-container">
          <table className="activities-table">
            <thead>
              <tr>
                <th className="th-checkbox">
                  <input type="checkbox" readOnly />
                </th>
                <th>Commit Hash <span>↕</span></th>
                <th>Category <span>↕</span></th>
                <th>Commit Message / Excuse <span>↕</span></th>
                <th>Repository <span>↕</span></th>
                <th>Timestamp <span>↕</span></th>
                <th>Branch <span>↕</span></th>
                <th>Author <span>↕</span></th>
                <th>Target File <span>↕</span></th>
                <th>Status <span>↕</span></th>
                <th className="th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filteredCommits.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    No matching commit records found. Click "+ Trigger Commits" to generate activity!
                  </td>
                </tr>
              ) : (
                filteredCommits.slice(0, 15).map((commit, i) => {
                  const isPushed = !!config.githubUserToken && !!config.githubRepoName;
                  const commitMsg = commit.message || '';
                  const isFix = commitMsg.toLowerCase().includes('fix') || commitMsg.toLowerCase().includes('bug');
                  const isFeat = commitMsg.toLowerCase().includes('feat') || commitMsg.toLowerCase().includes('add');
                  const category = isFix ? 'Bugfix / Patch' : (isFeat ? 'Feature' : 'Developer Excuse');
                  const author = commit.author || config.githubAllowedUser || 'Sachindrapandeyyy';

                  return (
                    <tr key={commit.hash || i}>
                      <td className="td-checkbox"><input type="checkbox" readOnly /></td>
                      <td className="commit-hash-cell" style={{ cursor: 'pointer' }} onClick={() => {
                        if (commit.hash) {
                          navigator.clipboard.writeText(commit.hash);
                          showToast(`Copied commit #${commit.hash}`);
                        }
                      }}>
                        #{commit.hash || 'recent'}
                      </td>
                      <td>{category}</td>
                      <td style={{ color: '#ffffff', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={commitMsg}>
                        {commitMsg || 'Empty commit message'}
                      </td>
                      <td>{config.githubRepoName ? config.githubRepoName.split('/').pop() : 'Workspace'}</td>
                      <td>{commit.date ? commit.date.split(' ')[0] : 'Today'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#cbd5e1', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="6" y1="3" x2="6" y2="15"></line>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                          </svg>
                          main
                        </span>
                      </td>
                      <td>{author}</td>
                      <td style={{ color: '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                        {config.llmProvider !== 'none' ? 'src/patch.js' : 'activity.txt'}
                      </td>
                      <td>
                        <span className={isPushed ? 'pushed-pill' : 'local-pill'}>
                          {isPushed ? 'Pushed' : 'Local'}
                        </span>
                      </td>
                      <td className="td-actions" onClick={() => {
                        navigator.clipboard.writeText(commit.hash);
                        showToast(`Copied commit hash #${commit.hash}`);
                      }} title="Copy Hash">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline' }}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================
          MODALS
         ======================================================== */}

      {/* MODAL 1: Manual / Backdated Commit Trigger */}
      {showManualCommitModal && (
        <div className="modal-backdrop" onClick={() => setShowManualCommitModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>⚡ On-Demand Commit Trigger</h3>
                <span className="modal-subtitle">Generate organic commits instantly or backdate to fill past calendar days</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowManualCommitModal(false)}>✕</button>
            </div>

            <form onSubmit={handleExecuteManualCommit} className="modal-body">
              <div className="name-fields-row">
                <div className="form-row">
                  <label>Commit Count (1 - 20)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={manualCount}
                    onChange={(e) => setManualCount(parseInt(e.target.value, 10) || 1)}
                    required
                  />
                </div>
                <div className="form-row">
                  <label>Target Date (Supports Backdating)</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <label>Custom Commit Message (Leave blank for random excuse from bank)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="eg. Refactored legacy authentication middleware"
                    value={manualPhraseInput}
                    onChange={(e) => setManualPhraseInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-pill-secondary"
                    onClick={() => {
                      const all = [...(phrases.presets || []), ...(phrases.customPhrases || [])];
                      if (all.length > 0) {
                        const random = all[Math.floor(Math.random() * all.length)];
                        setManualPhraseInput(random);
                      }
                    }}
                  >
                    🎲 Pick Random
                  </button>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-pill-secondary" onClick={() => setShowManualCommitModal(false)}>Cancel</button>
                <button type="submit" className="btn-pill-coral" disabled={committing}>
                  {committing ? 'Executing...' : 'Run Commit Sequence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Phrases Bank Manager */}
      {showPhrasesModal && (
        <div className="modal-backdrop" onClick={() => setShowPhrasesModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>💬 Developer Excuse Phrases Bank</h3>
                <span className="modal-subtitle">Curated developer excuses and custom quotes used for scheduled and automated commits</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowPhrasesModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              {/* Presets Switch */}
              <div className="switch-row">
                <div>
                  <span className="switch-title">Enable Preset Excuses Bank (50+ Curated Quotes)</span>
                  <span className="switch-desc">Includes funny developer excuses like "Fixed a bug that only happened on Tuesdays"</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={phrases.usePresetPhrases}
                    onChange={(e) => handleTogglePresets(e.target.checked)}
                  />
                  <span className="toggle-track"></span>
                </label>
              </div>

              {/* Add Custom Phrase */}
              <form onSubmit={handleAddCustomPhrase} className="input-action-row" style={{ marginTop: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Type a new custom commit phrase..."
                  value={newCustomPhrase}
                  onChange={(e) => setNewCustomPhrase(e.target.value)}
                />
                <button type="submit" className="btn-pill-coral" style={{ padding: '0.65rem 1.1rem' }}>Add</button>
              </form>

              {/* Custom Phrases List */}
              <div style={{ marginTop: '0.8rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1' }}>Your Custom Phrases ({phrases.customPhrases?.length || 0}):</span>
                <div style={{ maxHeight: '140px', overflowY: 'auto', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(!phrases.customPhrases || phrases.customPhrases.length === 0) ? (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No custom phrases added yet. Type one above!</span>
                  ) : (
                    phrases.customPhrases.map((phrase, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#121419', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid #242630' }}>
                        <span style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>{phrase}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomPhrase(i)}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Search Preset Excuses */}
              <div style={{ marginTop: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#cbd5e1' }}>Preset Excuses Bank:</span>
                  <input
                    type="text"
                    placeholder="Search presets..."
                    value={phraseSearch}
                    onChange={(e) => setPhraseSearch(e.target.value)}
                    style={{ width: '180px', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                  />
                </div>
                <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(phrases.presets || [])
                    .filter(p => !phraseSearch || p.toLowerCase().includes(phraseSearch.toLowerCase()))
                    .slice(0, 30)
                    .map((p, i) => (
                      <div key={i} style={{ background: '#101115', padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.74rem', color: '#94a3b8' }}>
                        "{p}"
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-pill-coral" onClick={() => setShowPhrasesModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Scheduler & Repository Configuration */}
      {showSettingsModal && (
        <div className="modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>⚙️ Engine & Scheduler Configuration</h3>
                <span className="modal-subtitle">Configure daily commit frequency, working hours, and GitHub remote repository</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveConfig} className="modal-body">
              <div className="form-row">
                <label>GitHub Personal Access Token (PAT with 'repo' scope)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    value={config.githubUserToken}
                    onChange={(e) => setConfig({ ...config, githubUserToken: e.target.value })}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  />
                  <button
                    type="button"
                    className="btn-pill-secondary"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={handleFetchUserRepos}
                    disabled={loadingRepos}
                  >
                    {loadingRepos ? 'Fetching...' : 'Fetch My Repos'}
                  </button>
                </div>
              </div>

              <div className="form-row">
                <label>Target GitHub Repository (username/repo-name)</label>
                {userRepos.length > 0 ? (
                  <select
                    value={config.githubRepoName}
                    onChange={(e) => setConfig({ ...config, githubRepoName: e.target.value })}
                  >
                    <option value="">Select a repository or type below...</option>
                    {userRepos.map((r, i) => (
                      <option key={i} value={r.fullName}>{r.fullName}</option>
                    ))}
                  </select>
                ) : null}
                <input
                  type="text"
                  value={config.githubRepoName}
                  onChange={(e) => setConfig({ ...config, githubRepoName: e.target.value })}
                  placeholder="Sachindrapandeyyy/automatic_contributions"
                  style={{ marginTop: userRepos.length > 0 ? '6px' : '0' }}
                />
              </div>

              <div className="name-fields-row">
                <div className="form-row">
                  <label>Min Daily Commits</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={config.minCommits}
                    onChange={(e) => setConfig({ ...config, minCommits: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>
                <div className="form-row">
                  <label>Max Daily Commits</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={config.maxCommits}
                    onChange={(e) => setConfig({ ...config, maxCommits: parseInt(e.target.value, 10) || 15 })}
                  />
                </div>
              </div>

              <div className="name-fields-row">
                <div className="form-row">
                  <label>Work Hours Window Start (0-23)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={config.startHour}
                    onChange={(e) => setConfig({ ...config, startHour: parseInt(e.target.value, 10) || 9 })}
                  />
                </div>
                <div className="form-row">
                  <label>Work Hours Window End (0-23)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={config.endHour}
                    onChange={(e) => setConfig({ ...config, endHour: parseInt(e.target.value, 10) || 18 })}
                  />
                </div>
              </div>

              <div className="switch-row">
                <div>
                  <span className="switch-title">Automated Daily Scheduler Active</span>
                  <span className="switch-desc">Automatically registers Windows Task Scheduler / Cron to execute daily commits</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  />
                  <span className="toggle-track"></span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#101115', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #242630' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block' }}>Trigger Scheduler Script Now</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Runs the actual scheduler code immediately to simulate a scheduled day</span>
                </div>
                <button
                  type="button"
                  className="btn-pill-secondary"
                  onClick={handleTriggerSchedulerScript}
                  disabled={triggeringScheduler}
                >
                  {triggeringScheduler ? 'Running...' : 'Run Test'}
                </button>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-pill-secondary" onClick={() => setShowSettingsModal(false)}>Cancel</button>
                <button type="submit" className="btn-pill-coral">Save Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: AI Code Generator (BYOK LLM) */}
      {showAiModal && (
        <div className="modal-backdrop" onClick={() => setShowAiModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>🤖 AI Commit Generator (Bring-Your-Own-Key)</h3>
                <span className="modal-subtitle">Use LLMs to generate real, syntactically valid code commits instead of plain text excuses</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowAiModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveConfig} className="modal-body">
              <div className="form-row">
                <label>AI Provider</label>
                <select
                  value={config.llmProvider}
                  onChange={(e) => setConfig({ ...config, llmProvider: e.target.value })}
                >
                  <option value="none">Disabled (Use Excuses Bank)</option>
                  <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                </select>
              </div>

              {config.llmProvider !== 'none' && (
                <>
                  <div className="form-row">
                    <label>API Key</label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={config.llmApiKey}
                      onChange={(e) => setConfig({ ...config, llmApiKey: e.target.value })}
                    />
                  </div>

                  <div className="name-fields-row">
                    <div className="form-row">
                      <label>Model</label>
                      <input
                        type="text"
                        placeholder={config.llmProvider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-20240620'}
                        value={config.llmModel}
                        onChange={(e) => setConfig({ ...config, llmModel: e.target.value })}
                      />
                    </div>
                    <div className="form-row">
                      <label>Target Language</label>
                      <select
                        value={config.llmLanguage || 'JavaScript'}
                        onChange={(e) => setConfig({ ...config, llmLanguage: e.target.value })}
                      >
                        <option value="JavaScript">JavaScript</option>
                        <option value="TypeScript">TypeScript</option>
                        <option value="Python">Python</option>
                        <option value="Go">Go</option>
                        <option value="Rust">Rust</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ background: '#101115', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #242630', fontSize: '0.74rem', color: '#94a3b8' }}>
                    💡 When AI generation is enabled, commits will contain actual code patches (helper methods, unit tests, docstrings) generated on-the-fly and written to your repository!
                  </div>
                </>
              )}

              <div className="modal-footer">
                <button type="button" className="btn-pill-secondary" onClick={() => setShowAiModal(false)}>Cancel</button>
                <button type="submit" className="btn-pill-coral">Save AI Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-popup show">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
