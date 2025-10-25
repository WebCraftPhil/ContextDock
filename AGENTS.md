# Context Keeper Agents Handbook

## Purpose

This handbook explains the responsibilities, collaboration contracts, and extension points for every agent (script or service surface) that powers Context Keeper. Use it to understand how background automation, content injection, storage, and future UI layers coordinate.

## Agent Directory

| Agent | Location | Runtime | Primary Responsibilities |
| :---- | :------- | :------ | :----------------------- |
| Background Command Dispatcher | `background.js` | Service worker | Listen for keyboard shortcuts, select prompts, dispatch injections |
| Content Prompt Injector | `content.js` | Content script (per LLM tab) | Detect supported hosts, apply prompts to inputs, react to storage changes |
| Prompt Registry | `src/storage/prompts.js` | Shared module | Normalize, validate, persist prompt data in `chrome.storage.local` |
| Prompt Picker Overlay *(planned)* | TBD (`/src/ui/`) | Injected content UI | Present multi-prompt selector when multiple prompts exist |
| Sync & Sharing Service *(future)* | TBD (`/src/sync/`) | Background + cloud | Handle encrypted sync, import/export bundles, telemetry |

## Agent Playbooks

### Background Command Dispatcher (`background.js`)

- Reacts to `chrome.commands` events for `trigger-context-dock`.
- Queries the active tab, verifies host support via `isSupportedUrl`, and retrieves prompts with `getPrompts()`.
- Applies the “last used prompt” heuristic by reading `contextDock.lastUsedPromptId` from `chrome.storage.local`.
- Sends `contextDock.injectPrompt` messages to the active tab with the chosen prompt plus the full prompt collection for UI overlays.
- Persists the latest prompt selection through `setLastUsedPromptId` so that multi-tab workflows stay consistent.

**Collaboration contracts**

1. Sends structured messages: `{ type: 'contextDock.injectPrompt', payload: { prompt, prompts } }`.
2. Requires `getPrompts()` to resolve normalized prompt objects containing `id`, `title`, `content`, and optional `tags`.
3. Depends on content scripts to gracefully handle unsupported hosts.

### Content Prompt Injector (`content.js`)

- Resolves host metadata from `HOST_CONFIG` and waits for document readiness.
- Loads `selectedPrompt` from `chrome.storage.sync` on init to support automatic injection on page load.
- Listens for runtime messages and `chrome.storage.onChanged` events to re-apply prompts in near real time.
- Locates the primary LLM input via registered selectors and augments it with stored prompt text while emitting synthetic `input` and `change` events to trigger UI updates.
- Uses a `MutationObserver` to ensure prompts remain applied when sites replace DOM nodes (common in SPA-style chat UIs).

**Collaboration contracts**

1. Expects prompt payloads from background messages to include `content` (string) and `id` (string).
2. Marks injected inputs with the `data-contextDockPrompt` flag to avoid redundant updates.
3. Emits logs prefixed with `ContextDock:` for consistent debugging in DevTools.

### Prompt Registry (`src/storage/prompts.js`)

- Wraps `chrome.storage.local` access with promise-based helpers to enable async/await usage across agents.
- Provides input sanitation (`normalizePrompt`) and schema enforcement (`validatePrompt`).
- Supports create/update/delete flows and exposes a testing surface via the `__testing` namespace for unit tests.
- Guarantees immutability by cloning tag arrays and rejecting invalid prompt shapes early.

**Collaboration contracts**

1. Promise-based API: `getPrompts`, `savePrompt`, `deletePrompt`, `updatePrompt`, `clearPrompts`.
2. Prompt schema:
   - `id`: non-empty string (unique).
   - `title`: non-empty string for quick selection.
   - `content`: non-empty string containing the injection text.
   - `tags`: optional array of strings (used for grouping).
3. Throws descriptive errors (TypeError) when schema validation fails—agents must catch and surface these to users.

### Planned Agents

- **Prompt Picker Overlay**: Triggered when more than one prompt is available. Should receive `{ prompts, lastUsedId }` via background messages, render the selection UI in-page, and send the user’s choice back through `chrome.runtime.sendMessage`.
- **Sync & Sharing Service**: Handles encrypted sync (Pro tier) and import/export of prompt packs. Will likely share a contract with any future API or CLI integrations.
- **Analytics & Telemetry Collector** *(optional)*: Aggregates usage counts locally and powers optional dashboards. Must respect privacy guidelines; default to opt-in with anonymized metadata.

## Messaging Matrix

| From | To | Channel | Payload |
| :--- | :-- | :------ | :------- |
| Background | Content script | `chrome.tabs.sendMessage` | `{ type: 'contextDock.injectPrompt', payload: { prompt, prompts } }` |
| Content script | Chrome Storage | `chrome.storage.sync` | `{ selectedPrompt: string }` (current auto-inject prompt) |
| Future overlay | Background | `chrome.runtime.sendMessage` | `{ type: 'contextDock.promptSelected', payload: { id } }` |

Keep payloads serializable (no functions, no DOM nodes) and version them if structures change.

## Data Lifecycles

- **Prompt persistence**: `chrome.storage.local` stores the canonical prompt set under `contextDock.prompts`.
- **Session selection**: `chrome.storage.sync` holds the active prompt per user to enable cross-device defaults (subject to quota limits).
- **Last used prompt**: Service worker-specific key `contextDock.lastUsedPromptId` ensures consistent keyboard shortcut behavior.

## Observability & Debugging

- All agents should prefix logs with `ContextDock:`.
- Catch and surface `chrome.runtime.lastError` to aid debugging against storage permission issues.
- For content scripts, test selectors against staging versions of LLM UIs and add fallback detection with `MutationObserver`.

## Adding a New Agent

1. **Define responsibility**: Document the goal, entry points, and dependencies in this handbook.
2. **Specify contracts**: Outline expected message payloads, storage keys, or DOM hooks before implementation.
3. **Update manifest**: Grant minimal permissions and register scripts/commands.
4. **Document testing**: Describe manual test cases or automated coverage.
5. **Revise this file**: Add the agent to the directory and provide a short playbook so teammates can reason about integration quickly.

Maintaining disciplined agent roles keeps Context Keeper reliable as it scales from MVP automation to full multi-LLM workflow assistant.


