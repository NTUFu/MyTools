export type ToolType =
  | 'base64'
  | 'json-formatter'
  | 'html-previewer'
  | 'markdown-previewer'
  | 'qrious'
  | 'jwt-decoder'
  | 'xslt-diff'
  | 'sql-compare'
  | 'sql-practice'
  | 'hash-generator'
  | 'text-diff'
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

const STORAGE_KEY = 'mytools:conversion-history';
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

export const subscribeHistoryUpdated = (listener: () => void): (() => void) => {
  if (!isBrowser) {
    return () => undefined;
  }

  window.addEventListener(HISTORY_UPDATED_EVENT, listener);
  return () => {
    window.removeEventListener(HISTORY_UPDATED_EVENT, listener);
  };
};
