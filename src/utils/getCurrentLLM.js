const SITE_MAP = new Map(
  Object.entries({
    'chat.openai.com': {
      name: 'ChatGPT',
      inputSelector: 'textarea',
      outputContainerSelector: '[data-testid="conversation-turns"]',
    },
    'claude.ai': {
      name: 'Claude',
      inputSelector: 'textarea',
      outputContainerSelector: '[aria-live="polite"]',
    },
    'www.perplexity.ai': {
      name: 'Perplexity',
      inputSelector: 'textarea',
      outputContainerSelector: '[data-testid="conversation"]',
    },
    'perplexity.ai': {
      name: 'Perplexity',
      inputSelector: 'textarea',
      outputContainerSelector: '[data-testid="conversation"]',
    },
    'gemini.google.com': {
      name: 'Gemini',
      inputSelector: 'textarea',
      outputContainerSelector: 'main',
    },
  })
);

function resolveConfigForHost(hostname) {
  if (!hostname) {
    return null;
  }

  if (SITE_MAP.has(hostname)) {
    return SITE_MAP.get(hostname);
  }

  for (const [domain, config] of SITE_MAP.entries()) {
    if (hostname.endsWith(`.${domain}`)) {
      return config;
    }
  }

  return null;
}

export function getLLMSiteContext(win = window) {
  const hostname = win?.location?.hostname ?? '';
  const config = resolveConfigForHost(hostname);

  if (!config) {
    return {
      name: 'Unknown',
      inputSelector: '',
      outputContainerSelector: '',
      isSupported: false,
    };
  }

  return {
    name: config.name,
    inputSelector: config.inputSelector,
    outputContainerSelector: config.outputContainerSelector ?? '',
    isSupported: true,
  };
}

export function registerLLMSite(domain, config) {
  if (!domain || typeof domain !== 'string') {
    throw new TypeError('domain must be a non-empty string.');
  }

  if (!config || typeof config !== 'object') {
    throw new TypeError('config must be an object.');
  }

  const entry = {
    name: typeof config.name === 'string' ? config.name : '',
    inputSelector: typeof config.inputSelector === 'string' ? config.inputSelector : '',
    outputContainerSelector:
      typeof config.outputContainerSelector === 'string' ? config.outputContainerSelector : '',
  };

  SITE_MAP.set(domain, entry);
}

export const __testing = {
  SITE_MAP,
  resolveConfigForHost,
};


