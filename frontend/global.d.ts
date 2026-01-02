export {};

declare global {
  interface CadDebugConfig {
    enabled?: boolean;
    all?: boolean;
    pointer?: boolean;
    tool?: boolean;
    commands?: boolean;
    events?: boolean;
    selection?: boolean;
    overlay?: boolean;
    render?: boolean;
    transform?: boolean;
    draft?: boolean;
  }

  interface Window {
    __cadEngineFactoryPromise?: Promise<unknown>;
    __cadDebug?: CadDebugConfig;
  }
}
