"""Configuration for the SMI Browser MCP server."""

import os
from pathlib import Path

GROK_URL = "https://grok.com/imagine"
SORA_STORYBOARD_URL = "https://sora.chatgpt.com/storyboard"
SORA_DRAFTS_URL = "https://sora.chatgpt.com/drafts"

USER_DATA_DIR = str(Path.home() / ".smi-browser")

# Timeouts
DEFAULT_TIMEOUT_MS = 120_000
# Sora generation can take 10+ minutes — allow up to 30 minutes
SORA_TIMEOUT_MS = 1_800_000

# Retry settings
RETRY_ATTEMPTS = 3
RETRY_DELAY_S = 10
SORA_RETRY_DELAY_S = 30

# Polling intervals
SCREENSHOT_POLL_INTERVAL_S = 3
# Poll drafts page every 30 seconds (generation takes 5-10 min)
SORA_DRAFT_POLL_INTERVAL_S = 30

# Browser settings
# Always run headed — Grok and Sora detect headless browsers and fail to load
HEADLESS = False
VIEWPORT_WIDTH = 1280
VIEWPORT_HEIGHT = 900
