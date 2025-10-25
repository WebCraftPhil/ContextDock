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

const SMART_VARIABLES = {
  currentURL: () => window.location.href,
  currentDate: () => new Date().toISOString(),
  selectedText: () => window.getSelection()?.toString() || "",
};

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
});

let currentPrompt = "";
let currentHostConfig = null;
let domObserver = null;
let saveModalElements = null;

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
    currentPrompt = resolveSmartVariables(prompt.content);
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
  currentPrompt = resolveSmartVariables(savedPrompt);

  if (!currentPrompt) {
    console.info("ContextDock: no selected prompt found in storage yet.");
    return;
  }

  setupStorageListener();
  await ensurePromptApplied();
  observeDomForInput();
}

function resolveHostConfig() {
  const hostname = window.location.hostname;

  return Object.entries(HOST_CONFIG).find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`))?.[1] ?? null;
}

function resolveSmartVariables(template) {
  if (!template || typeof template !== "string") {
    return template;
  }

  return template.replace(/\{(currentURL|currentDate|selectedText)\}/g, (_match, key) => {
    const resolver = SMART_VARIABLES[key];
    if (!resolver) {
      return _match;
    }

    try {
      return resolver() ?? "";
    } catch (error) {
      console.error(`ContextDock: failed to resolve smart variable {${key}}`, error);
      return "";
    }
  });
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
  currentPrompt = resolveSmartVariables(updatedPrompt);

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

