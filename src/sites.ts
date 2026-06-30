// Per-site hints for locating the prompt input and send button, plus a broad
// host list so coverage is comprehensive. Any host not explicitly listed but
// matched by the manifest still works via the generic textarea/contenteditable
// fallback in GENERIC_INPUT_SELECTORS.

export interface SiteConfig {
  id: string;
  name: string;
  hostIncludes: string[];
  inputSelectors: string[];
  submitSelectors: string[];
}

// Tried on every site in addition to any site-specific selectors.
export const GENERIC_INPUT_SELECTORS = [
  "textarea",
  "div[contenteditable='true']",
  "[role='textbox']",
  "input[type='text']",
];
export const GENERIC_SUBMIT_SELECTORS = [
  "button[type='submit']",
  "button[data-testid*='send']",
  "button[aria-label*='Send']",
  "button[aria-label*='send']",
  "button[aria-label*='Submit']",
];

const generic = (id: string, name: string, hosts: string[]): SiteConfig => ({
  id,
  name,
  hostIncludes: hosts,
  inputSelectors: GENERIC_INPUT_SELECTORS,
  submitSelectors: GENERIC_SUBMIT_SELECTORS,
});

export const SITES: SiteConfig[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hostIncludes: ["chat.openai.com", "chatgpt.com"],
    inputSelectors: ["#prompt-textarea", ...GENERIC_INPUT_SELECTORS],
    submitSelectors: ["button[data-testid='send-button']", ...GENERIC_SUBMIT_SELECTORS],
  },
  {
    id: "grok",
    name: "Grok",
    // standalone app + Grok inside X/Twitter
    hostIncludes: ["grok.com", "grok.x.ai", "x.ai", "x.com/i/grok", "twitter.com/i/grok"],
    inputSelectors: ["textarea", "div[contenteditable='true']", ...GENERIC_INPUT_SELECTORS],
    submitSelectors: ["button[aria-label*='Grok']", "button[type='submit']", ...GENERIC_SUBMIT_SELECTORS],
  },
  {
    id: "gemini",
    name: "Gemini",
    hostIncludes: ["gemini.google.com", "aistudio.google.com"],
    inputSelectors: ["div.ql-editor[contenteditable='true']", ...GENERIC_INPUT_SELECTORS],
    submitSelectors: ["button.send-button", ...GENERIC_SUBMIT_SELECTORS],
  },
  {
    id: "claude",
    name: "Claude",
    hostIncludes: ["claude.ai"],
    inputSelectors: ["div[contenteditable='true']", ...GENERIC_INPUT_SELECTORS],
    submitSelectors: GENERIC_SUBMIT_SELECTORS,
  },
  generic("copilot", "Microsoft Copilot", ["copilot.microsoft.com", "m365.cloud.microsoft"]),
  generic("perplexity", "Perplexity", ["perplexity.ai"]),
  generic("deepseek", "DeepSeek", ["chat.deepseek.com"]),
  generic("mistral", "Mistral Le Chat", ["chat.mistral.ai"]),
  generic("metaai", "Meta AI", ["meta.ai"]),
  generic("qwen", "Qwen", ["chat.qwen.ai", "tongyi.aliyun.com"]),
  generic("kimi", "Kimi", ["kimi.moonshot.cn", "kimi.com"]),
  generic("huggingchat", "HuggingChat", ["huggingface.co/chat"]),
  generic("poe", "Poe", ["poe.com"]),
  generic("pi", "Pi", ["pi.ai"]),
  generic("character", "Character.AI", ["character.ai"]),
  generic("you", "You.com", ["you.com"]),
  generic("phind", "Phind", ["phind.com"]),
  generic("genspark", "Genspark", ["genspark.ai"]),
];

export function matchSite(host: string, path = ""): SiteConfig | undefined {
  const full = host + path;
  return SITES.find((s) => s.hostIncludes.some((h) => full.includes(h) || host.includes(h)));
}
