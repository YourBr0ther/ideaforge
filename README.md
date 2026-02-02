# IdeaForge

Discord-triggered build system that uses Claude Code to scaffold and deploy web applications to GitHub Pages.

## Overview

Type `/forge` in Discord, pick a GitHub account, describe your app, and IdeaForge spawns a Claude Code session that builds, commits, and deploys it automatically.

## Architecture

- **Discord Bot** (discord.js) handles slash commands and user interaction
- **Claude Code CLI** runs headless builds with `--print --dangerously-skip-permissions`
- **Build Queue** ensures single-concurrency execution
- **K8s Deployment** on k3s cluster with Longhorn persistent storage

## Commands

| Command | Description |
|---------|-------------|
| `/forge` | Spawn a new app (account select -> modal -> build) |
| `/auth` | Re-authenticate Claude Code when session expires |
| `/cancel` | Cancel the current running build |
| `/queue` | View build queue status |
| `/health` | Check system health (auth, disk, memory, queue) |

## GitHub Accounts

| Account | Username | Purpose |
|---------|----------|---------|
| Personal | YourBr0ther | General projects |
| Corporate | ProtoForgeAI | Professional apps |
| Spicy | DrFlirtashi | Adult/NSFW projects |

## Deployment

### Prerequisites

1. Create Discord application at [discord.com/developers](https://discord.com/developers)
2. Create bot user, get token + client ID
3. Add bot to server with `applications.commands` scope
4. Generate GitHub PATs for each account (`repo`, `workflow` permissions)

### Build and Push Image

```bash
docker build -t 10.0.2.180:30500/ideaforge:latest .
docker push 10.0.2.180:30500/ideaforge:latest
```

### Deploy to K3s

```bash
# Edit k8s/secrets.yaml with real tokens first
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvcs.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### First-Time Setup

After deploying, exec into the pod to authenticate Claude Code and install plugins:

```bash
# Exec into the pod
kubectl exec -it deployment/ideaforge-runner -n ideaforge -- bash

# Run Claude Code interactively and authenticate
claude

# Install plugins (these are NOT npm packages)
/plugin install superpowers@superpowers-marketplace
/plugin install ralph-loop@claude-plugins-official

# Verify
/plugin list

# Exit Claude Code and the pod
exit
exit
```

Auth credentials persist on the Longhorn PVC and survive pod restarts.

## Project Structure

```
ideaforge/
├── bot/
│   ├── index.js              # Entry point, command routing
│   ├── forge-command.js       # /forge flow (buttons, modal, build)
│   ├── auth-command.js        # /auth OAuth flow via Discord
│   ├── cancel-command.js      # /cancel running build
│   ├── queue-command.js       # /queue status display
│   ├── health-command.js      # /health system checks
│   ├── queue.js               # Build queue (single concurrency)
│   ├── health-monitor.js      # Background health monitoring + alerts
│   ├── credential-backup.js   # Periodic credential backup/restore
│   └── package.json
├── config/
│   └── claude-code-config.json
├── k8s/
│   ├── namespace.yaml
│   ├── secrets.yaml
│   ├── configmap.yaml
│   ├── pvcs.yaml
│   ├── deployment.yaml
│   └── service.yaml
├── Dockerfile
└── README.md
```

## Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `DISCORD_BOT_TOKEN` | Secret | Discord bot token |
| `DISCORD_CLIENT_ID` | Secret | Discord application client ID |
| `GITHUB_TOKEN_PERSONAL` | Secret | PAT for YourBr0ther |
| `GITHUB_TOKEN_CORPORATE` | Secret | PAT for ProtoForgeAI |
| `GITHUB_TOKEN_SPICY` | Secret | PAT for DrFlirtashi |
| `ALERT_CHANNEL_ID` | Secret | Discord channel for health alerts |
