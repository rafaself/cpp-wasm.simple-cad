import { useSyncExternalStore } from 'react';

type DocumentSignal = 'document' | 'layers' | 'selection' | 'order';

type SignalMap = Record<DocumentSignal, number>;

type Listener = () => void;

const generations: SignalMap = {
  document: 0,
  layers: 0,
  selection: 0,
  order: 0,
};

const listeners = new Set<Listener>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

export const bumpDocumentSignal = (signal: DocumentSignal): void => {
  generations[signal] = (generations[signal] + 1) >>> 0;
  if (signal !== 'document') {
    generations.document = (generations.document + 1) >>> 0;
  }
  notify();
};

export const getDocumentSignal = (signal: DocumentSignal): number => generations[signal];

export const subscribeDocumentSignals = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useDocumentSignal = (signal: DocumentSignal): number =>
  useSyncExternalStore(
    subscribeDocumentSignals,
    () => generations[signal],
    () => generations[signal],
  );
