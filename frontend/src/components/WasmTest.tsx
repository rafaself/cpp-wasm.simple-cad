import React, { useEffect, useState } from 'react';
import engineUrl from '/wasm/engine.js?url';

type CadEngineInstance = { add: (a: number, b: number) => number };
type CadEngineModule = { CadEngine: new () => CadEngineInstance };
type EngineFactory = (opts?: unknown) => Promise<CadEngineModule>;

const WasmTest: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // engine.js está em /public/wasm após build
        const mod = await import(/* @vite-ignore */ engineUrl);
        const factory = mod.default as EngineFactory;
        const module = await factory();
        if (cancelled) return;
        const engine = new module.CadEngine();
        const value = engine.add(10, 20);
        setResult(value);
        setStatus('ready');
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError((err as Error)?.message ?? 'Falha ao carregar WASM');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <div>Carregando WASM...</div>;
  if (status === 'error') return <div>Erro: {error}</div>;

  return <div>Resultado WASM: {result}</div>;
};

export default WasmTest;
