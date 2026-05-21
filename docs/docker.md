# Docker Deployment Guide

This repository ships a Docker-first deployment model for Hermes WebUI Lite.

## Deployment Model

Hermes WebUI Lite is intended for environments where:

- the Web UI runs inside a container
- Hermes runtime access is available to the application
- gateway lifecycle is managed outside the container

This fork does not rely on an in-container gateway process as part of normal deployment.

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
- the Web UI binds to the configured HTTP port
- no dedicated gateway port is exposed
- the container is intended to cooperate with a host-managed Hermes environment

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
