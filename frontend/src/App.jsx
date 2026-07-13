import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:5000/api';

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function App() {
  // Auth states
  const [token, setToken] = useState(localStorage.getItem('git_committer_token') || '');
  const [isPasswordSet, setIsPasswordSet] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // App states
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
    llmModel: '',
    llmLanguage: 'JavaScript'
  });

  const [gitCommits, setGitCommits] = useState([]);
  const [schedulerHistory, setSchedulerHistory] = useState([]);
  const [phrases, setPhrases] = useState({ presets: [], customPhrases: [], usePresetPhrases: true });
  const [newPhrase, setNewPhrase] = useState('');
  const [logs, setLogs] = useState([]);
  
  // Manual trigger states
  const [manualCount, setManualCount] = useState(1);
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualPhrase, setManualPhrase] = useState('');
  const [selectedPresetPhrase, setSelectedPresetPhrase] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [triggeringScheduler, setTriggeringScheduler] = useState(false);
  const [hoveredDay, setHoveredDay] = useState(null);

  const consoleEndRef = useRef(null);

  // Add line to terminal logger
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Auth fetch helper
  const authFetch = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });
    
    if (res.status === 401) {
      // Session expired or invalid
      handleLogout();
      throw new Error('Session expired. Please log in again.');
    }
    
    return res;
  };

  // Check auth status on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/status`);
        const data = await res.json();
        setIsPasswordSet(data.passwordSet);
        
        if (!data.passwordSet) {
          // If no password set, we are in setup mode (no login required yet)
          setIsLoggedIn(true);
          setCheckingAuth(false);
        } else if (token) {
          // Test token validity
          try {
            const configRes = await fetch(`${API_BASE}/config`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (configRes.status === 200) {
              setIsLoggedIn(true);
            } else {
              handleLogout();
            }
          } catch (e) {
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
    checkAuthStatus();
  }, [token]);

  // Load app data once logged in
  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      // Start polling history every 10 seconds for real-time updates
      const interval = setInterval(() => {
        fetchData(false);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  // Fetch initial data
  const fetchData = async (showLog = true) => {
    try {
      if (showLog) addLog('Connecting to backend API services...', 'info');
      
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
        setSchedulerHistory(historyData.schedulerHistory || []);
      }

      if (showLog) addLog('System state loaded successfully.', 'success');
      setLoading(false);
    } catch (err) {
      console.error(err);
      addLog(`API connection failed: ${err.message}`, 'error');
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    
    if (authPassword !== authConfirmPassword) {
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
      
      if (data.success) {
        localStorage.setItem('git_committer_token', data.token);
        setToken(data.token);
        setIsPasswordSet(true);
        setIsLoggedIn(true);
        addLog('Dashboard secured with password.', 'success');
      } else {
        setAuthError(data.error || 'Failed to setup password.');
      }
    } catch (err) {
      setAuthError('Server connection failed.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('git_committer_token', data.token);
        setToken(data.token);
        setIsLoggedIn(true);
        addLog('Successfully authenticated.', 'success');
      } else {
        setAuthError(data.error || 'Invalid credentials.');
      }
    } catch (err) {
      setAuthError('Server connection failed.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('git_committer_token');
    setToken('');
    setIsLoggedIn(false);
    addLog('Session cleared.', 'info');
  };

  const handleConfigChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSaving(true);
    addLog('Saving configurations...', 'info');

    try {
      const res = await authFetch(`${API_BASE}/config`, {
        method: 'POST',
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        addLog('Configuration saved successfully.', 'success');
        if (data.schedulerMessage) {
          addLog(data.schedulerMessage, 'info');
        }
      } else {
        addLog('Failed to save configuration.', 'error');
      }
    } catch (err) {
      addLog(`Failed to save config: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPhrase = async (e) => {
    e.preventDefault();
    if (!newPhrase.trim()) return;

    addLog(`Adding custom phrase: "${newPhrase}"`, 'info');
    const updatedCustom = [...phrases.customPhrases, newPhrase.trim()];

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
        setPhrases(prev => ({ ...prev, customPhrases: data.customPhrases }));
        setNewPhrase('');
        addLog('Custom phrase added.', 'success');
      }
    } catch (err) {
      addLog(`Failed to add phrase: ${err.message}`, 'error');
    }
  };

  const handleDeletePhrase = async (phraseToDelete) => {
    addLog(`Removing phrase: "${phraseToDelete}"`, 'info');
    const updatedCustom = phrases.customPhrases.filter(p => p !== phraseToDelete);

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
        setPhrases(prev => ({ ...prev, customPhrases: data.customPhrases }));
        addLog('Custom phrase removed.', 'success');
      }
    } catch (err) {
      addLog(`Failed to remove phrase: ${err.message}`, 'error');
    }
  };

  const handleTogglePresets = async (checked) => {
    try {
      const res = await authFetch(`${API_BASE}/phrases`, {
        method: 'POST',
        body: JSON.stringify({
          usePresetPhrases: checked,
          customPhrases: phrases.customPhrases
        })
      });
      const data = await res.json();
      if (data.success) {
        setPhrases(prev => ({ ...prev, usePresetPhrases: data.usePresetPhrases }));
        addLog(`Preset phrases toggled: ${checked ? 'ON' : 'OFF'}`, 'success');
      }
    } catch (err) {
      addLog(`Failed to toggle presets: ${err.message}`, 'error');
    }
  };

  const handleManualCommit = async (e) => {
    e.preventDefault();
    setCommitting(true);
    
    const phraseToUse = manualPhrase || selectedPresetPhrase;
    
    if (phraseToUse) {
      addLog(`Triggering manual commit: "${phraseToUse}"...`, 'info');
    } else {
      addLog(`Triggering manual batch of ${manualCount} commits...`, 'info');
    }

    try {
      const res = await authFetch(`${API_BASE}/commit-now`, {
        method: 'POST',
        body: JSON.stringify({
          phrase: phraseToUse || undefined,
          date: manualDate ? new Date(manualDate).toISOString() : undefined,
          count: phraseToUse ? undefined : manualCount
        })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`Created ${data.commits.length} commits successfully!`, 'success');
        data.commits.forEach(c => {
          addLog(`[${c.hash}] ${c.phrase} (AI: ${c.isLLM ? 'YES' : 'NO'}) at ${new Date(c.date).toLocaleTimeString()}`, 'success');
        });
        setManualPhrase('');
        setSelectedPresetPhrase('');
        fetchData(false);
      } else {
        addLog(`Commit failed: ${data.error}`, 'error');
      }
    } catch (err) {
      addLog(`Request failed: ${err.message}`, 'error');
    } finally {
      setCommitting(false);
    }
  };

  const handleRunScheduler = async () => {
    setTriggeringScheduler(true);
    addLog('Executing background scheduler runner manually...', 'info');

    try {
      const res = await authFetch(`${API_BASE}/scheduler/trigger`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        addLog('Scheduler execution finished.', 'success');
        if (data.output) {
          const lines = data.output.split('\n');
          lines.forEach(line => {
            if (line.trim()) addLog(`[Scheduler Process] ${line.trim()}`, 'info');
          });
        }
        fetchData(false);
      } else {
        addLog(`Scheduler failed: ${data.error}`, 'error');
        if (data.output) {
          addLog(`Scheduler stderr: ${data.output}`, 'error');
        }
      }
    } catch (err) {
      addLog(`API request failed: ${err.message}`, 'error');
    } finally {
      setTriggeringScheduler(false);
    }
  };

  // Helper: map commit count to grid colors
  const getContributionColor = (count) => {
    if (count === 0) return 'var(--grid-0)';
    if (count <= 2) return 'var(--grid-1)';
    if (count <= 5) return 'var(--grid-2)';
    if (count <= 9) return 'var(--grid-3)';
    return 'var(--grid-4)';
  };

  // Build GitHub contribution grid
  const getGridWeeks = () => {
    const counts = {};
    gitCommits.forEach(c => {
      if (c.date) {
        const dStr = c.date.split('T')[0].split(' ')[0];
        counts[dStr] = (counts[dStr] || 0) + 1;
      }
    });

    const today = new Date();
    const days = [];
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);

    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    let temp = new Date(startDate);
    for (let i = 0; i < 371; i++) {
      const dStr = temp.toISOString().split('T')[0];
      days.push({
        date: dStr,
        count: counts[dStr] || 0,
        dayOfWeek: temp.getDay(),
        month: temp.getMonth(),
        dateObj: new Date(temp)
      });
      temp.setDate(temp.getDate() + 1);
    }

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  };

  const weeks = getGridWeeks();

  const getMonthLabels = () => {
    const labels = [];
    let prevMonth = -1;
    
    weeks.forEach((week, index) => {
      const firstDay = week[0];
      if (firstDay.month !== prevMonth) {
        labels.push({
          index,
          name: monthNames[firstDay.month]
        });
        prevMonth = firstDay.month;
      }
    });
    
    return labels;
  };

  const monthLabels = getMonthLabels();

  // --- Auth Views ---
  
  if (checkingAuth) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ color: 'var(--color-cyan)', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>Verifying Credentials...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: '800', background: 'linear-gradient(to right, #fff, var(--color-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Auto-Committer
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {!isPasswordSet ? 'Set up password to secure your local dashboard' : 'Enter your password to access the panel'}
            </p>
          </div>
          
          <form onSubmit={!isPasswordSet ? handleSetupPassword : handleLogin}>
            {authError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-red)', borderRadius: '6px', color: 'var(--color-red)', padding: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
                {authError}
              </div>
            )}
            
            <div className="input-group">
              <label htmlFor="authPass">Password</label>
              <input
                id="authPass"
                type="password"
                className="input-text"
                placeholder="Enter password..."
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
              />
            </div>

            {!isPasswordSet && (
              <div className="input-group">
                <label htmlFor="authConfirmPass">Confirm Password</label>
                <input
                  id="authConfirmPass"
                  type="password"
                  className="input-text"
                  placeholder="Repeat password..."
                  value={authConfirmPassword}
                  onChange={(e) => setAuthConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              {!isPasswordSet ? 'Secure Dashboard' : 'Unlock Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <h1>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            Git Auto-Committer
          </h1>
          <p>Automate daily commits with natural, randomized schedules and coding logs.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span className={`status-badge ${config.enabled ? 'active' : 'inactive'}`}>
            Scheduler: {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
          {config.schedulerRegistered ? (
            <span className="status-badge active" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-indigo)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
              Windows Task: Active
            </span>
          ) : (
            <span className="status-badge inactive">
              Windows Task: Missing
            </span>
          )}
          <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            Lock
          </button>
        </div>
      </header>

      {/* Hero Stats */}
      <div className="stats-grid">
        <div className="glass-panel stat-card">
          <h3>Total Commits</h3>
          <div className="value">{gitCommits.length}</div>
        </div>
        <div className="glass-panel stat-card">
          <h3>Daily Target</h3>
          <div className="value">
            {config.minCommits} - {config.maxCommits}
          </div>
        </div>
        <div className="glass-panel stat-card">
          <h3>Commit Time window</h3>
          <div className="value">
            {String(config.startHour).padStart(2, '0')}:00 - {String(config.endHour).padStart(2, '0')}:00
          </div>
        </div>
        <div className="glass-panel stat-card">
          <h3>Repository Setup</h3>
          <div className="value" style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-cyan)', marginTop: '8px' }} title={config.repoPath}>
            {config.repoPath ? config.repoPath.split('\\').pop() : 'Not Configured'}
          </div>
        </div>
      </div>

      {/* Contribution Heat Map */}
      <div className="glass-panel map-card">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', color: '#fff' }}>Contribution Calendar</h2>
        <div className="contribution-grid-container">
          <div style={{ display: 'flex' }}>
            <div className="days-labels">
              <span>Sun</span>
              <span>Tue</span>
              <span>Thu</span>
              <span>Sat</span>
            </div>
            <div>
              {/* Month Titles */}
              <div style={{ position: 'relative', height: '20px', marginLeft: '12px' }}>
                {monthLabels.map(l => (
                  <span key={l.index} style={{ position: 'absolute', left: `${l.index * 13}px`, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {l.name}
                  </span>
                ))}
              </div>
              
              {/* Heat Map Grid */}
              <div className="grid-cols" style={{ marginLeft: '12px' }}>
                {weeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid-col-week">
                    {week.map((day, dIdx) => (
                      <div
                        key={dIdx}
                        className="grid-square tooltip-container"
                        style={{ backgroundColor: getContributionColor(day.count) }}
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                      >
                        {hoveredDay && hoveredDay.date === day.date && (
                          <div className="tooltip-box">
                            {day.count} commit{day.count !== 1 ? 's' : ''} on {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="grid-legend">
            <span>Less</span>
            <div className="legend-square" style={{ backgroundColor: 'var(--grid-0)' }} />
            <div className="legend-square" style={{ backgroundColor: 'var(--grid-1)' }} />
            <div className="legend-square" style={{ backgroundColor: 'var(--grid-2)' }} />
            <div className="legend-square" style={{ backgroundColor: 'var(--grid-3)' }} />
            <div className="legend-square" style={{ backgroundColor: 'var(--grid-4)' }} />
            <span>More</span>
          </div>
        </div>
      </div>

      <div className="dashboard-body">
        {/* Left Column: Config & Manual Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Configurations */}
          <div className="glass-panel">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '20px', color: '#fff', display: 'flex', justifyItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Scheduler Settings
            </h2>
            <form onSubmit={handleSaveConfig}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>Automated Daily Committer</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Toggle background scheduler service</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    name="enabled"
                    checked={config.enabled}
                    onChange={handleConfigChange}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="input-group">
                <label htmlFor="repoPath">Target Repository Directory</label>
                <input
                  id="repoPath"
                  type="text"
                  name="repoPath"
                  className="input-text"
                  value={config.repoPath}
                  onChange={handleConfigChange}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="minCommits">Min Commits / Day</label>
                  <input
                    id="minCommits"
                    type="number"
                    name="minCommits"
                    className="input-text"
                    min="0"
                    max="50"
                    value={config.minCommits}
                    onChange={handleConfigChange}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="maxCommits">Max Commits / Day</label>
                  <input
                    id="maxCommits"
                    type="number"
                    name="maxCommits"
                    className="input-text"
                    min="1"
                    max="50"
                    value={config.maxCommits}
                    onChange={handleConfigChange}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label htmlFor="startHour">Working Hours Start</label>
                  <select
                    id="startHour"
                    name="startHour"
                    className="input-select"
                    value={config.startHour}
                    onChange={handleConfigChange}
                  >
                    {[...Array(24).keys()].map(h => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label htmlFor="endHour">Working Hours End</label>
                  <select
                    id="endHour"
                    name="endHour"
                    className="input-select"
                    value={config.endHour}
                    onChange={handleConfigChange}
                  >
                    {[...Array(24).keys()].map(h => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* BYOK LLM Settings Section */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '14px', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  BYOK AI Code Generation (Optional)
                </h3>
                
                <div className="input-group">
                  <label htmlFor="llmProvider">AI Provider</label>
                  <select
                    id="llmProvider"
                    name="llmProvider"
                    className="input-select"
                    value={config.llmProvider}
                    onChange={handleConfigChange}
                  >
                    <option value="none">None (Use default preset phrases)</option>
                    <option value="openai">OpenAI (GPT Models)</option>
                    <option value="anthropic">Anthropic (Claude Models)</option>
                  </select>
                </div>

                {config.llmProvider !== 'none' && (
                  <>
                    <div className="input-group">
                      <label htmlFor="llmApiKey">API Key</label>
                      <input
                        id="llmApiKey"
                        type="password"
                        name="llmApiKey"
                        className="input-text"
                        placeholder="Paste api key..."
                        value={config.llmApiKey}
                        onChange={handleConfigChange}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        API key is stored locally and sent directly to the AI provider endpoint.
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                      <div className="input-group">
                        <label htmlFor="llmModel">Model Name</label>
                        <input
                          id="llmModel"
                          type="text"
                          name="llmModel"
                          className="input-text"
                          placeholder={config.llmProvider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-20240620'}
                          value={config.llmModel}
                          onChange={handleConfigChange}
                        />
                      </div>
                      <div className="input-group">
                        <label htmlFor="llmLanguage">Target Language</label>
                        <select
                          id="llmLanguage"
                          name="llmLanguage"
                          className="input-select"
                          value={config.llmLanguage}
                          onChange={handleConfigChange}
                        >
                          <option value="JavaScript">JavaScript</option>
                          <option value="Python">Python</option>
                          <option value="HTML">HTML</option>
                          <option value="CSS">CSS</option>
                          <option value="Markdown">Markdown</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleRunScheduler} disabled={triggeringScheduler} title="Test executes scheduler immediately">
                  {triggeringScheduler ? 'Running...' : 'Run Task Now'}
                </button>
              </div>
            </form>
          </div>

          {/* Quick manual actions */}
          <div className="glass-panel">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '20px', color: '#fff', display: 'flex', justifyItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Manual Commit Trigger
            </h2>
            <form onSubmit={handleManualCommit}>
              <div className="input-group">
                <label>Mode</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="manualMode"
                      checked={!manualPhrase && !selectedPresetPhrase}
                      onChange={() => { setManualPhrase(''); setSelectedPresetPhrase(''); }}
                    />
                    Random Phrase Batch
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="manualMode"
                      checked={!!manualPhrase || !!selectedPresetPhrase}
                      onChange={() => setSelectedPresetPhrase(phrases.presets[0] || '')}
                    />
                    Specific Phrase
                  </label>
                </div>
              </div>

              {(!manualPhrase && !selectedPresetPhrase) ? (
                <div className="input-group">
                  <label htmlFor="manualCount">Number of Commits to Generate</label>
                  <input
                    id="manualCount"
                    type="number"
                    className="input-text"
                    min="1"
                    max="30"
                    value={manualCount}
                    onChange={(e) => setManualCount(parseInt(e.target.value))}
                  />
                </div>
              ) : (
                <div className="input-group">
                  <label htmlFor="selectPreset">Choose Preset or Write Custom Message</label>
                  <select
                    id="selectPreset"
                    className="input-select"
                    value={selectedPresetPhrase}
                    onChange={(e) => {
                      setSelectedPresetPhrase(e.target.value);
                      setManualPhrase('');
                    }}
                    style={{ marginBottom: '8px' }}
                  >
                    <option value="">-- Select Preset Excuses --</option>
                    {phrases.presets.map((p, idx) => (
                      <option key={idx} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="Or type custom commit message..."
                    value={manualPhrase}
                    onChange={(e) => {
                      setManualPhrase(e.target.value);
                      setSelectedPresetPhrase('');
                    }}
                  />
                </div>
              )}

              <div className="input-group">
                <label htmlFor="manualDate">Commit Assign Date</label>
                <input
                  id="manualDate"
                  type="date"
                  className="input-text"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Choose a date in the past to backfill contribution history.
                </span>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={committing}>
                {committing ? 'Committing...' : 'Commit Now'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Terminal Console & Phrase Bank */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {/* Logs */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', color: '#fff', display: 'flex', justifyItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              Execution Console
            </h2>
            <div className="console-panel">
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Terminal idling. Awaiting operations...</div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="console-line">
                    <span className="timestamp">[{log.timestamp}]</span>
                    <span className={log.type}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>

          {/* Phrases Manager */}
          <div className="glass-panel">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', color: '#fff', display: 'flex', justifyItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Commit Phrase Bank
            </h2>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>Use Predefined Phrases</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Include 50+ developer phrases in commit pools</div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={phrases.usePresetPhrases}
                  onChange={(e) => handleTogglePresets(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <form onSubmit={handleAddPhrase} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                className="input-text"
                placeholder="Add custom commit phrase..."
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary" style={{ padding: '0 16px' }}>Add</button>
            </form>

            <div className="phrases-list">
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Custom Phrases ({phrases.customPhrases.length})</div>
              {phrases.customPhrases.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px' }}>No custom phrases added yet.</div>
              ) : (
                phrases.customPhrases.map((phrase, idx) => (
                  <div key={idx} className="phrase-item">
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }} title={phrase}>
                      {phrase}
                    </span>
                    <button type="button" onClick={() => handleDeletePhrase(phrase)} title="Delete custom phrase">&times;</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Recent Git Log Activity */}
      <div className="glass-panel" style={{ marginTop: '30px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px', color: '#fff', display: 'flex', justifyItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
          Recent Repository Log (Last 10 Commits)
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                <th style={{ padding: '10px 12px' }}>Hash</th>
                <th style={{ padding: '10px 12px' }}>Message</th>
                <th style={{ padding: '10px 12px' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {gitCommits.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No commits found in target repository. Use the manual committer panel above to initialize activity.
                  </td>
                </tr>
              ) : (
                gitCommits.slice(0, 10).map((c, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)' }}>{c.hash}</td>
                    <td style={{ padding: '10px 12px', color: '#fff', fontWeight: '500' }}>{c.message}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{new Date(c.date).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
