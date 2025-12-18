export type EngineBackend = 'legacy' | 'next';

const QUERY_KEY = 'engine';
const STORAGE_KEY = 'engineBackend';

const readQueryParam = (): EngineBackend | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const v = params.get(QUERY_KEY);
  if (v === 'legacy' || v === 'next') return v;
  return null;
};

const readStorage = (): EngineBackend | null => {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'legacy' || v === 'next') return v;
  return null;
};

export const getInitialEngineBackend = (): EngineBackend => {
  return readQueryParam() ?? readStorage() ?? 'legacy';
};

export const persistEngineBackend = (backend: EngineBackend) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, backend);
  const params = new URLSearchParams(window.location.search);
  params.set(QUERY_KEY, backend);
  const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  window.history.replaceState({}, '', newUrl);
};
