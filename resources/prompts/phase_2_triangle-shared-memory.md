# Prompt — Fase 2: “The Triangle” (WASM buffers → JS views → R3F render) com segurança de rebind

**Role:** Atue como **Engenheiro de Computação Gráfica** e **Especialista em WebAssembly**.

**Contexto:**

- Fase 1 já expõe um viewer Next isolado por feature flag.
- Nesta fase queremos provar o pipeline de render com memória compartilhada (zero-copy no JS).

**Referências (source of truth):**

- `AGENTS.md`
- `resources/reports/report_5_cad-wasm-tech-spec.md`
- `resources/reports/report_7_wasm-migration-backlog.md`

## Objetivo

Ter um viewer Next renderizando geometria vinda do WASM, com:

- TypedArray view direto do HEAP (sem cópia JS),
- estratégia clara de **rebind** quando a memória crescer,
- sem crashes (“Offset out of bounds” / “Detached ArrayBuffer”).

## Tarefas

1. **Contrato de buffers no WASM**

- Expor metadados mínimos:
  - `ptr` (bytes)
  - `vertexCount`
  - `generation` (incrementa quando dados mudarem)
  - (opcional) `capacity` / `floatCount`

2. **Rebind safety no JS**

- Guardar `lastBuffer = wasmModule.HEAPF32.buffer`.
- Se `wasmModule.HEAPF32.buffer !== lastBuffer`, recriar views e BufferAttributes.
- Se `generation` mudou, atualizar geometry/attributes (ou `needsUpdate`).

3. **Render mínimo R3F**

- Material simples (`wireframe`) e câmera estável.
- Exibir stats dev-only (vertex count, generation, ptr).

4. **Sem alocação por frame (princípio)**

- Não recriar `BufferGeometry` em loop; só quando `generation/buffer` mudarem.

## Critérios de sucesso (Gates)

- Viewer Next renderiza e continua estável após refresh/hot reload.
- Nenhum erro de bounds/detached em casos comuns.
- A atualização de buffers é incremental (pelo menos controlada por `generation`).

## Output esperado

- Lista de funções públicas do WASM expostas para o viewer.
- Explicação curta: por que `ptr/4` é necessário (bytes → float32 index).
