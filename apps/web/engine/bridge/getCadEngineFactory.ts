import { EXPECTED_ABI_HASH } from '@/engine/core/protocol';

export type CadEngineFactory<TModule> = (opts?: unknown) => Promise<TModule>;

type HeapViews = {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
};

const WASM_VERSION_TAG = EXPECTED_ABI_HASH.toString(16).padStart(8, '0');

const ensureCadEngineFactoryPromise = (): Promise<unknown> => {
  if (typeof window === 'undefined') {
    throw new Error('WASM engine loader cannot run outside the browser.');
  }

  if (window.__cadEngineFactoryPromise) return window.__cadEngineFactoryPromise;

  const baseWasmUrl = getBaseWasmUrl();
  const engineUrl = buildWasmAssetUrl('engine.js', baseWasmUrl).toString();

  window.__cadEngineFactoryPromise = import(/* @vite-ignore */ engineUrl).then((m) => {
    const maybeDefault = (m as { default?: unknown }).default;
    return maybeDefault ?? m;
  });

  return window.__cadEngineFactoryPromise;
};

const findWasmMemory = (exports: WebAssembly.Exports): WebAssembly.Memory => {
  for (const value of Object.values(exports)) {
    if (value instanceof WebAssembly.Memory) return value;
  }
  throw new Error('WASM memory export not found.');
};

const ensureHeapViews = (target: Partial<HeapViews>, memory: WebAssembly.Memory): HeapViews => {
  if (target.HEAPU8?.buffer !== memory.buffer) {
    target.HEAPU8 = new Uint8Array(memory.buffer);
  }
  if (target.HEAPF32?.buffer !== memory.buffer) {
    target.HEAPF32 = new Float32Array(memory.buffer);
  }
  return target as HeapViews;
};

const getBaseWasmUrl = (): string => {
  // Vite's base URL (supports hosting under subpaths).
  const base = import.meta.env.BASE_URL ?? '/';
  return new URL(base, window.location.href).toString();
};

const buildWasmAssetUrl = (filename: 'engine.js' | 'engine.wasm', baseUrl: string): URL => {
  const url = new URL(`wasm/${filename}`, baseUrl);
  url.searchParams.set('v', WASM_VERSION_TAG);
  return url;
};

export const getCadEngineFactory = async <TModule>(): Promise<CadEngineFactory<TModule>> => {
  const promise = ensureCadEngineFactoryPromise();

  const factory = await promise;
  if (typeof factory !== 'function') {
    throw new Error('WASM engine loader is invalid: expected a factory function.');
  }

  return factory as CadEngineFactory<TModule>;
};

export const initCadEngineModule = async <TModule extends object>(): Promise<
  TModule & HeapViews
> => {
  const factory = await getCadEngineFactory<TModule>();

  const moduleArg: Record<string, unknown> &
    Partial<HeapViews> & { __wasmMemory?: WebAssembly.Memory } = {};
  moduleArg.instantiateWasm = async (
    imports: WebAssembly.Imports,
    successCallback: (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void,
  ) => {
    const baseWasmUrl = getBaseWasmUrl();
    const wasmUrl = buildWasmAssetUrl('engine.wasm', baseWasmUrl).toString();
    const res = await fetch(wasmUrl, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Failed to fetch WASM binary: ${res.status} ${res.statusText}`);

    const bytes = await res.arrayBuffer();
    const instantiated = await WebAssembly.instantiate(bytes, imports);
    const instance =
      instantiated instanceof WebAssembly.Instance ? instantiated : instantiated.instance;
    const mod = instantiated instanceof WebAssembly.Instance ? undefined : instantiated.module;

    moduleArg.__wasmMemory = findWasmMemory(instance.exports);
    successCallback(instance, mod);
  };

  const module = await factory(moduleArg);

  const memory = moduleArg.__wasmMemory;
  if (!memory) {
    throw new Error('WASM instantiated without captured memory; cannot create HEAP views.');
  }

  const heaps = ensureHeapViews(moduleArg, memory);
  return Object.assign(module, heaps);
};
