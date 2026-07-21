# Git Auto-Committer Web Application

A premium web dashboard and background service designed to automatically perform randomized commits (1 to 15 commits per day) using customizable programming phrases. 

---

## Key Features

- 📅 **Interactive Contribution Heatmap**: A custom SVG-based calendar reflecting actual git activity in your target repository.
- ⚙️ **Configurable Schedule**: Adjust daily commit ranges (e.g. min 1, max 15), working hour windows (e.g. 9:00 AM to 6:00 PM), and active states.
- 💬 **Custom & Preset Phrase Bank**: Add your own custom commit messages or toggle our curated list of 50+ funny developer excuses and tech quotes.
- ⏱️ **Natural Timestamp Spreading**: Spreads commits throughout the day using backdated timestamps to simulate realistic, organic code contributions.
- 🌐 **SaaS GitHub OAuth Integration**: Support for Vercel-like repository dropdown selection directly from the UI.
- 🚀 **Cloud Hosting Ready**: Fully compatible with cloud deployment platforms (like Render or Railway) with environment variable configurations.

---

## Directory Structure

```text
automatic_contributions/
├── backend/
│   ├── committer.js       # Git engine and helper functions
│   ├── config-manager.js  # Config loading with environment variable fallback
│   ├── config.json        # Service state parameters
│   ├── phrases.json       # Default excuse presets
│   ├── scheduler.js       # Headless runner invoked by cron or task scheduler
│   ├── server.js          # Express API server
│   └── package.json       # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React dashboard layout
│   │   └── index.css      # Glassmorphic dark styling system
│   └── package.json       # Frontend dependencies
├── package.json           # Root package launcher
├── render.yaml            # Render Blueprint Infrastructure-as-Code
└── README.md              # Instructions manual
```

---

## Local Development Quick Start

### 1. Prerequisite
Ensure [Node.js](https://nodejs.org/) and [Git](https://git-scm.com/) are installed on your system.

### 2. Start the Application
Open your terminal in the repository root directory and start the developer environment:
```bash
npm run dev
```
This starts both the **Express backend server** (port `5000`) and the **React frontend dev server** (port `5173`) concurrently.

### 3. Open the Dashboard
Open your browser and navigate to: `http://localhost:5173`

---

## Cloud Deployment Guide (Render)

This repository includes a `render.yaml` blueprint, allowing you to deploy the application to Render with a single click.

### Step 1: Deploy with Render Blueprint
1. Go to the [Render Dashboard](https://dashboard.render.com/) and click **New + ➜ Blueprint**.
2. Connect your GitHub repository: `automatic_contributions`.
3. Give your blueprint a name (e.g. `git-committer`) and click **Apply**.
4. Wait for Render to build and deploy both the `git-auto-committer-backend` (Web Service) and `git-auto-committer-frontend` (Static Site).

### Step 2: Configure Environment Variables

Since Render's free tier has an ephemeral filesystem (data resets on restarts), you must configure your settings as **Environment Variables** in the Render Dashboard so they persist permanently.

#### Backend Web Service (`git-auto-committer-backend`):
Go to the **Environment** tab of your backend service on Render and add the following variables:

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| `GITHUB_USER_TOKEN` | GitHub Personal Access Token (PAT) with `repo` scopes | `ghp_xxxxxxxxxxxxxxxxxxxxxx` |
| `GITHUB_REPO_NAME` | Target repository to commit to | `username/repo-name` |
| `GITHUB_ALLOWED_USER` | Your GitHub Username | `Sachindrapandeyyy` |
| `GITHUB_CLIENT_ID` | OAuth App Client ID (Optional, for login) | `0v2311GUN...` |
| `GITHUB_CLIENT_SECRET` | OAuth App Client Secret (Optional, for login) | `456def...` |

#### Frontend Static Site (`git-auto-committer-frontend`):
Go to the **Environment** tab of your frontend service on Render and add the API endpoint key:

| Variable Name | Description | Value |
| :--- | :--- | :--- |
| `VITE_API_BASE` | URL of your deployed backend service | `https://git-auto-committer-backend.onrender.com/api` |

*Note: Make sure to click **Save and rebuild** on the frontend service after setting `VITE_API_BASE` so the React app compiles with the correct URL.*

---

## How It Works

1. **Auto-Cloning**: The backend automatically clones your target repository using your `GITHUB_USER_TOKEN` into the server workspace directory on boot.
2. **Scheduling**: In the cloud, configure a free scheduler (like [Cron-Job.org](https://cron-job.org/)) to call your backend trigger endpoint `POST /api/scheduler/trigger` daily.
3. **Execution Logic**:
   - The scheduler triggers the backend.
   - It rolls a random number of commits between your configured `Min` and `Max`.
   - It assigns these commits randomized timestamps within your target working hours window.
   - It commits these changes locally and pushes them to your remote GitHub repository branch using token-based authentication.
