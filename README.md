# Git Auto-Committer Web Application

A premium web dashboard and background service designed for Windows to automatically perform randomized commits (1 to 15 commits per day) using customizable programming phrases. 

## Features

- 📅 **Interactive Contribution Heatmap**: A custom SVG-based calendar reflecting actual git activity in your target repository.
- ⚙️ **Configurable Schedule**: Adjust daily commit ranges (e.g. min 1, max 15), working hour windows (e.g. 9:00 AM to 6:00 PM), and active states.
- 💬 **Custom & Preset Phrase Bank**: Add your own custom commit messages or toggle our curated list of 50+ funny developer excuses and tech quotes.
- ⏱️ **Natural Timestamp Spreading**: Spreads commits throughout the day using backdated timestamps to simulate realistic, organic code contributions.
- 🔄 **Missed-Day Backfilling**: Auto-detects if your computer was off or asleep for multiple days, and automatically backfills missed contributions.
- 🖥️ **Windows Task Scheduler Integration**: Installs a daily headless runner that executes even when the web UI is closed.

---

## Directory Structure

```text
git-auto-committer/
├── backend/
│   ├── committer.js       # Git engine and helper functions
│   ├── config-manager.js  # Config JSON loading and saving
│   ├── config.json        # Service state parameters
│   ├── phrases.json       # Default excuse presets
│   ├── scheduler.js       # Headless runner invoked by Windows Scheduler
│   ├── server.js          # Express API server & Windows Task Controller
│   └── package.json       # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React dashboard layout
│   │   └── index.css      # Glassmorphic dark styling system
│   └── package.json       # Frontend dependencies
├── package.json           # Root package launcher
└── README.md              # Instructions manual
```

---

## Quick Start

### 1. Prerequisite
Ensure [Node.js](https://nodejs.org/) and [Git](https://git-scm.com/) are installed on your Windows system.

### 2. Start the Application
Open your terminal in this directory (`C:\Users\Sachi\.gemini\antigravity\scratch\git-auto-committer`) and start the developer environment:
```bash
npm run dev
```
This starts both the **Express backend server** (port `5000`) and the **React frontend dev server** (port `5173`) concurrently.

### 3. Open the Dashboard
Open your browser and navigate to:
```text
http://localhost:5173
```

---

## How It Works

1. **Target Repository**: By default, the application will create a folder named `target-repo` in the project root and initialize it as a git repository. You can modify this in the dashboard to point to any directory on your computer.
2. **Auto-Scheduling**: When you toggle the **Daily Committer** scheduler to **Enabled** and click **Save Configuration**, the API automatically registers a task in the **Windows Task Scheduler** named `GitAutoCommitter` to execute daily.
3. **Execution Logic**:
   - The task runs the headless `scheduler.js` script.
   - It rolls a random number of commits between your configured `Min` and `Max`.
   - It assigns these commits randomized timestamps within your target working hours window.
   - It commits these changes, ensuring your GitHub green contribution streak remains intact.
