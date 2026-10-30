export type ToolType =
  | 'base64'
  | 'json-formatter'
  | 'json-schema-validator'
  | 'html-previewer'
  | 'markdown-previewer'
  | 'qrious'
  | 'jwt-decoder'
  | 'xslt-diff'
  | 'sql-compare'
  | 'sql-practice'
  | 'hash-generator'
  | 'text-diff'
  | 'timestamp-converter'
  | 'uuid-ulid-generator'
  | 'url-toolkit'
  | 'regex-tester';

export interface ConversionHistoryItem {
  id: string;
  tool: ToolType;
  action: string;
  input: string;
  output: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export type ConversionHistoryDraft = Omit<ConversionHistoryItem, 'id' | 'createdAt'>;

export interface WebsiteVisitHistoryItem {
  id: string;
  createdAt: string;
  url: string;
  title: string;
  referrer: string;
  userAgent: string;
  language: string;
  languages: string[];
  platform: string;
  vendor: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  timezone: string;
  timezoneOffset: number;
  cookieEnabled: boolean;
  online: boolean;
  hardwareConcurrency: number;
  deviceMemory?: number;
  maxTouchPoints: number;
}

const STORAGE_KEY = 'mytools:conversion-history';
const WEBSITE_HISTORY_STORAGE_KEY = 'mytools:website-history';
const HISTORY_UPDATED_EVENT = 'mytools:history-updated';
const MAX_HISTORY_ITEMS = 100;

const isBrowser = typeof window !== 'undefined';

const createId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const notifyHistoryUpdated = (): void => {
  if (!isBrowser) {
    return;
  }

  window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
};

const writeHistoryItems = (items: ConversionHistoryItem[]): void => {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notifyHistoryUpdated();
};

export const getHistoryItems = (): ConversionHistoryItem[] => {
  if (!isBrowser) {
    return [];
  }

  const rawItems = window.localStorage.getItem(STORAGE_KEY);
  if (!rawItems) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawItems);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as ConversionHistoryItem[];
  } catch {
    return [];
  }
};

export const saveHistoryItem = (draft: ConversionHistoryDraft): ConversionHistoryItem => {
  const newItem: ConversionHistoryItem = {
    ...draft,
    id: createId(),
    createdAt: new Date().toISOString(),
  };

  const currentItems = getHistoryItems();
  const nextItems = [newItem, ...currentItems].slice(0, MAX_HISTORY_ITEMS);

  writeHistoryItems(nextItems);
  return newItem;
};

export const deleteHistoryItem = (id: string): void => {
  const currentItems = getHistoryItems();
  const nextItems = currentItems.filter((item) => item.id !== id);
  writeHistoryItems(nextItems);
};

export const clearHistoryItems = (): void => {
  writeHistoryItems([]);
};

const getWebsiteVisitItems = (): WebsiteVisitHistoryItem[] => {
  if (!isBrowser) {
    return [];
  }

  const rawItems = window.localStorage.getItem(WEBSITE_HISTORY_STORAGE_KEY);
  if (!rawItems) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawItems);
    return Array.isArray(parsed) ? parsed as WebsiteVisitHistoryItem[] : [];
  } catch {
    return [];
  }
};

const writeWebsiteVisitItems = (items: WebsiteVisitHistoryItem[]): void => {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(WEBSITE_HISTORY_STORAGE_KEY, JSON.stringify(items));
  notifyHistoryUpdated();
};

export const getWebsiteVisitHistoryItems = (): WebsiteVisitHistoryItem[] => {
  return getWebsiteVisitItems();
};

export const recordWebsiteVisit = (): WebsiteVisitHistoryItem | undefined => {
  if (!isBrowser) {
    return undefined;
  }

  const navigation = window.navigator;
  const newItem: WebsiteVisitHistoryItem = {
    id: createId(),
    createdAt: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
    userAgent: navigation.userAgent,
    language: navigation.language,
    languages: [...navigation.languages],
    platform: navigation.platform,
    vendor: navigation.vendor,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    colorDepth: window.screen.colorDepth,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    cookieEnabled: navigation.cookieEnabled,
    online: navigation.onLine,
    hardwareConcurrency: navigation.hardwareConcurrency,
    deviceMemory: 'deviceMemory' in navigation
      ? (navigation as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined,
    maxTouchPoints: navigation.maxTouchPoints,
  };

  const nextItems = [newItem, ...getWebsiteVisitItems()].slice(0, MAX_HISTORY_ITEMS);
  writeWebsiteVisitItems(nextItems);
  return newItem;
};

export const deleteWebsiteVisitHistoryItem = (id: string): void => {
  writeWebsiteVisitItems(getWebsiteVisitItems().filter((item) => item.id !== id));
};

export const clearWebsiteVisitHistoryItems = (): void => {
  writeWebsiteVisitItems([]);
};

export const subscribeHistoryUpdated = (listener: () => void): (() => void) => {
  if (!isBrowser) {
    return () => undefined;
  }

  window.addEventListener(HISTORY_UPDATED_EVENT, listener);
  return () => {
    window.removeEventListener(HISTORY_UPDATED_EVENT, listener);
  };
};
