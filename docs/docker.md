# Docker Deployment Guide

This repository ships a Docker-first deployment model for Hermes WebUI Lite.

## Important Scope

Hermes WebUI Lite is intended only for environments where Hermes is already installed and configured on the host.

This Lite image is **not** a self-contained all-in-one Hermes runtime.

Use this deployment model only when:

- the Web UI runs inside a container
- Hermes runtime access is provided from the host into the container
- the Hermes gateway lifecycle is managed outside the container
- the host already has a working Hermes installation, configuration, and credentials

Do not treat this image as a drop-in replacement for the original full WebUI image on hosts that do not already provide Hermes.

## Required Host Runtime Mounts

A working host-managed deployment must provide:

- Hermes source/runtime mounted to `/host-hermes`
- the Hermes virtual environment mounted at the same interpreter path expected by the host-installed script
- the host uv runtime cache mounted when applicable
- Hermes home mounted into the container

Minimum required settings:

```yaml
services:
  hermes-webui:
    environment:
      PORT: 6060
      BIND_HOST: 0.0.0.0
      HERMES_HOME: /home/agent/.hermes
      HERMES_WEB_UI_HOME: /home/agent/.hermes-web-ui
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

## Quick Start

### Build locally

```bash
docker compose up -d --build
```

### Use a prebuilt image

Replace `WEBUI_IMAGE` with your published image name:

```bash
WEBUI_IMAGE=ghcr.io/your-org/hermes-webui-lite:latest docker compose up -d
```

## Default Access

Open:

```text
http://localhost:6060
```

## Compose Behavior

The compose file runs a single `hermes-webui` service.

Key properties:

- persistent Hermes state is mounted from the host
- Hermes runtime is reused from the host
- the Web UI binds to the configured HTTP port
- no dedicated gateway port is exposed
- the container is intended to cooperate with a host-managed Hermes environment

## Troubleshooting

### Plugins or logs API fails after slimming the image

If the container starts normally but one or both of these fail:

- `/api/hermes/plugins`
- `/api/hermes/logs/agent?lines=5`

then the most likely cause is missing host-runtime mounts or missing `PYTHONPATH`.

### Typical symptoms

- plugins page returns an error instead of JSON
- logs page returns an error instead of real log output
- health endpoint may still appear normal

### Verification checklist

Run inside the container:

```bash
head -1 /host-hermes/venv/bin/hermes
which python3
env | grep -E '^(HERMES_BIN|HERMES_AGENT_ROOT|HERMES_AGENT_BRIDGE_PYTHON|PYTHONPATH)='
```

Expected deployment requirements:

```yaml
volumes:
  - /usr/local/lib/hermes-agent/venv:/usr/local/lib/hermes-agent/venv:ro
  - /root/.local/share/uv:/root/.local/share/uv:ro

environment:
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

## Useful Commands

### Rebuild and recreate

```bash
docker compose up -d --build --force-recreate
```

### View logs

```bash
docker compose logs -f hermes-webui
```

### Stop

```bash
docker compose down
```

## Notes

If you publish this fork to GitHub Container Registry or Docker Hub, update `WEBUI_IMAGE` accordingly for downstream users.
