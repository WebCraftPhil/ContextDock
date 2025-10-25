const CONTEXT_MENU_ID = "contextdock-add-selection";

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  const selectionText = (info.selectionText || "").trim();

  if (!selectionText) {
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "contextDock.openSaveModal",
      payload: {
        selectionText,
        sourceUrl: info.pageUrl || tab.url || "",
        suggestedTitle: selectionText.split(/\s+/).slice(0, 6).join(" "),
      },
    },
    () => void chrome.runtime.lastError
  );
});

async function setupContextMenus() {
  try {
    await chrome.contextMenus.removeAll();
  } catch (error) {
    console.warn("ContextDock: failed to remove existing context menus", error);
  }

  try {
    await chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Add to ContextDock",
      contexts: ["selection"],
    });
  } catch (error) {
    console.error("ContextDock: failed to register context menu", error);
  }
}
import { getPrompts, exportPrompts, importPrompts, recordPromptUsage } from './src/storage/prompts.js';

const OPEN_PROMPT_OVERLAY_TYPE = 'contextDock.openPromptOverlay';
const PROMPT_SELECTED_TYPE = 'contextDock.promptSelected';

const LAST_USED_PROMPT_KEY = 'contextDock.lastUsedPromptId';

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'trigger-context-dock') {
    return;
  }

  try {
    const tab = await queryActiveTab();
    if (!tab) {
      return;
    }

    if (!isSupportedUrl(tab.url)) {
      return;
    }

    const prompts = await getPrompts();
    chrome.tabs.sendMessage(tab.id, {
      type: OPEN_PROMPT_OVERLAY_TYPE,
      payload: {
        prompts,
        lastUsedId: await getLastUsedPromptId(),
      },
    });
  } catch (error) {
    console.error('ContextDock: Failed to handle keyboard shortcut.', error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === PROMPT_SELECTED_TYPE) {
    handlePromptSelected(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error('ContextDock: Failed to process prompt selection', error);
        sendResponse({ ok: false, error: error?.message });
      });

    return true;
  }

  if (message.type === 'contextDock.exportPrompts') {
    handleExportPrompts(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error('ContextDock: Failed to export prompts', error);
        sendResponse({ ok: false, error: error?.message });
      });

    return true;
  }

  if (message.type === 'contextDock.importPrompts') {
    handleImportPrompts(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error('ContextDock: Failed to import prompts', error);
        sendResponse({ ok: false, error: error?.message });
      });

    return true;
  }
});

function resolvePrompt(prompts, lastUsedId) {
  if (lastUsedId) {
    const match = prompts.find((prompt) => prompt.id === lastUsedId);
    if (match) {
      return match;
    }
  }

  return prompts[prompts.length - 1] ?? null;
}

function getLastUsedPromptId() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([LAST_USED_PROMPT_KEY], (items) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(items?.[LAST_USED_PROMPT_KEY] || null);
    });
  });
}

function setLastUsedPromptId(promptId) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [LAST_USED_PROMPT_KEY]: promptId }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs?.[0] ?? null);
    });
  });
}

function isSupportedUrl(url) {
  if (!url) {
    return false;
  }

  const supportedOrigins = [
    'https://chat.openai.com/',
    'https://claude.ai/',
    'https://perplexity.ai/',
    'https://gemini.google.com/',
  ];

  return supportedOrigins.some((origin) => url.startsWith(origin));
}

async function handlePromptSelected(payload = {}) {
  const { promptId, tabId } = payload;

  if (!promptId || typeof promptId !== 'string') {
    throw new TypeError('Prompt selection must include promptId string.');
  }

  const prompts = await getPrompts();
  const selectedPrompt = prompts.find((prompt) => prompt.id === promptId);

  if (!selectedPrompt) {
    throw new Error(`Prompt with id ${promptId} not found.`);
  }

  await setLastUsedPromptId(promptId);

  if (typeof tabId === 'number') {
    chrome.tabs.sendMessage(tabId, {
      type: 'contextDock.injectPrompt',
      payload: {
        prompt: selectedPrompt,
        prompts,
      },
    });

    await recordPromptUsage(selectedPrompt.id);
  }

  return { promptId };
}

async function handleExportPrompts(payload = {}) {
  const json = await exportPrompts();
  const filename = payload?.filename || `contextdock-prompts-${Date.now()}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: Boolean(payload?.saveAs),
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  return { filename };
}

async function handleImportPrompts(payload = {}) {
  const { rawData } = payload;

  if (typeof rawData !== 'string') {
    throw new TypeError('Import payload must include rawData string.');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch (error) {
    throw new Error('Invalid JSON supplied for prompt import.');
  }

  const { prompts, added } = await importPrompts(parsed);
  return {
    total: prompts.length,
    added: added.length,
  };
}

