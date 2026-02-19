# Social Media Influencer — OpenClaw Plugin

Autonomous social media management for Facebook and Instagram. Three-tier learning system (Constitution → Soul → Tactics) with 14 MCP tools, 4 background services, and browser automation for AI media generation via Grok Imagine and Sora.

## Quick Start

### 1. Install & Build

```bash
git clone https://github.com/Shawm69/fbigposter.git
cd fbigposter
npm install
npm run build
```

### 2. Start the MCP Server

```bash
npm start
```

Server starts on `http://localhost:3002/mcp` with a health check at `http://localhost:3002/health`.

Environment variables (all optional):
- `SMI_WORKSPACE` — workspace directory (default: `./workspace`)
- `SMI_PORT` — server port (default: `3002`)

### 3. Start the MCP Browser Server (for media generation)

```bash
cd mcp-browser
uv sync            # or: pip install -e .
playwright install chromium
uv run server.py   # or: python server.py
```

The browser always runs headed (visible window) — Grok and Sora detect and block headless browsers. On first run, log in to grok.com and sora.chatgpt.com manually in the browser window. Sessions persist in `~/.smi-browser/` across restarts.

## Setup Wizard

After starting the MCP server, run through setup by calling tools in this order:

1. **`smi_setup_status`** — check current state, get `next_step`
2. **`smi_init`** — create workspace directories and copy template files
3. **`smi_configure`** — set brand identity, audience, content pillars, visual identity, creative direction, schedule, and safety rails (follow `next_step` from status)
4. **`smi_auth`** — authenticate with Meta API (needs app_id, app_secret, short_lived_token)
5. **`smi_test_connection`** — verify FB and IG API access
6. **`smi_configure`** — mark `status.setup_complete = true`

The full setup flow with exact field paths is documented in `SKILL.md` (concise) and `AGENT_PROMPT.md` (detailed, with questions to ask the user at each step).

## Agent Files

| File | Purpose |
|------|---------|
| `AGENT_PROMPT.md` | Full system prompt — setup wizard, supervised/autonomous modes, all rules |
| `SKILL.md` | Concise skill reference — tools list, first run steps, nightly cycle |
| `skills/social-media-influencer/SKILL.md` | Detailed playbook — pipeline workflows, analysis protocol, browser tips |

Load `AGENT_PROMPT.md` as the system prompt. It handles everything: detecting setup state, walking users through configuration, supervised mode (first 10 posts), and autonomous mode.

## 14 MCP Tools

| Tool | Purpose |
|------|---------|
| `smi_init` | Initialize workspace directories and copy templates |
| `smi_auth` | Authenticate with Meta API |
| `smi_test_connection` | Verify FB/IG API connectivity |
| `smi_setup_status` | Check setup progress and next step |
| `smi_configure` | Set config, soul, constitution, tactics values |
| `smi_build_generation_context` | Load three-tier context for a pipeline |
| `smi_generate_content` | Prepare creative context + staging |
| `smi_post_content` | Publish to Facebook and Instagram |
| `smi_collect_metrics` | Ingest engagement metrics |
| `smi_run_analysis` | Analyze pipeline performance |
| `smi_update_tactics` | Apply analysis findings to tactics |
| `smi_propose_soul_change` | Queue brand identity change for human approval |
| `smi_review_queue` | List pending proposals and scheduled content |
| `smi_get_notifications` | Get unread background events |

## MCP Browser Tools (separate server)

| Tool | Service | Purpose |
|------|---------|---------|
| `generate_image` | Grok Imagine | Create images (~10s) |
| `generate_video` | Sora | Create videos (5-10 min) |
| `check_browser_session` | Both | Verify auth status |
| `scrape_facebook_metrics` | FB Professional Dashboard | Harvest engagement data |
| `scrape_instagram_metrics` | IG Insights | Harvest engagement data |

## Project Structure

```
├── src/
│   ├── mcp-server.ts        # MCP server entry point
│   ├── tools/                # 14 tool implementations
│   ├── meta-api/             # Meta Graph API client
│   ├── analysis/             # Pipeline analyzers
│   ├── prompt-builder/       # Three-tier prompt assembly
│   ├── services/             # Background services (scheduler, metrics, analysis, content)
│   ├── storage/              # File I/O utilities
│   ├── tiers/                # Constitution, Soul, Tactics logic
│   └── __tests__/            # 152 tests (Jest)
├── mcp-browser/              # Python MCP server (Playwright)
├── data/                     # Template files copied to workspace on init
├── config-schema.ts          # TypeScript config schema
├── AGENT_PROMPT.md           # Full agent system prompt
├── SKILL.md                  # Concise skill reference
└── package.json              # OpenClaw extensions entry point
```

## Nightly Cycle

Once setup is complete, the agent runs this each night:

1. **Scrape metrics** — `scrape_facebook_metrics` → `smi_collect_metrics`
2. **Analyze** — `smi_run_analysis` for reels and image_posts (stories skipped — 24h expiry)
3. **Update tactics** — `smi_update_tactics` with evidence (min 5 posts, 50% confidence)
4. **Plan posts** — check volume, pillar rotation, optimal times
5. **Generate & publish** — `smi_generate_content` → `generate_image`/`generate_video` → `smi_post_content`

## Tests

```bash
npm test           # 152 tests across 6 suites
npx tsc --noEmit   # type check
```
