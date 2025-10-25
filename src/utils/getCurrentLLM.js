const HOST_MAP = {
  'chat.openai.com': {
    name: 'ChatGPT',
    inputSelector: 'textarea',
  },
  'claude.ai': {
    name: 'Claude',
    inputSelector: 'textarea',
  },
  'perplexity.ai': {
    name: 'Perplexity',
    inputSelector: '',
  },
  'gemini.google.com': {
    name: 'Gemini',
    inputSelector: '',
  },
};

export function getCurrentLLM(win = window) {
  const hostname = win?.location?.hostname;

  if (!hostname) {
    return null;
  }

  for (const [domain, llm] of Object.entries(HOST_MAP)) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return {
        name: llm.name,
        inputSelector: llm.inputSelector,
      };
    }
  }

  return null;
}

export function registerLLMConfig(domain, config) {
  if (!domain || typeof domain !== 'string') {
    throw new TypeError('domain must be a non-empty string.');
  }

  if (!config || typeof config !== 'object') {
    throw new TypeError('config must be an object.');
  }

  HOST_MAP[domain] = {
    name: typeof config.name === 'string' ? config.name : '',
    inputSelector: typeof config.inputSelector === 'string' ? config.inputSelector : '',
  };
}

export const __testing = {
  HOST_MAP,
};


