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

export function interpolatePrompt(template) {
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

function createPromptOverlay() {
  injectOverlayStyles();

  const container = document.createElement("div");
  container.className = "contextdock-prompt-overlay";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", "ContextDock prompt picker");

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search prompts";
  searchInput.className = "contextdock-prompt-overlay__input";
  searchInput.setAttribute("aria-label", "Search saved prompts");

  const list = document.createElement("ul");
  list.className = "contextdock-prompt-overlay__list";

  container.append(searchInput, list);
  document.body.appendChild(container);

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim();
    filteredPrompts = promptsCache.filter((prompt) => fuzzyMatches(query, prompt));
    highlightedIndex = filteredPrompts.length ? 0 : -1;
    renderPromptOverlay();
  });

  searchInput.addEventListener("keydown", handleOverlayKeyNavigation);

  const handleDocumentKeyDown = (event) => {
    if (!promptOverlay || !promptOverlay.container.classList.contains("contextdock-prompt-overlay--visible")) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      hidePromptOverlay();
    }
  };

  const handleDocumentPointerDown = (event) => {
    if (!promptOverlay || !promptOverlay.container.classList.contains("contextdock-prompt-overlay--visible")) {
      return;
    }

    if (!promptOverlay.container.contains(event.target)) {
      hidePromptOverlay();
    }
  };

  document.addEventListener("keydown", handleDocumentKeyDown);
  document.addEventListener("pointerdown", handleDocumentPointerDown, { capture: true });

  return {
    container,
    searchInput,
    list,
  };
}

function showPromptOverlay() {
  if (!promptOverlay) {
    return;
  }

  promptOverlay.container.classList.add("contextdock-prompt-overlay--visible");
  promptOverlay.searchInput.value = "";
  promptOverlay.searchInput.focus({ preventScroll: true });
}

function hidePromptOverlay() {
  if (!promptOverlay) {
    return;
  }

  promptOverlay.container.classList.remove("contextdock-prompt-overlay--visible");
  highlightedIndex = -1;
}

function handleOverlayKeyNavigation(event) {
  if (!filteredPrompts.length) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    highlightedIndex = (highlightedIndex + 1) % filteredPrompts.length;
    renderPromptOverlay();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    highlightedIndex = (highlightedIndex - 1 + filteredPrompts.length) % filteredPrompts.length;
    renderPromptOverlay();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const selected = filteredPrompts[highlightedIndex];
    if (selected) {
      submitPromptSelection(selected.id);
    }
  }
}

function fuzzyMatches(query, prompt) {
  if (!query) {
    return true;
  }

  const haystack = `${prompt.title}\n${typeof prompt.content === "string" ? prompt.content : ""}`.toLowerCase();
  let searchIndex = 0;

  for (const char of query.toLowerCase()) {
    searchIndex = haystack.indexOf(char, searchIndex);
    if (searchIndex === -1) {
      return false;
    }
    searchIndex += 1;
  }

  return true;
}

function renderPromptOverlay() {
  if (!promptOverlay) {
    return;
  }

  promptOverlay.list.innerHTML = "";

  if (!filteredPrompts.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "contextdock-prompt-overlay__item contextdock-prompt-overlay__item--empty";
    emptyItem.textContent = "No prompts found";
    promptOverlay.list.appendChild(emptyItem);
    return;
  }

  filteredPrompts.forEach((prompt, index) => {
    const item = document.createElement("li");
    item.className = "contextdock-prompt-overlay__item";
    if (index === highlightedIndex) {
      item.classList.add("contextdock-prompt-overlay__item--active");
    }

    const title = document.createElement("div");
    title.className = "contextdock-prompt-overlay__title";
    title.textContent = prompt.title;

    const preview = document.createElement("div");
    preview.className = "contextdock-prompt-overlay__preview";
    preview.textContent = (typeof prompt.content === "string" ? prompt.content : "").replace(/\s+/g, " ").slice(0, 160);

    item.append(title, preview);

    item.addEventListener("mouseenter", () => {
      highlightedIndex = index;
      renderPromptOverlay();
    });

    item.addEventListener("click", () => submitPromptSelection(prompt.id));

    promptOverlay.list.appendChild(item);
  });

  const activeItem = promptOverlay.list.querySelector(".contextdock-prompt-overlay__item--active");
  if (activeItem) {
    activeItem.scrollIntoView({ block: "nearest" });
  }
}

function submitPromptSelection(promptId) {
  if (!promptId) {
    return;
  }

  hidePromptOverlay();

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
