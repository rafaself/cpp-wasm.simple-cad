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

Todas as entradas numéricas (coordenadas, tolerâncias, contagens) devem passar por `isValidNumber()` ou `isPositiveNumber()` antes do uso em cálculos críticos ou chamadas do engine.

**Exemplo:**

```typescript
import { isValidNumber } from "@/utils/typeGuards";

if (!isValidNumber(x) || !isValidNumber(y)) {
  console.warn("Invalid coordinates blocked");
  return;
}
```

### 2. String Inputs (Export/Display)

Strings destinadas a exportação (JSON) ou exibição na UI de monitoramento devem ser sanitizadas para limitar comprimento e remover caracteres perigosos.

**Uso:**

```typescript
import { sanitizeString } from "@/utils/typeGuards";
const safeLabel = sanitizeString(userInput, 50);
```

### 3. Object Injection

Ao hidratar caches ou configurações de armazenamento externo (Local Storage, URL), use Type Guards (`isPickResult`) para garantir a integridade da estrutura.

---

## 🛡️ Best Practices for Performance Tools

1.  **Production Disable**: O `PerformanceMonitor` e a API global `window.__perf` devem ser **removidos** ou desabilitados (stubbed) em builds de produção para evitar vazamento de informações internas.
2.  **Memory Management**: O `PickResultCache` implementa limpeza de intervalos (`destroy()`). Certifique-se de chamar `destroy()` ao desmontar componentes para prevenir DoS por exaustão de memória.
3.  **Benchmark Limits**: Os benchmarks limitam o número de iterações e entidades para prevenir congelamento da UI (DoS acidental).

---
