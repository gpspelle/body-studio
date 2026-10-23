#!/bin/bash
# Claude Code on the web: get a fresh container ready to run the tests and take screenshots, so a
# session starts working instead of rediscovering the setup. Run by .claude/settings.json.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"

# the app with its pinned splat-studio, and the Playwright that matches the container's Chromium
# (the container's browsers are Playwright 1.56's; a newer one would try to download its own).
# Editable, so tests and screenshots run the code as it is now, not a copy from session start.
PIP_ROOT_USER_ACTION=ignore pip install -q -e . "playwright==1.56.0" 2>&1 | grep -v "^\[notice\]" || true

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  [ -x /opt/pw-browsers/chromium ] && echo "export BODY_STUDIO_CHROMIUM=/opt/pw-browsers/chromium" >> "$CLAUDE_ENV_FILE"
fi
echo "Ready: python3 scripts/test.py --changed runs the unit tests for what you changed."
