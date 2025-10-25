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
const PROMPT_SELECTED_MESSAGE_TYPE = "contextDock.promptSelected";

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

  if (message.type === "contextDock.openPromptOverlay") {
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
let promptOverlay = null;
let promptsCache = [];
let highlightedIndex = -1;

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

  const { prompt, prompts } = payload ?? {};

  if (Array.isArray(prompts) && prompts.length > 1) {
    // TODO: Implement overlay prompt picker.
  }

  if (prompt) {
    currentPrompt = interpolatePrompt(prompt.content);
  }

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

  const savedPrompt = await loadSelectedPrompt();
  currentPrompt = interpolatePrompt(savedPrompt);

  if (!currentPrompt) {
    console.info("ContextDock: no selected prompt found in storage yet.");
    return;
  }

  setupStorageListener();
  await ensurePromptApplied();
  observeDomForInput();
}

async function openPromptOverlay(payload = {}) {
  if (!promptOverlay) {
    promptOverlay = createPromptOverlay();
  }

  promptsCache = Array.isArray(payload.prompts) ? payload.prompts : await getStoredPrompts();
  highlightedIndex = -1;

  updatePromptOverlayList();
  showPromptOverlay();
}

function createPromptOverlay() {
  const container = document.createElement("div");
  container.className = "contextdock-overlay-picker";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "contextdock-overlay-picker__input";
  input.placeholder = "Search prompts...";

  const list = document.createElement("ul");
  list.className = "contextdock-overlay-picker__list";

  container.append(input, list);
  document.body.appendChild(container);

  input.addEventListener("input", () => updatePromptOverlayList());
  input.addEventListener("keydown", handlePromptOverlayKeyDown);

  return { container, input, list };
}

function showPromptOverlay() {
  if (!promptOverlay) {
    return;
  }

  promptOverlay.container.classList.add("contextdock-overlay-picker--visible");
  promptOverlay.input.value = "";
  promptOverlay.input.focus();
  updatePromptOverlayList();
}

function hidePromptOverlay() {
  if (!promptOverlay) {
    return;
  }

  promptOverlay.container.classList.remove("contextdock-overlay-picker--visible");
}

function handlePromptOverlayKeyDown(event) {
  const { key } = event;

  if (key === "Escape") {
    hidePromptOverlay();
    return;
  }

  const visibleItems = Array.from(promptOverlay.list.querySelectorAll("li"));

  if (!visibleItems.length) {
    return;
  }

  if (key === "ArrowDown") {
    event.preventDefault();
    highlightedIndex = (highlightedIndex + 1) % visibleItems.length;
    updateHighlight(visibleItems);
    return;
  }

  if (key === "ArrowUp") {
    event.preventDefault();
    highlightedIndex = (highlightedIndex - 1 + visibleItems.length) % visibleItems.length;
    updateHighlight(visibleItems);
    return;
  }

  if (key === "Enter") {
    event.preventDefault();
    const selectedItem = visibleItems[highlightedIndex] || visibleItems[0];
    if (selectedItem) {
      handlePromptSelection(selectedItem.dataset.promptId || "");
    }
  }
}

function updateHighlight(items) {
  items.forEach((item, index) => {
    if (index === highlightedIndex) {
      item.classList.add("contextdock-overlay-picker__item--highlighted");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("contextdock-overlay-picker__item--highlighted");
    }
  });
}

function updatePromptOverlayList() {
  if (!promptOverlay) {
    return;
  }

  const query = promptOverlay.input.value.toLowerCase();
  const matches = promptsCache.filter((prompt) => {
    if (!query) {
      return true;
    }

    return (
      prompt.title.toLowerCase().includes(query) ||
      prompt.content.toLowerCase().includes(query)
    );
  });

  promptOverlay.list.innerHTML = "";

  matches.forEach((prompt, index) => {
    const item = document.createElement("li");
    item.className = "contextdock-overlay-picker__item";
    item.dataset.promptId = prompt.id;
    item.textContent = prompt.title;

    item.addEventListener("mouseenter", () => {
      highlightedIndex = index;
      updateHighlight(Array.from(promptOverlay.list.querySelectorAll("li")));
    });

    item.addEventListener("click", () => handlePromptSelection(prompt.id));

    promptOverlay.list.appendChild(item);
  });

  highlightedIndex = matches.length ? 0 : -1;
  updateHighlight(Array.from(promptOverlay.list.querySelectorAll("li")));
}

async function handlePromptSelection(promptId) {
  hidePromptOverlay();

  chrome.runtime.sendMessage({
    type: PROMPT_SELECTED_MESSAGE_TYPE,
    payload: {
      promptId,
      tabId: chrome.devtools ? chrome.devtools.inspectedWindow.tabId : null,
    },
  });
}

function getStoredPrompts() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ contextDockPrompts: [] }, (items) => {
      resolve(items.contextDockPrompts || []);
    });
  });
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

function applyPromptToInput(input) {
  if (!input || typeof input.value === "undefined") {
    return;
  }

  if (input.dataset[CONTEXT_DOCK_FLAG] === currentPrompt) {
    return;
  }

  input.value = currentPrompt;
  input.dataset[CONTEXT_DOCK_FLAG] = currentPrompt;

  const inputEvent = new Event("input", { bubbles: true });
  input.dispatchEvent(inputEvent);

  const changeEvent = new Event("change", { bubbles: true });
  input.dispatchEvent(changeEvent);
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

