const HOST_CONFIG = {
  "chat.openai.com": {
    label: "ChatGPT",
    selectors: ["textarea"],
  },
  "claude.ai": {
    label: "Claude",
    selectors: ["textarea"],
  },
  "perplexity.ai": {
    label: "Perplexity",
    selectors: [], // TODO: Define the precise selector for Perplexity's input.
  },
  "gemini.google.com": {
    label: "Gemini",
    selectors: [], // TODO: Define the precise selector for Gemini's input.
  },
};

const CONTEXT_DOCK_FLAG = "contextDockPrompt";
const INJECT_MESSAGE_TYPE = "contextDock.injectPrompt";
const OPEN_SAVE_MODAL_TYPE = "contextDock.openSaveModal";
const OPEN_PROMPT_OVERLAY_TYPE = "contextDock.openPromptOverlay";
const PROMPT_SELECTED_MESSAGE_TYPE = "contextDock.promptSelected";
const PROMPTS_STORAGE_KEY = "contextDock.prompts";
const DEBUG_OVERLAY_TOGGLE_KEY = "d";
const DEBUG_OVERLAY_ID = "contextdock-debug-overlay";
const DEBUG_OVERLAY_STYLE_ID = "contextdock-debug-overlay-styles";

const SMART_VARIABLES = {
  currentURL: () => window.location.href || "",
  currentDate: () => new Date().toLocaleDateString(),
  selectedText: () => window.getSelection()?.toString() || "",
};

function interpolatePrompt(template) {
  if (!template || typeof template !== "string") {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token) => {
    const provider = SMART_VARIABLES[token];

    if (!provider) {
      return match;
    }

    try {
      const value = provider();
      return value == null ? "" : String(value);
    } catch (error) {
      console.error(`ContextDock: failed to resolve smart variable {${token}}`, error);
      return "";
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === INJECT_MESSAGE_TYPE) {
    handleInjectMessage(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("ContextDock: failed to handle inject message", error);
        sendResponse({ ok: false, error: error?.message });
      });

    return true;
  }

  if (message.type === OPEN_SAVE_MODAL_TYPE) {
    handleOpenSaveModal(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("ContextDock: failed to open save modal", error);
        sendResponse({ ok: false, error: error?.message });
      });

    return true;
  }

  if (message.type === OPEN_PROMPT_OVERLAY_TYPE) {
    openPromptOverlay(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("ContextDock: failed to open prompt overlay", error);
        sendResponse({ ok: false, error: error?.message });
      });

    return true;
  }
});

let currentPrompt = "";
let currentHostConfig = null;
let domObserver = null;
let saveModalElements = null;
let debugOverlayElements = null;
let debugOverlayVisible = false;
let lastInjectedPrompt = "";

async function handleOpenSaveModal(payload) {
  const selectionText = (payload?.selectionText || SMART_VARIABLES.selectedText()).trim();
  const suggestedTitle = (payload?.suggestedTitle || selectionText.split(/\s+/).slice(0, 6).join(" ")).trim();
  const sourceUrl = payload?.sourceUrl || SMART_VARIABLES.currentURL();

  if (!selectionText) {
    console.info("ContextDock: Ignoring save modal request with empty selection");
    return;
  }

  if (!saveModalElements) {
    saveModalElements = createSaveModalElements();
  }

  populateSaveModal(saveModalElements, {
    selectionText,
    suggestedTitle,
    sourceUrl,
  });

  openSaveModal(saveModalElements);
}

async function handleInjectMessage(payload) {
  if (!currentHostConfig) {
    currentHostConfig = resolveHostConfig();
  }

  if (!currentHostConfig) {
    return;
  }

  currentPrompt = "";

  const { prompt } = payload ?? {};

  if (prompt) {
    currentPrompt = interpolatePrompt(prompt.content);
  }

  updateDebugOverlay();

  if (!currentPrompt) {
    return;
  }

  await ensurePromptApplied();
}

init().catch((error) => {
  console.error("ContextDock content script failed to initialize", error);
});

async function init() {
  currentHostConfig = resolveHostConfig();

  if (!currentHostConfig) {
    return;
  }

  await waitForDocumentReady();
  initDebugOverlay();
  updateDebugOverlay();

  const savedPrompt = await loadSelectedPrompt();
  currentPrompt = interpolatePrompt(savedPrompt);
  updateDebugOverlay();

  if (!currentPrompt) {
    console.info("ContextDock: no selected prompt found in storage yet.");
    return;
  }

  setupStorageListener();
  await ensurePromptApplied();
  observeDomForInput();
}

let promptPickerController = null;

async function renderPromptPickerOverlay(options = {}) {
  if (promptPickerController) {
    promptPickerController.update(options);
    return promptPickerController;
  }

  promptPickerController = await createPromptPickerOverlay(options);
  return promptPickerController;
}

async function openPromptOverlay(payload = {}) {
  const prompts = Array.isArray(payload.prompts) ? payload.prompts : await loadStoredPrompts();

  const controller = await renderPromptPickerOverlay({
    prompts,
    lastUsedId: payload.lastUsedId,
    onSelect(promptId) {
      submitPromptSelection(promptId);
    },
    onClose() {
      promptPickerController = null;
    },
  });

  controller.open();
}

async function createPromptPickerOverlay(initialOptions = {}) {
  await ensureTailwindReady();

  const config = {
    onSelect: typeof initialOptions.onSelect === "function" ? initialOptions.onSelect : () => {},
    onClose: typeof initialOptions.onClose === "function" ? initialOptions.onClose : () => {},
  };

  const state = {
    prompts: [],
    filtered: [],
    query: "",
    activeIndex: -1,
    lastUsedId: initialOptions.lastUsedId ?? null,
  };

  const root = document.createElement("div");
  root.className = "contextdock-picker fixed inset-0 z-[2147483646] hidden flex items-end justify-end p-4 md:items-center md:justify-center";
  root.dataset.contextdockPromptPicker = "true";

  const scrim = document.createElement("div");
  scrim.className = "absolute inset-0 bg-slate-950/50 backdrop-blur-sm";

  const cardShell = document.createElement("div");
  cardShell.className = "relative z-10 w-full max-w-md pointer-events-auto md:max-w-lg";

  const card = document.createElement("div");
  card.className = "rounded-3xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 shadow-2xl shadow-slate-950/40 backdrop-blur-xl";

  const header = document.createElement("div");
  header.className = "flex items-center justify-between gap-2 text-xs uppercase tracking-[0.2em] text-slate-400";
  header.textContent = "Prompt Library";

  const inputWrapper = document.createElement("div");
  inputWrapper.className = "relative mt-3";

  const inputIcon = document.createElement("span");
  inputIcon.className = "pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400";
  inputIcon.innerHTML = '<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.5 3.5a5 5 0 013.975 8.025l3 3a.75.75 0 11-1.06 1.06l-3-3A5 5 0 118.5 3.5zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" clip-rule="evenodd"></path></svg>';

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Search saved prompts";
  searchInput.className = "w-full rounded-2xl border border-white/10 bg-white/10 px-9 py-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50";

  inputWrapper.append(inputIcon, searchInput);

  const list = document.createElement("ul");
  list.className = "mt-4 max-h-72 space-y-2 overflow-y-auto pr-1";

  const helpText = document.createElement("p");
  helpText.className = "mt-3 text-xs text-slate-400";
  helpText.textContent = "Use ↑ ↓ to navigate, Enter to inject, Esc to close";

  card.append(header, inputWrapper, list, helpText);
  cardShell.appendChild(card);
  root.append(scrim, cardShell);
  document.body.appendChild(root);

  function updateOptions(options = {}) {
    if (typeof options.onSelect === "function") {
      config.onSelect = options.onSelect;
    }
    if (typeof options.onClose === "function") {
      config.onClose = options.onClose;
    }
    if (options.lastUsedId !== undefined) {
      state.lastUsedId = options.lastUsedId || null;
    }
    if (Array.isArray(options.prompts)) {
      state.prompts = normalizePrompts(options.prompts);
      if (!state.query) {
        state.query = "";
      }
      applyFilter();
    }
  }

  function open() {
    root.classList.remove("hidden");
    root.classList.add("flex");
    searchInput.value = state.query;
    applyFilter();
    requestAnimationFrame(() => {
      searchInput.focus({ preventScroll: true });
      searchInput.select();
    });
  }

  function close() {
    if (root.classList.contains("hidden")) {
      return;
    }
    root.classList.add("hidden");
    root.classList.remove("flex");
    config.onClose();
  }

  function destroy() {
    cleanup();
    root.remove();
  }

  function cleanup() {
    document.removeEventListener("keydown", handleGlobalKeyDown, true);
  }

  function applyFilter() {
    const query = state.query.trim().toLowerCase();
    if (!state.prompts.length) {
      state.filtered = [];
      state.activeIndex = -1;
    } else if (!query) {
      state.filtered = [...state.prompts];
      state.activeIndex = Math.min(
        state.lastUsedId ? state.filtered.findIndex((prompt) => prompt.id === state.lastUsedId) : 0,
        Math.max(state.filtered.length - 1, 0)
      );
    } else {
      const terms = query.split(/\s+/).filter(Boolean);
      state.filtered = state.prompts.filter((prompt) =>
        terms.every((term) =>
          prompt.title.toLowerCase().includes(term) || prompt.content.toLowerCase().includes(term)
        )
      );
      state.activeIndex = state.filtered.length ? 0 : -1;
    }

    if (state.filtered.length && state.activeIndex < 0) {
      state.activeIndex = 0;
    }

    renderList();
  }

  function renderList() {
    list.innerHTML = "";

    if (!state.prompts.length) {
      const empty = document.createElement("li");
      empty.className = "rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-slate-400";
      empty.textContent = "You haven't saved any prompts yet.";
      list.appendChild(empty);
      return;
    }

    if (!state.filtered.length) {
      const empty = document.createElement("li");
      empty.className = "rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-slate-400";
      empty.textContent = "No prompts match your search.";
      list.appendChild(empty);
      return;
    }

    state.filtered.forEach((prompt, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.promptId = prompt.id;
      button.className = "w-full rounded-2xl border border-transparent bg-white/5 px-4 py-3 text-left transition duration-150 hover:border-indigo-400/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60";

      if (index === state.activeIndex) {
        button.classList.add("border-indigo-400/60", "bg-indigo-500/10", "shadow", "shadow-indigo-900/30");
      }

      const titleLine = document.createElement("div");
      titleLine.className = "flex items-center justify-between gap-2 text-sm font-semibold text-slate-100";
      titleLine.appendChild(highlightTextContent(prompt.title, state.query));

      const previewLine = document.createElement("div");
      previewLine.className = "mt-1 text-xs leading-relaxed text-slate-300";
      previewLine.appendChild(highlightTextContent(createSnippet(prompt.content), state.query));

      button.append(titleLine, previewLine);

      button.addEventListener("mouseenter", () => {
        state.activeIndex = index;
        renderList();
      });

      button.addEventListener("click", () => {
        selectPrompt(index);
      });

      list.appendChild(button);
    });

    ensureActiveVisible();
  }

  function ensureActiveVisible() {
    if (state.activeIndex < 0) {
      return;
    }
    const activeButton = list.querySelectorAll("button")[state.activeIndex];
    if (activeButton) {
      activeButton.scrollIntoView({ block: "nearest" });
    }
  }

  function moveActive(step) {
    if (!state.filtered.length) {
      return;
    }
    const total = state.filtered.length;
    state.activeIndex = (state.activeIndex + step + total) % total;
    renderList();
  }

  function selectPrompt(index) {
    const prompt = state.filtered[index];
    if (!prompt) {
      return;
    }
    close();
    config.onSelect(prompt.id);
  }

  function handleGlobalKeyDown(event) {
    if (root.classList.contains("hidden")) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }

    if (event.key === "Enter") {
      if (document.activeElement === searchInput || root.contains(document.activeElement)) {
        event.preventDefault();
        selectPrompt(state.activeIndex);
      }
    }
  }

  function handleInput(event) {
    state.query = event.target.value;
    applyFilter();
  }

  function handleScrimClick(event) {
    if (event.target === scrim) {
      close();
    }
  }

  scrim.addEventListener("click", handleScrimClick);
  searchInput.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleGlobalKeyDown, true);

  updateOptions(initialOptions);

  return {
    open,
    close,
    update: updateOptions,
    destroy,
  };
}

function submitPromptSelection(promptId) {
  if (!promptId) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: PROMPT_SELECTED_MESSAGE_TYPE,
      payload: { promptId },
    },
    (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        console.error("ContextDock: failed to notify background about prompt selection", error);
        return;
      }

      if (response && response.ok === false) {
        console.error("ContextDock: background rejected prompt selection", response.error);
      }
      const controller = promptPickerController;
      if (controller) {
        controller.close();
      }
    }
  );
}

function loadStoredPrompts() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [PROMPTS_STORAGE_KEY]: [] }, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error("ContextDock: failed to read saved prompts", error);
        resolve([]);
        return;
      }

      const prompts = items?.[PROMPTS_STORAGE_KEY];
      resolve(Array.isArray(prompts) ? prompts : []);
    });
  });
}

function injectOverlayStyles() {
  if (document.getElementById("contextdock-prompt-overlay-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "contextdock-prompt-overlay-styles";
  style.textContent = `
    .contextdock-prompt-overlay {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: min(460px, 90vw);
      max-height: 70vh;
      display: none;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(10px);
      box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
      color: #f8fafc;
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .contextdock-prompt-overlay--visible {
      display: flex;
    }

    .contextdock-prompt-overlay__input {
      width: 100%;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid rgba(100, 116, 139, 0.4);
      background: rgba(15, 23, 42, 0.6);
      color: inherit;
      font-size: 15px;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .contextdock-prompt-overlay__input::placeholder {
      color: rgba(226, 232, 240, 0.6);
    }

    .contextdock-prompt-overlay__input:focus {
      border-color: rgba(129, 140, 248, 0.7);
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
    }

    .contextdock-prompt-overlay__list {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      max-height: 50vh;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .contextdock-prompt-overlay__item {
      border-radius: 12px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background-color 0.12s ease, transform 0.12s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .contextdock-prompt-overlay__item:hover,
    .contextdock-prompt-overlay__item--active {
      background-color: rgba(99, 102, 241, 0.18);
      transform: translateY(-1px);
    }

    .contextdock-prompt-overlay__item--empty {
      text-align: center;
      color: rgba(226, 232, 240, 0.6);
      cursor: default;
    }

    .contextdock-prompt-overlay__title {
      font-size: 15px;
      font-weight: 600;
      color: #e2e8f0;
    }

    .contextdock-prompt-overlay__preview {
      font-size: 13px;
      color: rgba(226, 232, 240, 0.7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (prefers-color-scheme: light) {
      .contextdock-prompt-overlay {
        background: rgba(255, 255, 255, 0.95);
        color: #0f172a;
      }

      .contextdock-prompt-overlay__input {
        background: rgba(248, 250, 252, 0.9);
      }

      .contextdock-prompt-overlay__item:hover,
      .contextdock-prompt-overlay__item--active {
        background-color: rgba(79, 70, 229, 0.12);
      }

      .contextdock-prompt-overlay__preview {
        color: rgba(51, 65, 85, 0.7);
      }
    }
  `;

  document.head.appendChild(style);
}

function resolveHostConfig() {
  const hostname = window.location.hostname;

  return Object.entries(HOST_CONFIG).find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`))?.[1] ?? null;
}


function waitForDocumentReady() {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function loadSelectedPrompt() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ selectedPrompt: "" }, (items) => {
      resolve(items.selectedPrompt || "");
    });
  });
}

function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.selectedPrompt) {
      return;
    }

    const updatedPrompt = changes.selectedPrompt.newValue || "";
    currentPrompt = interpolatePrompt(updatedPrompt);

    if (!currentPrompt) {
      return;
    }

    ensurePromptApplied().catch((error) => {
      console.error("ContextDock failed to re-apply prompt after storage change", error);
    });
  });
}

async function ensurePromptApplied() {
  if (!currentHostConfig || !currentPrompt) {
    return;
  }

  const target = await waitForInputElement();

  if (!target) {
    console.warn(`ContextDock: unable to locate input for ${currentHostConfig.label}.`);
    return;
  }

  applyPromptToInput(target);
}

function waitForInputElement() {
  return new Promise((resolve) => {
    const existing = findInputElement();
    if (existing) {
      resolve(existing);
      return;
    }

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 15000);

    const observer = new MutationObserver(() => {
      const node = findInputElement();
      if (node) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(node);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function findInputElement() {
  if (!currentHostConfig) {
    return null;
  }

  for (const selector of currentHostConfig.selectors) {
    const node = document.querySelector(selector);
    if (node) {
      return node;
    }
  }

  return null;
}

function applyPromptToInput(input, options = {}) {
  const { force = false } = options;
  if (!input || typeof input.value === "undefined") {
    return;
  }

  if (!force && input.dataset[CONTEXT_DOCK_FLAG] === currentPrompt) {
    return;
  }

  input.value = currentPrompt;
  input.dataset[CONTEXT_DOCK_FLAG] = currentPrompt;

  const inputEvent = new Event("input", { bubbles: true });
  input.dispatchEvent(inputEvent);

  const changeEvent = new Event("change", { bubbles: true });
  input.dispatchEvent(changeEvent);

  lastInjectedPrompt = currentPrompt;
  updateDebugOverlay();
}

function observeDomForInput() {
  if (domObserver) {
    domObserver.disconnect();
  }

  domObserver = new MutationObserver(() => {
    const input = findInputElement();

    if (!input) {
      return;
    }

    applyPromptToInput(input);
  });

  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function initDebugOverlay() {
  if (debugOverlayElements || !document.body) {
    return;
  }

  injectDebugOverlayStyles();

  const container = document.createElement("section");
  container.id = DEBUG_OVERLAY_ID;
  container.className = "contextdock-debug-overlay";
  container.setAttribute("aria-label", "ContextDock debug overlay");

  const header = document.createElement("div");
  header.className = "contextdock-debug-overlay__header";

  const title = document.createElement("span");
  title.className = "contextdock-debug-overlay__title";
  title.textContent = "ContextDock Debug";

  const site = document.createElement("span");
  site.className = "contextdock-debug-overlay__site";
  site.textContent = window.location.hostname;

  header.append(title, site);

  const promptLabel = document.createElement("div");
  promptLabel.className = "contextdock-debug-overlay__label";
  promptLabel.textContent = "Last injected prompt";

  const promptPreview = document.createElement("pre");
  promptPreview.className = "contextdock-debug-overlay__prompt";
  promptPreview.textContent = "No prompt injected yet";

  const actions = document.createElement("div");
  actions.className = "contextdock-debug-overlay__actions";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "contextdock-debug-overlay__button";
  clearButton.textContent = "Clear Injection";

  const reinjectButton = document.createElement("button");
  reinjectButton.type = "button";
  reinjectButton.className = "contextdock-debug-overlay__button contextdock-debug-overlay__button--primary";
  reinjectButton.textContent = "Re-Inject";

  clearButton.addEventListener("click", clearInjectedPrompt);
  reinjectButton.addEventListener("click", reinjectPrompt);

  actions.append(clearButton, reinjectButton);
  container.append(header, promptLabel, promptPreview, actions);

  document.body.appendChild(container);

  debugOverlayElements = {
    container,
    site,
    promptPreview,
    reinjectButton,
  };

  document.addEventListener("keydown", handleDebugOverlayShortcut, { passive: false });
}

function toggleDebugOverlay(forceVisible) {
  if (!debugOverlayElements) {
    return;
  }

  const nextState = typeof forceVisible === "boolean" ? forceVisible : !debugOverlayVisible;
  debugOverlayVisible = nextState;
  debugOverlayElements.container.classList.toggle("contextdock-debug-overlay--visible", nextState);
}

function handleDebugOverlayShortcut(event) {
  if (!event.ctrlKey || !event.shiftKey) {
    return;
  }

  if ((event.key || "").toLowerCase() !== DEBUG_OVERLAY_TOGGLE_KEY) {
    return;
  }

  event.preventDefault();
  toggleDebugOverlay();
}

function updateDebugOverlay() {
  if (!debugOverlayElements) {
    return;
  }

  const siteLabel = currentHostConfig?.label || window.location.hostname || "Unknown host";
  debugOverlayElements.site.textContent = siteLabel;

  debugOverlayElements.promptPreview.textContent = lastInjectedPrompt || "No prompt injected yet";
  debugOverlayElements.reinjectButton.disabled = !currentPrompt;
}

function clearInjectedPrompt() {
  const input = findInputElement();
  if (!input) {
    return;
  }

  input.value = "";
  delete input.dataset[CONTEXT_DOCK_FLAG];

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function reinjectPrompt() {
  if (!currentPrompt) {
    return;
  }

  const input = findInputElement();
  if (!input) {
    return;
  }

  applyPromptToInput(input, { force: true });
}

function injectDebugOverlayStyles() {
  if (document.getElementById(DEBUG_OVERLAY_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = DEBUG_OVERLAY_STYLE_ID;
  style.textContent = `
    .contextdock-debug-overlay {
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 280px;
      padding: 12px 14px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.92);
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.35);
      z-index: 2147483646;
      display: none;
    }

    .contextdock-debug-overlay--visible {
      display: block;
    }

    .contextdock-debug-overlay__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .contextdock-debug-overlay__title {
      font-weight: 600;
    }

    .contextdock-debug-overlay__site {
      color: rgba(248, 250, 252, 0.8);
    }

    .contextdock-debug-overlay__label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
      color: rgba(248, 250, 252, 0.65);
    }

    .contextdock-debug-overlay__prompt {
      max-height: 120px;
      overflow: auto;
      margin: 0 0 10px;
      padding: 8px;
      border-radius: 6px;
      background: rgba(15, 23, 42, 0.6);
      font-size: 12px;
      white-space: pre-wrap;
    }

    .contextdock-debug-overlay__actions {
      display: flex;
      gap: 8px;
    }

    .contextdock-debug-overlay__button {
      flex: 1;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid rgba(248, 250, 252, 0.4);
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .contextdock-debug-overlay__button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .contextdock-debug-overlay__button--primary {
      background: rgba(248, 250, 252, 0.15);
      border-color: rgba(248, 250, 252, 0.6);
    }

    @media (prefers-color-scheme: light) {
      .contextdock-debug-overlay {
        background: rgba(255, 255, 255, 0.94);
        color: #0f172a;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
      }

      .contextdock-debug-overlay__prompt {
        background: rgba(15, 23, 42, 0.06);
      }

      .contextdock-debug-overlay__button {
        border-color: rgba(15, 23, 42, 0.2);
      }

      .contextdock-debug-overlay__button--primary {
        background: rgba(15, 23, 42, 0.08);
        border-color: rgba(15, 23, 42, 0.3);
      }
    }
  `;

  document.head.appendChild(style);
}

function createSaveModalElements() {
  const overlay = document.createElement("div");
  overlay.className = "contextdock-overlay";

  const modal = document.createElement("div");
  modal.className = "contextdock-modal";

  const title = document.createElement("h2");
  title.textContent = "Add to ContextDock";
  title.className = "contextdock-modal__title";

  const form = document.createElement("form");
  form.className = "contextdock-modal__form";
  form.autocomplete = "off";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Title";
  nameLabel.className = "contextdock-modal__label";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.name = "title";
  nameInput.required = true;
  nameInput.placeholder = "e.g. Friendly follow-up";
  nameInput.className = "contextdock-modal__input";

  const tagsLabel = document.createElement("label");
  tagsLabel.textContent = "Tags (comma separated)";
  tagsLabel.className = "contextdock-modal__label";

  const tagsInput = document.createElement("input");
  tagsInput.type = "text";
  tagsInput.name = "tags";
  tagsInput.placeholder = "sales, troubleshooting";
  tagsInput.className = "contextdock-modal__input";

  const snippetLabel = document.createElement("label");
  snippetLabel.textContent = "Snippet";
  snippetLabel.className = "contextdock-modal__label";

  const snippetArea = document.createElement("textarea");
  snippetArea.name = "snippet";
  snippetArea.required = true;
  snippetArea.rows = 6;
  snippetArea.className = "contextdock-modal__textarea";

  const sourceLabel = document.createElement("label");
  sourceLabel.textContent = "Source URL";
  sourceLabel.className = "contextdock-modal__label";

  const sourceInput = document.createElement("input");
  sourceInput.type = "url";
  sourceInput.name = "source";
  sourceInput.placeholder = "https://...";
  sourceInput.className = "contextdock-modal__input";

  const errorText = document.createElement("div");
  errorText.className = "contextdock-modal__error";

  const actionsRow = document.createElement("div");
  actionsRow.className = "contextdock-modal__actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.className = "contextdock-modal__button contextdock-modal__button--secondary";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save";
  saveButton.className = "contextdock-modal__button contextdock-modal__button--primary";

  actionsRow.append(cancelButton, saveButton);
  form.append(
    nameLabel,
    nameInput,
    tagsLabel,
    tagsInput,
    snippetLabel,
    snippetArea,
    sourceLabel,
    sourceInput,
    errorText,
    actionsRow
  );

  modal.append(title, form);
  overlay.append(modal);

  cancelButton.addEventListener("click", () => closeSaveModal({ overlay }));

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeSaveModal({ overlay });
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSaveModalSubmit({
      form,
      nameInput,
      tagsInput,
      snippetArea,
      sourceInput,
      errorText,
      overlay,
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!overlay.isConnected) {
      return;
    }

    if (event.key === "Escape") {
      closeSaveModal({ overlay });
    }
  });

  injectSaveModalStyles();

  return {
    overlay,
    modal,
    form,
    nameInput,
    tagsInput,
    snippetArea,
    sourceInput,
    errorText,
  };
}

function populateSaveModal(elements, { selectionText, suggestedTitle, sourceUrl }) {
  const { overlay, nameInput, tagsInput, snippetArea, sourceInput, errorText } = elements;

  if (!overlay.isConnected) {
    document.body.appendChild(overlay);
  }

  nameInput.value = suggestedTitle || "";
  tagsInput.value = "";
  snippetArea.value = selectionText;
  sourceInput.value = sourceUrl || "";
  errorText.textContent = "";

  nameInput.focus();
  nameInput.select();
}

function openSaveModal(elements) {
  elements.overlay.classList.add("contextdock-overlay--visible");
}

function closeSaveModal({ overlay }) {
  overlay.classList.remove("contextdock-overlay--visible");
  setTimeout(() => {
    if (overlay.parentElement) {
      overlay.parentElement.removeChild(overlay);
    }
  }, 200);
}

async function handleSaveModalSubmit({
  form,
  nameInput,
  tagsInput,
  snippetArea,
  sourceInput,
  errorText,
  overlay,
}) {
  const title = nameInput.value.trim();
  const snippet = snippetArea.value.trim();
  const sourceUrl = sourceInput.value.trim();
  const tags = tagsInput.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!title) {
    errorText.textContent = "Title is required.";
    nameInput.focus();
    return;
  }

  if (!snippet) {
    errorText.textContent = "Snippet is required.";
    snippetArea.focus();
    return;
  }

  form.classList.add("contextdock-modal__form--saving");
  errorText.textContent = "";

  try {
    const prompt = {
      id: generatePromptId(),
      title,
      tags,
      content: snippet,
      createdAt: new Date().toISOString(),
      sourceUrl,
      host: window.location.hostname,
    };

    await persistPrompt(prompt);
    closeSaveModal({ overlay });
  } catch (error) {
    console.error("ContextDock: failed to save prompt", error);
    errorText.textContent = "Failed to save prompt. Please try again.";
  } finally {
    form.classList.remove("contextdock-modal__form--saving");
  }
}

async function persistPrompt(prompt) {
  const prompts = await loadSavedPrompts();
  prompts.push(prompt);
  await setSavedPrompts(prompts);
}

function loadSavedPrompts() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ savedPrompts: [] }, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }

      resolve(Array.isArray(items.savedPrompts) ? items.savedPrompts : []);
    });
  });
}

function setSavedPrompts(prompts) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ savedPrompts: prompts }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function generatePromptId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function injectSaveModalStyles() {
  if (document.getElementById("contextdock-modal-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "contextdock-modal-styles";
  style.textContent = `
    .contextdock-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(15, 23, 42, 0.45);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
      z-index: 2147483646;
    }

    .contextdock-overlay--visible {
      opacity: 1;
      visibility: visible;
    }

    .contextdock-modal {
      width: min(480px, 92vw);
      max-height: 80vh;
      overflow-y: auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0f172a;
    }

    .contextdock-modal__title {
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .contextdock-modal__form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .contextdock-modal__form--saving {
      opacity: 0.7;
      pointer-events: none;
    }

    .contextdock-modal__label {
      font-size: 13px;
      font-weight: 500;
      color: #334155;
    }

    .contextdock-modal__input,
    .contextdock-modal__textarea {
      width: 100%;
      font-size: 14px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid #cbd5f5;
      color: #0f172a;
      background: #f8fafc;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .contextdock-modal__input:focus,
    .contextdock-modal__textarea:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
      background: #ffffff;
    }

    .contextdock-modal__textarea {
      resize: vertical;
      min-height: 132px;
    }

    .contextdock-modal__error {
      min-height: 18px;
      font-size: 13px;
      color: #dc2626;
    }

    .contextdock-modal__actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }

    .contextdock-modal__button {
      min-width: 96px;
      font-size: 14px;
      font-weight: 500;
      border-radius: 20px;
      border: none;
      padding: 9px 18px;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .contextdock-modal__button--primary {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      color: white;
      box-shadow: 0 10px 20px rgba(79, 70, 229, 0.24);
    }

    .contextdock-modal__button--primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 24px rgba(79, 70, 229, 0.28);
    }

    .contextdock-modal__button--secondary {
      background: #e2e8f0;
      color: #1e293b;
    }

    .contextdock-modal__button--secondary:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 16px rgba(148, 163, 184, 0.24);
    }

    @media (prefers-color-scheme: dark) {
      .contextdock-modal {
        background: #0f172a;
        color: #e2e8f0;
      }

      .contextdock-modal__label {
        color: #cbd5f5;
      }

      .contextdock-modal__input,
      .contextdock-modal__textarea {
        background: #1e293b;
        border-color: #334155;
        color: #e2e8f0;
      }

      .contextdock-modal__input:focus,
      .contextdock-modal__textarea:focus {
        background: #0f172a;
        border-color: #818cf8;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.38);
      }

      .contextdock-modal__button--secondary {
        background: #1f2937;
        color: #f8fafc;
      }
    }
  `;

  document.head.appendChild(style);
}

function createSnippet(content) {
  if (typeof content !== "string") {
    return "";
  }

  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177)}…`;
}

function highlightTextContent(text, query) {
  const fragment = document.createDocumentFragment();
  const term = (query || "").trim();

  if (!text || !term) {
    fragment.appendChild(document.createTextNode(text || ""));
    return fragment;
  }

  const regex = new RegExp(`(${escapeRegExp(term)})`, "ig");
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const mark = document.createElement("mark");
    mark.className = "contextdock-highlight";
    mark.textContent = match[0];
    fragment.appendChild(mark);

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  return fragment;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePrompts(prompts) {
  return prompts
    .filter((prompt) => prompt && typeof prompt.id === "string" && typeof prompt.title === "string" && typeof prompt.content === "string")
    .map((prompt) => ({
      id: prompt.id,
      title: prompt.title.trim() || "Untitled prompt",
      content: prompt.content,
    }));
}

async function ensureTailwindReady() {
  if (document.documentElement.classList.contains("contextdock-tailwind-ready")) {
    return;
  }

  await loadTailwindRuntime();
  document.documentElement.classList.add("contextdock-tailwind-ready");
}

function loadTailwindRuntime() {
  if (window.tailwind?.version) {
    return Promise.resolve();
  }

  if (document.getElementById("contextdock-tailwind-cdn")) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById("contextdock-tailwind-cdn");
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "contextdock-tailwind-cdn";
    script.src = "https://cdn.tailwindcss.com";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";

    script.addEventListener("load", () => {
      if (window.tailwind?.config) {
        tailwind.config = {
          theme: {
            extend: {
              colors: {
                dock: {
                  500: "#6366f1",
                  600: "#4f46e5",
                  700: "#4338ca",
                },
              },
              fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
              },
            },
          },
        };
      }
      resolve();
    });

    script.addEventListener("error", () => {
      reject(new Error("Failed to load Tailwind runtime"));
    });

    document.head.appendChild(script);
  });
}
