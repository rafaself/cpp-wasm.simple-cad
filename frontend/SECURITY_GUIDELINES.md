# 🔒 Security Guidelines & Hardening

## 🛡️ Content Security Policy (CSP)

Para garantir a segurança máxima das ferramentas de performance e do editor, a aplicação deve aderir às seguintes diretrizes de CSP em produção.

### Recommended Production Policy

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval'; # 'wasm-unsafe-eval' required for C++ engine WASM
  style-src 'self' 'unsafe-inline';     # 'unsafe-inline' for dynamic React styles (consider reducing)
  img-src 'self' data: blob:;           # Allow blob: for exported images/benchmarks
  connect-src 'self';
  font-src 'self';
  object-src 'none';                    # Block <object>, <embed>, <applet>
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';               # Prevent clickjacking
  block-all-mixed-content;
  upgrade-insecure-requests;
```

### Dev Mode Adjustments

Em desenvolvimento (`NODE_ENV=development`), as ferramentas de performance (`window.__perf`) podem exigir relaxamentos temporários:

- `unsafe-eval`: Pode ser necessário para alguns devtools.

---

## 🛡️ Input Validation Standards

### 1. Numeric Inputs

Valide números com `typeof value === "number" && Number.isFinite(value)` antes de usá-los em cálculos críticos ou chamadas do engine (coordenadas, tolerâncias, contagens). Bloqueie valores fora de intervalo logo na entrada.

### 2. String Inputs (Export/Display)

Strings destinadas a exportação (JSON) ou exibição na UI de monitoramento devem ser sanitizadas localmente (limitar comprimento, remover `<`/`>` e espaços extras) antes do uso.

### 3. Object Injection

Ao hidratar caches ou configurações de armazenamento externo (Local Storage, URL), implemente type guards locais e verifique campos essenciais (ids numéricos, enums, tamanhos de arrays) antes de aceitar os dados.

---

## 🛡️ Best Practices for Performance Tools

1.  **Production Disable**: O `PerformanceMonitor` e a API global `window.__perf` devem ser **removidos** ou desabilitados (stubbed) em builds de produção para evitar vazamento de informações internas.
2.  **Memory Management**: O `PickResultCache` implementa limpeza de intervalos (`destroy()`). Certifique-se de chamar `destroy()` ao desmontar componentes para prevenir DoS por exaustão de memória.
3.  **Benchmark Limits**: Os benchmarks limitam o número de iterações e entidades para prevenir congelamento da UI (DoS acidental).

---
