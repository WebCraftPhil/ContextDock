import { getPrompts } from './src/storage/prompts.js';

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
    if (!prompts.length) {
      console.info('ContextDock: No saved prompts to inject.');
      return;
    }

    const lastUsedId = await getLastUsedPromptId();
    const chosenPrompt = resolvePrompt(prompts, lastUsedId);

    if (!chosenPrompt) {
      console.warn('ContextDock: Unable to find a prompt to inject.');
      return;
    }

    await setLastUsedPromptId(chosenPrompt.id);

    chrome.tabs.sendMessage(tab.id, {
      type: 'contextDock.injectPrompt',
      payload: {
        prompt: chosenPrompt,
        prompts,
      },
    });
  } catch (error) {
    console.error('ContextDock: Failed to handle keyboard shortcut.', error);
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

