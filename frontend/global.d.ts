export {};

declare global {
  interface Window {
    __cadEngineFactoryPromise?: Promise<unknown>;
  }
}
