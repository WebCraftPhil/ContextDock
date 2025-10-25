# Context Keeper Chrome Extension — Project Overview

## Vision

Context Keeper eliminates the repetitive hassle of reintroducing “primer” context in every AI chat. By remembering and automatically injecting saved prompts across ChatGPT, Claude, Perplexity, and Gemini, the extension keeps power users in flow while respecting their privacy.

## Target Users

- Developers reusing code scaffolds or debugging prompts
- Freelancers juggling client personas and tone guides
- Marketers and analysts deploying brand voice templates
- Students and researchers maintaining study context across sessions

## Problem Statement

Large Language Model (LLM) interfaces reset between sessions, forcing users to manually copy/paste core instructions. This context loss creates friction, inconsistent results, and slower workflows. Context Keeper automates prompt persistence, delivering faster, more reliable interactions.

## Product Principles

- **Local-first privacy**: All prompts live on-device by default; cloud sync is optional and encrypted.
- **Zero-friction automation**: Auto-inject context with a keystroke or page load; minimize manual steps.
- **Multi-LLM coverage**: Detect and support popular chat interfaces out of the box.
- **Extensible foundation**: Architect for future overlays, smart variables, and team features without rewrites.

## MVP Scope

| Feature | Description | Status |
| :------ | :---------- | :----- |
| Prompt storage | Save/edit/delete prompts locally | Planned |
| Keyboard shortcut | Trigger injection via `Cmd/Ctrl+K` | In progress |
| Auto-injection | Inject last used prompt into supported LLM input | In progress |
| Context menu add | Save highlighted text to prompt library | Pending |
| Host detection | Recognize ChatGPT, Claude, Perplexity, Gemini | In progress |

## Optional & Future Features

- Smart variables (`{currentDate}`, `{currentURL}`, `{selectedText}`)
- Overlay prompt picker when multiple prompts exist
- Usage analytics dashboard with local aggregation
- Cloud sync (Pro) with end-to-end encryption
- Team libraries and shared prompt packs
- Export/import JSON prompt bundles

## Technical Architecture

### Core Files

- `manifest.json`: declares permissions, scripts, commands
- `background.js`: service worker that reacts to hotkeys, selects prompts, and messages tabs
- `content.js`: per-tab injector that applies prompts to detected inputs and observes DOM changes
- `src/storage/prompts.js`: storage wrapper providing CRUD operations
- `popup.html/js`, `options.html/js`: UI surfaces (to be scaffolded)

### Key APIs & Tools

- `chrome.commands` for global shortcut
- `chrome.storage.local` for prompt persistence
- `chrome.storage.sync` for active prompt selection across tabs
- `chrome.webNavigation` or `scripting` for future page detection enhancements
- `MutationObserver` to handle dynamic DOM updates
- Build tooling: Vite/CRXJS considered for bundling and live reload

## Privacy & Compliance

- Operates locally by default; no network transfer of user prompts
- Clearly communicates required permissions: `storage`, `scripting`, `contextMenus`, `commands`, `webNavigation`
- Optional sync features must use user-controlled encryption keys
- Avoids automated messaging to comply with LLM platform policies

## Monetization Roadmap

1. **Free MVP**: Unlimited local prompts; build trust and gather feedback via communities.
2. **Freemium**: Limit free tier prompts; Pro adds unlimited storage, encrypted sync, team sharing, smart variables.
3. **Team & API**: Workspace libraries, developer API/CLI integrations.
4. **Enterprise Licensing**: Self-hosted prompt vaults with compliance features.

## Development Roadmap (High Level)

1. Scaffold Chrome extension structure (manifest, service worker, content script).
2. Implement local prompt registry with validation and CRUD operations.
3. Deliver keyboard shortcut handler and injection messaging pipeline.
4. Build popup UI for prompt selection and quick actions.
5. Add context menu integration and import/export utilities.
6. Harden DOM detection with selectors per host and fallback observers.
7. Prep Chrome Web Store assets and publish beta.
8. Integrate optional Pro features (sync, smart variables, analytics).

## Success Metrics

- **Activation**: % of users who save ≥3 prompts within first week
- **Retention**: Weekly active users with ≥1 prompt injection event
- **Efficiency**: Time saved per user (self-reported, analytics proxy)
- **NPS/Feedback**: Qualitative input from community channels

## Risks & Mitigations

- **LLM UI changes**: Use configurable selectors and regularly test against target domains.
- **Permission sensitivity**: Keep permission list minimal, justify each in onboarding copy.
- **Competition**: Differentiate through automation, multi-LLM support, and privacy posture.
- **Storage quotas**: Monitor Chrome sync/local limits; chunk data or fall back gracefully.

## Launch Playbook Snapshot

- Validate MVP with 10–15 power users (developers, writers) and gather targeted feedback.
- Prepare marketing assets: landing page, explainer video, prompt pack examples.
- Launch on Product Hunt and relevant subreddits (e.g., r/ChatGPTPro, r/Productivity).
- Capture email signups for roadmap updates and Pro-tier waiting list.

## Long-Term Vision

Context Keeper evolves into a context operating system for knowledge workers: shared libraries, analytics, AI-assisted prompt refinement, and integrations beyond the browser (VS Code, Notion, CLI). The Chrome extension is the first step in delivering context continuity across the AI toolchain.


