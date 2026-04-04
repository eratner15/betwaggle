# Spotter Runner Bootstrap (Playwright Browser Deps)

## Purpose

Use this when Spotter QA fails with missing Linux shared libraries while launching Playwright browsers (Chromium/WebKit).

## One-command bootstrap

From repo root:

```bash
bash scripts/spotter-playwright-bootstrap.sh
```

If your runner requires elevated privileges for package installation:

```bash
sudo bash scripts/spotter-playwright-bootstrap.sh
```

## What it does

1. Runs `playwright install-deps` (Linux package dependencies).
2. Installs Playwright browsers: Chromium + WebKit.
3. Executes a smoke screenshot against `https://betwaggle.com/demo/` with `iPhone 14` device emulation.

## Optional arguments

```bash
bash scripts/spotter-playwright-bootstrap.sh <url> <output_png>
```

Example:

```bash
sudo bash scripts/spotter-playwright-bootstrap.sh https://betwaggle.com/create/ /tmp/spotter-create-iphone14.png
```

## Success criteria

- Script exits `0`.
- Screenshot file exists at the output path.
- No `Host system is missing dependencies to run browsers` error.

## Ticket linkage

This runbook addresses [BET-551](/BET/issues/BET-551) and unblocks mobile QA validation for [BET-186](/BET/issues/BET-186).
