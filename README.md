# Hermes WebUI Lite

<p align="center">
  <strong>A lightweight web interface for Hermes Agent deployments</strong>
</p>

<p align="center">
  Minimal UI branding, Docker-first deployment, host-managed gateway operation, and a cleaner chat experience for production environments.
</p>

<p align="center">
  <a href="https://github.com/kedaya2025/Hermes-WebUI-Lite">Repository</a>
  ·
  <a href="./docs/docker.md">Deployment Guide</a>
  ·
  <a href="./LICENSE">License</a>
</p>

---

## Overview

Hermes WebUI Lite is a streamlined fork of Hermes Web UI tailored for containerized Hermes Agent deployments where the Web UI runs as a dedicated application layer and the Hermes gateway remains managed outside the container.

This variant removes unnecessary UI chrome, simplifies chat presentation, and aligns the product with a lighter operational model.

## Design Goals

- Keep the Web UI focused on daily operational use
- Avoid coupling the container to gateway lifecycle management
- Reduce unnecessary branding, promotional links, and upgrade prompts
- Preserve core Hermes workflows: chat, jobs, models, channels, history, files, logs, and profiles
- Support Docker-based rollout with predictable runtime behavior

## Key Changes in Lite Edition

### UI Simplification

- Sidebar logo image removed
- Sidebar title renamed to `Hermes WebUI`
- Sidebar GitHub / website links point to this repository
- Version display is plain text and no longer interactive
- Sidebar upgrade buttons removed
- Theme style toggle removed; light/dark theme switch retained
- Drawer entry moved into the chat header actions area

### Chat Experience

- Thinking animation removed and replaced with a text status indicator
- Floating drawer button removed
- Message avatars removed
- Chat messages use a cleaner bubble-based layout

### Link and Branding Cleanup

- Promotional relay links removed
- Model page affiliate mapping removed
- Repository and website links aligned to the Lite repository

### Deployment Direction

- Intended for Docker deployment with Hermes managed externally where appropriate
- Better suited to installations where gateway ownership belongs to the host environment rather than the Web UI container

## Runtime Model

Hermes WebUI Lite does not depend on an in-container Hermes gateway process for normal operation. In this deployment model:

- the Web UI runs in the container
- Hermes CLI / runtime access is provided to the application
- the gateway is managed by the host or by an external runtime flow

This keeps the container smaller in responsibility and avoids duplicate gateway ownership.

## Features Retained

This fork keeps the main Hermes Web UI capabilities, including:

- Real-time chat UI
- Session history and search
- Jobs and cron management
- Model and provider management
- Channels and integrations management
- Profiles and memory views
- Logs, usage, files, and terminal views
- Group chat and kanban views where enabled by the codebase

## Quick Start

### Docker Compose

Hermes WebUI Lite is **not** a self-contained Hermes runtime image. It is intended only for hosts that already have a working Hermes installation and configuration on the host machine.

Use this fork when:

- Hermes is already installed on the host
- the host already has a usable Hermes home / config / credentials
- the Web UI container should reuse the host Hermes runtime
- the gateway remains managed outside the container

Do **not** use this Lite image as a drop-in replacement for the original all-in-one WebUI container if the host does not already provide Hermes.

```bash
git clone https://github.com/kedaya2025/Hermes-WebUI-Lite.git
cd Hermes-WebUI-Lite
docker compose up -d --build
```

Open:

```text
http://localhost:6060
```

For operational details, see [`docs/docker.md`](./docs/docker.md).

## Host Runtime Requirements

A host-managed deployment must provide all of the following:

- Hermes source/runtime mounted into the container at `/host-hermes`
- the host Hermes virtual environment mounted so the shebang interpreter path remains valid
- the host uv runtime cache mounted when the host Hermes installation depends on uv-managed Python assets
- a valid Hermes home mounted into the container

At minimum, the deployment must include:

```yaml
environment:
  HERMES_BIN: /host-hermes/venv/bin/hermes
  HERMES_AGENT_ROOT: /host-hermes
  PYTHONPATH: /host-hermes
  HERMES_AGENT_BRIDGE_PYTHON: ""
  HERMES_SKIP_GATEWAY_AUTOSTART: "1"

volumes:
  - /usr/local/lib/hermes-agent:/host-hermes:ro
  - /usr/local/lib/hermes-agent/venv:/usr/local/lib/hermes-agent/venv:ro
  - /root/.local/share/uv:/root/.local/share/uv:ro
  - /root/.hermes:/home/agent/.hermes
```

## Troubleshooting: Plugins or Logs API Fails After Slim Deployment

If the Lite container starts but these endpoints fail:

- `/api/hermes/plugins`
- `/api/hermes/logs/agent?lines=5`

then the most likely cause is an incomplete host-runtime mount set.

### Symptoms

- plugins page returns an error instead of JSON
- logs page returns an error instead of real log lines
- container health page may still look normal

### Required checks

Inside the container, verify:

```bash
head -1 /host-hermes/venv/bin/hermes
which python3
env | grep -E '^(HERMES_BIN|HERMES_AGENT_ROOT|HERMES_AGENT_BRIDGE_PYTHON|PYTHONPATH)='
```

The deployment should also include these mounts:

```yaml
- /usr/local/lib/hermes-agent/venv:/usr/local/lib/hermes-agent/venv:ro
- /root/.local/share/uv:/root/.local/share/uv:ro
```

And this environment variable:

```yaml
PYTHONPATH: /host-hermes
```

### Recovery procedure

1. Add the missing volume mounts
2. Add `PYTHONPATH=/host-hermes`
3. Recreate the container
4. Verify:

```bash
curl -fsS http://127.0.0.1:6060/api/hermes/plugins
curl -fsS 'http://127.0.0.1:6060/api/hermes/logs/agent?lines=5'
```

## Repository Layout

- `packages/client` — Vue 3 frontend
- `packages/server` — Koa backend and Hermes integration layer
- `docs` — deployment and project notes kept for this fork
- `scripts` — build and setup helpers
- `tests` — automated test coverage

## Development

```bash
npm install
npm run build
npm run test
```

## Fork Positioning

This repository is maintained as an operationally simplified fork rather than a drop-in branding mirror of the upstream project. The focus is production usability, reduced noise, and compatibility with host-managed Hermes deployments.

## License

This project retains the upstream license. See [`LICENSE`](./LICENSE).
