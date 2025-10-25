# ContextDock

ContextDock is a Chrome extension that keeps your favorite prompts within reach across AI chat interfaces. Save reusable primers, inject them with a keystroke, and stay in flow when switching between ChatGPT, Claude, Perplexity, Gemini, and other LLM tabs.

---

## Table of contents

1. **Overview**
2. **Key capabilities**
3. **Architecture snapshot**
4. **Installation**
5. **Usage**
6. **Development setup**
7. **Testing**
8. **Project roadmap**
9. **Privacy posture**
10. **Contributing**
11. **FAQ**
12. **License**

---

## 1. Overview

Large language model (LLM) chat apps forget your context every time a session resets. ContextDock eliminates the repetitive copy/paste dance by storing your core prompts and injecting them automatically. Whether you're a developer, researcher, marketer, or freelancer, you can maintain a consistent voice and workflow across tools.

```md
ChatGPT     Claude     Perplexity     Gemini
    ↖ prompt storage + sharing layer ↗
```

ContextDock is part of the Context Keeper initiative, a roadmap to deliver context continuity and prompt automation across AI tools.

---

## 2. Key capabilities

- **Prompt library**: Capture, edit, and organize prompts locally with optional tags.
- **Keyboard shortcuts**: Trigger prompt injection with `Ctrl+K` / `Cmd+K` on supported LLM hosts.
- **Auto-injection**: Persist the last used prompt per host and reapply as you open new tabs.
- **Context menu capture**: Highlight text anywhere and save it to your library in a click.
- **Prompt overlay (WIP)**: Search and filter prompts from an in-page overlay when multiple templates exist.
- **Smart variables**: Substitute `{currentURL}`, `{currentDate}`, and `{selectedText}` inside prompts at runtime.
- **Prompt analytics (planned)**: Track usage counts and last-used timestamps for optimization.
- **Local-first privacy**: Your prompts never leave the device unless you explicitly export or enable sync features.

---

## 3. Architecture snapshot

| Layer | File(s) | Responsibilities |
| --- | --- | --- |
| Service worker | `background.js` | Handles keyboard commands, prompt selection logic, storage access, and messaging into tabs. |
| Content script | `content.js` | Detects supported hosts, injects prompts, renders overlays, and manages context menu save modals. |
| Storage module | `src/storage/prompts.js` | Wraps `chrome.storage.local`, enforces prompt schema, tracks usage stats, and supports import/export flows. |
| Utilities | `src/utils/getCurrentLLM.js` | Resolves host metadata and selectors for prompt injection. |
| Docs | `AGENTS.md`, `PROJECT_OVERVIEW.md`, `WORKLOG.md` | Explain responsibilities, roadmap, and historical context. |

ContextDock relies on the Chrome Extensions Manifest V3 architecture with a service worker background script and per-host content scripts.

---

## 4. Installation

### From source

1. Clone the repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the repository folder.
5. The extension appears as "ContextDock" in your toolbar.

### From the Chrome Web Store (coming soon)

An official release is planned after the MVP stabilizes. Track progress in `WORKLOG.md` or join the waitlist at the upcoming landing page.

---

## 5. Usage

### Managing prompts

Click the ContextDock extension icon to open the popup interface:

- **View prompts**: Browse all saved prompts with search functionality
- **Create prompts**: Click "New Prompt" to open the creation modal
- **Edit prompts**: Click the edit button (✏️) on any prompt card
- **Delete prompts**: Click the delete button (🗑️) and confirm deletion

### Creating prompts

The modal includes:

- **Title** (required): A descriptive name for your prompt
- **Tags** (optional): Comma-separated tags for organization
- **Content** (required): The actual prompt text

**Smart variables** supported in content:
- `{currentURL}` - Active tab URL
- `{currentDate}` - User's locale date
- `{selectedText}` - Current text selection

### Saving prompts

Prompts are stored locally with this schema:
```javascript
{
  id: "uuid-string",
  title: "string",
  content: "string",
  tags: ["array", "of", "strings"],
  createdAt: "ISO-date-string"
}
```

### Injecting prompts

- Navigate to a supported LLM (ChatGPT, Claude, Perplexity, Gemini).
- Press `Ctrl+K` (Windows/Linux) or `Cmd+K` (macOS) to open the prompt overlay.
- Search or navigate with arrow keys, hit Enter, and ContextDock injects the prompt into the main input.
- The selected prompt is remembered and re-applied when revisiting the host.

### Context menu capture

- Highlight text on any webpage, right-click, and choose **Add to ContextDock**.
- This opens a modal to save the selected text as a new prompt.

### Importing and exporting

- Use the future popup UI (or messaging API) to export prompts as JSON or import prompt packs.
- The background script uses `chrome.downloads` to write a JSON bundle like `contextdock-prompts-<timestamp>.json`.

---

## 6. Development setup

1. Ensure you have a modern Node.js runtime (>= 18).
2. Install dependencies: `npm install`
3. Modify files in `background.js`, `content.js`, and `src/**` directly.
4. Build CSS: `npm run build` (watch mode) or `npm run build:prod` (production)
5. Reload the extension from `chrome://extensions/` after changes.

### Code style and conventions

- Use ES2020+ features supported by modern Chromium.
- Prefix logs with `ContextDock:` for consistent debugging.
- Keep functions pure where possible; wrap Chrome APIs with promise helpers.
- Follow the storage schema defined in `src/storage/prompts.js` to avoid runtime errors.
- Use TailwindCSS component classes from `STYLE_GUIDE.md` for consistent UI.

### UI Development

ContextDock uses TailwindCSS with custom component classes:

- **Config**: `tailwind.config.js` - Custom colors, fonts, and animations
- **Styles**: `src/css/styles.css` - Component classes and utilities
- **Built CSS**: `dist/styles.css` - Production-ready styles
- **Style Guide**: `STYLE_GUIDE.md` - Complete documentation and examples
- **Demo**: `example.html` - Live preview of all components

Key component classes:
- `.contextdock-card` - Semi-transparent cards with blur
- `.contextdock-button--primary` - Blue gradient buttons with glow
- `.contextdock-input` - Rounded input fields
- `.contextdock-list-item` - Interactive list rows
- `.contextdock-modal` - Overlay modals with backdrop blur

### Modal API

The popup includes a reusable modal system:

```javascript
// Show the create prompt modal
window.ContextDockModal.show();

// Hide the modal
window.ContextDockModal.hide();

// Access storage functions
const prompts = await window.ContextDockModal.getPrompts();
await window.ContextDockModal.savePrompt(promptData);
await window.ContextDockModal.deletePrompt(promptId);
```

For custom modal implementations, access the global functions:
- `window.showCreateModal()` - Show create modal
- `window.editPrompt(id)` - Edit existing prompt
- `window.deletePromptById(id)` - Delete prompt by ID

### Linting & formatting

Linting has not been configured yet. Consider adding ESLint + Prettier if you expand the project.

---

## 7. Testing

Automated tests are not included yet. Recommended approaches:

- **Unit testing**: Target the storage module with Jest or Vitest (enabled via Node + bundler setup).
- **Integration testing**: Use Playwright with Chrome extension support to validate injection flows.
- **Manual scenarios**: Walk through the checklist below after significant changes:
  - Load extension, confirm context menu entry exists.
  - Save a prompt from selected text and verify it appears in storage (via DevTools > Application > Storage).
  - Trigger keyboard shortcut on each supported host and confirm overlay/prompt injection.
  - Check smart variable interpolation correctness.

---

## 8. Project roadmap

Snapshot from `PROJECT_OVERVIEW.md`:

- Prompt storage CRUD (in progress)
- Keyboard shortcut injection (in progress)
- Auto-injection of last used prompt (planned)
- Context menu save flow (in progress)
- Prompt picker overlay (planned)
- Smart variables, analytics, sync, and team features (future)

See `WORKLOG.md` for day-by-day progress and `AGENTS.md` for agent responsibilities.

---

## 9. Privacy posture

- Prompts remain on device by default; no remote servers process prompt content.
- Optional sync (future) will use end-to-end encryption with user-controlled keys.
- ContextDock requests only the permissions it needs (`storage`, `contextMenus`, `scripting`, `webNavigation`, `downloads`).
- No automatic messaging or API calls are made to LLM providers beyond injecting into the UI.

---

## 10. Contributing

Contributions are welcome! To propose changes:

1. Fork the repo and create a feature branch.
2. Make your changes and update documentation if necessary.
3. Test the extension manually (see Section 7).
4. Submit a pull request describing the problem, solution, and testing steps.

Please adhere to the prompt schema validation rules to avoid breaking other agents.

---

## 11. FAQ

**Is ContextDock available on Firefox or other browsers?**
> Not yet. MV3 support and APIs need to be evaluated for each browser.

**Can I share prompts with teammates?**
> Import/export JSON bundles today. Encrypted sync and team libraries are on the roadmap.

**Why does the shortcut sometimes do nothing?**
> The overlay only opens on supported hosts. Ensure the tab URL matches a host listed in `manifest.json` and that prompts exist.

**Will smart variables support custom tokens?**
> Yes, custom token registration is planned via future settings UI.

---

## 12. License

ContextDock is released under the [MIT License](LICENSE).