# Executive Summary

**Notas gerais (0-10)**

| Area | Nota | Observacoes-chave |
| --- | --- | --- |
| Arquitetura | 6 | Boa separacao de modulos internos, mas ha camadas de compatibilidade e alto acoplamento entre core/protocolo. |
| Qualidade C++ | 6 | RAII e ausencia de new/delete, mas ha UB potencial em parsing e macros de alias. |
| Performance | 6 | Spatial hash e reservas ajudam, porem existem alocacoes em hot paths e logging em runtime. |
| Seguranca | 5 | Validacoes existem, mas checagens de overflow sao frágeis e nao ha fuzz/sanitizers. |
| Testes | 6 | Suite ampla, mas arquivos monoliticos e ausencia de fuzz/prop tests. |
| Build/Tooling | 4 | Sem warning levels/sanitizers/CI/clang-tidy/clang-format. |
| Prontidao p/ acoplar dominio | 4 | Enum fechado de entidades e switches espalhados dificultam extensao. |

**Top 10 problemas (com impacto)**

1) ARCH-001: camadas de compatibilidade proibidas pelo AGENTS, aumentando complexidade e divergencia de API.
2) DOM-001: extensao de entidades exige mudancas transversais (render/pick/snapshot/comandos), bloqueando plugabilidade.
3) QUAL-001: reinterpret_cast em buffer binario pode causar UB em plataformas com alinhamento estrito.
4) SEC-001: checagens de limites suscetiveis a overflow em parse de comandos/snapshots.
5) BUILD-001: ausencia de flags de warnings/sanitizers/linters reduz deteccao precoce de defeitos.
6) PERF-001: alocacoes em hot paths (render/draft) violam regra de zero-allocacao.
7) ARCH-003: arquivos C++ muito acima dos limites de tamanho definidos (dificulta manutencao).
8) OBS-001: logging direto via printf em runtime, sem niveis ou gating, afeta performance e diagnostico.
9) DEP-001: sem inventario/licencas de dependencias no repo.
10) TEST-002: sem fuzz/prop tests para parsers binarios (comandos/snapshots).

**Top 10 pontos fortes**

1) Engine-first clara: CadEngine centraliza estado e comandos (cpp/engine/engine.h).
2) Protocol/ABI versioning com hash para sincronismo JS/WASM (cpp/engine/engine_protocol_types.h).
3) Spatial hash para picking (cpp/engine/interaction/pick_system.cpp).
4) Snapshot com CRC por secao e formato estruturado (cpp/engine/persistence/snapshot.cpp).
5) Uso consistente de RAII e unique_ptr (cpp/engine/engine.h).
6) Ausencia de new/delete na base (rg em cpp/engine retornou apenas comentarios).
7) Reservas de capacidade em pontos criticos (EngineState ctor, EntityManager::reserve).
8) Suite de testes extensa cobrindo render, snapshot, comandos e texto (cpp/tests/*.cpp).
9) Separacao explicita de modulos: command/entity/history/interaction/render/text/persistence.
10) Build CMake com opcao para desligar sistema de texto (ENGINE_ENABLE_TEXT).

# Project Overview

**Como buildar e rodar (C++ engine)**

- Build/teste nativo (README.md):
  - `mkdir -p cpp/build_native && cd cpp/build_native`
  - `cmake ..`
  - `make`
  - `ctest --output-on-failure`
- Alternativa via Makefile (alvo ctest): `make ctest`
- WASM: via `pnpm build:wasm` (usa Docker + Emscripten)

**Status de execucao**

- Builds/testes/analises estaticas **nao foram executados** nesta auditoria.
- Motivo: dependencias sao baixadas via `FetchContent` (rede restrita no ambiente atual).
- Como confirmar: rodar os comandos acima em ambiente com acesso a rede.

**Estrutura de targets e dependencias**

- Toolchain: CMake (>=3.20), C++20, Emscripten para WASM.
- Targets principais (cpp/CMakeLists.txt):
  - `engine` (WASM, quando EMSCRIPTEN=ON) -> `frontend/public/wasm/engine.{js,wasm}`
  - `engine_tests` (native, gtest)
- Dependencias externas (FetchContent): FreeType, HarfBuzz, msdfgen, GoogleTest.

**Estrutura de diretorios (C++)**

- `cpp/engine/`: core do engine (entidades, render, texto, interacao, snapshots).
- `cpp/tests/`: testes unitarios/integracao (gtest).
- `cpp/CMakeLists.txt`: build system C++.
- `cpp/engine.cpp`: implementacoes principais do CadEngine.

**Diagrama textual (ASCII)**

```
[JS/TS] -> [WASM bindings: cpp/engine/bindings.cpp]
              |
              v
          [CadEngine]
              |
   +----------+-----------+-----------+-----------+-----------+
   |          |           |           |           |           |
[Command] [Entity]    [History]   [Interaction] [Render]  [Snapshot]
(commands) (storage)  (undo/redo) (pick/transform) (buffers) (save/load)
   |                      |            |             |
   +----------------------+------------+-------------+
                          |
                      [TextSystem]
                   (layout/shaping/atlas)
```

**Principais componentes e responsabilidades**

- `CadEngine` (`cpp/engine/engine.h`/`cpp/engine.cpp`): facade principal, API para JS, coordena estado.
- `EntityManager` (`cpp/engine/entity/*`): storage e metadata de entidades/layers.
- `HistoryManager` (`cpp/engine/history/*`): undo/redo transacional.
- `PickSystem` (`cpp/engine/interaction/pick_system.cpp`): picking com spatial hash.
- `InteractionSession` (`cpp/engine/interaction/interaction_session.cpp`): transformacao interativa.
- `Render` (`cpp/engine/render/*`): geracao de buffers para WebGL.
- `Snapshot` (`cpp/engine/persistence/snapshot.cpp` + `engine_snapshot.cpp`): serializacao binaria.
- `TextSystem` (`cpp/engine/text_system.cpp` + `cpp/engine/text/*`): layout e atlas de texto.

# Findings (Deep Dive)

## A) Arquitetura & Design

- **ID:** ARCH-001
- **Severidade:** High
- **Categoria:** Arquitetura
- **Descricao:** Camadas de compatibilidade e alias legado contradizem a regra global de “sem backward compatibility”.
- **Evidencia:**
  - `cpp/engine/engine_protocol_types.h:20-26` (comentario: “backwards compatibility”).
  - `cpp/engine/internal/engine_state_aliases.h:5-8` (aliases para “legacy member names”).
  - `cpp/engine.cpp:320-321` (compatibilidade de LayerPropMask).
- **Impacto:** Complexidade adicional, API ambigua e risco de “duas verdades”; dificulta refatoracoes e migração limpa.
- **Causa raiz provável:** Transicao incremental sem remover adaptadores/aliases.
- **Recomendacao:** Remover compatibilidade e corrigir call sites imediatamente; alinhar AGENTS.md com a pratica desejada.
- **Esforco estimado:** M
- **Risco de mudanca:** Medio

- **ID:** ARCH-002
- **Severidade:** Medium
- **Categoria:** Arquitetura
- **Descricao:** Acoplamento entre core, protocolo e persistencia via heranca direta de `EngineProtocolTypes`.
- **Evidencia:** `cpp/engine/engine_protocol_types.h:3-8` inclui `snapshot.h`, `commands.h` e `pick_system.h`; `CadEngine` herda de `EngineProtocolTypes` (`cpp/engine/engine.h:44`).
- **Impacto:** Aumenta custo de compilacao e dificulta separar camada de protocolo/ABI do core.
- **Causa raiz provável:** Conveniencia de expor tipos no binding WASM.
- **Recomendacao:** Isolar tipos de protocolo em um modulo/namespace separado; expor via facade ou wrappers, nao via heranca.
- **Esforco estimado:** M
- **Risco de mudanca:** Medio

- **ID:** ARCH-003
- **Severidade:** Medium
- **Categoria:** Arquitetura
- **Descricao:** Arquivos acima dos limites de tamanho definidos pela governanca do projeto.
- **Evidencia:** `wc -l` mostra, por exemplo: `cpp/engine/interaction/interaction_session.cpp` (1437 LOC), `cpp/engine/interaction/pick_system.cpp` (957 LOC), `cpp/engine/history/history_manager.cpp` (954 LOC), `cpp/engine/impl/engine_snapshot.cpp` (902 LOC), `cpp/engine/render/render.cpp` (848 LOC).
- **Impacto:** Menor coesao, mais risco de regressao e dificuldade de manutencao.
- **Causa raiz provável:** Crescimento organico sem fracionamento por responsabilidades.
- **Recomendacao:** Refatorar em submodulos menores (ex.: pick: spatial index vs hit-test; interaction: session vs snap; snapshot: parse vs apply).
- **Esforco estimado:** L
- **Risco de mudanca:** Medio

## B) Qualidade do Codigo C++

- **ID:** QUAL-001
- **Severidade:** High
- **Categoria:** Qualidade C++
- **Descricao:** Possivel UB por acesso desalinhado ao reinterpretar payload binario como `std::uint32_t*`.
- **Evidencia:** `cpp/engine/command/command_dispatch.cpp:141-171` usa `reinterpret_cast<const std::uint32_t*>` para `ids`; uso subsequente em `cpp/engine/impl/engine_style.cpp:90-140` indexa `ids[i]`.
- **Impacto:** Crash em arquiteturas com alinhamento estrito (ARM), comportamento indefinido e bugs intermitentes.
- **Causa raiz provável:** Otimizacao de parse sem garantir alinhamento.
- **Recomendacao:** Ler IDs via `std::memcpy` para buffer alinhado ou usar `std::uint32_t` em loop com `readU32`.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

- **ID:** QUAL-002
- **Severidade:** Medium
- **Categoria:** Qualidade C++
- **Descricao:** Uso extensivo de macros para alias de estado interno (pImpl) reduz type safety e dificulta tooling.
- **Evidencia:** `cpp/engine/internal/engine_state_aliases.h:5-56` define dezenas de macros com nomes de membros.
- **Impacto:** Debugging mais dificil, risco de colisao de nomes e leitura ambigua do codigo.
- **Causa raiz provável:** Tentativa de compatibilizar pImpl sem refatorar call sites.
- **Recomendacao:** Substituir macros por acessos explicitos (`state().field`) ou wrappers inline.
- **Esforco estimado:** M
- **Risco de mudanca:** Medio

- **ID:** QUAL-003
- **Severidade:** Low
- **Categoria:** Qualidade C++
- **Descricao:** Comentarios incoerentes/enganosos no pick system (parecem rascunho e nao refletem o codigo).
- **Evidencia:** `cpp/engine/interaction/pick_system.cpp:430-431` (“I will implement a brute-force search...”)
- **Impacto:** Reduz clareza e confianca na logica; dificulta manutencao.
- **Causa raiz provável:** Comentario legado de rascunho/geracao automatica.
- **Recomendacao:** Remover ou atualizar comentarios para refletir o comportamento real.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

## C) Seguranca & Robustez

- **ID:** SEC-001
- **Severidade:** Medium
- **Categoria:** Seguranca
- **Descricao:** Checagens de bounds usam soma direta e podem sofrer overflow em ambientes 32-bit.
- **Evidencia:** `cpp/engine/persistence/snapshot.cpp:62-100` (`offset + size <= total`); `cpp/engine/command/commands.cpp:24-35` (`o + payloadByteCount > byteCount`).
- **Impacto:** Possivel bypass de validacao e leitura fora de buffer com inputs maliciosos.
- **Causa raiz provável:** Falta de pattern seguro (e.g., `size > total - offset`).
- **Recomendacao:** Trocar por checagens de subtracao segura e validar overflow antes de somar.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

- **ID:** SEC-002
- **Severidade:** Low
- **Categoria:** Robustez
- **Descricao:** `allocBytes` nao verifica falha de alocacao.
- **Evidencia:** `cpp/engine.cpp:154-156` retorna ponteiro de `std::malloc` sem validar null.
- **Impacto:** JS pode receber ponteiro 0 e falhar silenciosamente.
- **Causa raiz provável:** Pressuposto de sucesso de alocacao.
- **Recomendacao:** Retornar 0 explicitamente com sinalizacao via `EngineError`/eventos.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

## D) Performance & Escalabilidade

- **ID:** PERF-001
- **Severidade:** Medium
- **Categoria:** Performance
- **Descricao:** Alocacoes em hot paths (render/draft) violam regra de zero-allocacao.
- **Evidencia:**
  - `cpp/engine/render/render.cpp:655` cria `std::vector<Point2> tmpVerts` por entidade.
  - `cpp/engine/interaction/interaction_session.cpp:1322` cria `std::vector<Segment> segments` em cada chamada.
- **Impacto:** Picos de frame time, GC/allocator churn e jitter em interacao.
- **Causa raiz provável:** Uso de containers locais sem reutilizacao de buffers.
- **Recomendacao:** Reutilizar buffers (membros) ou pools; prealocar e limpar em vez de recriar.
- **Esforco estimado:** M
- **Risco de mudanca:** Medio

- **ID:** PERF-002
- **Severidade:** Low
- **Categoria:** Performance
- **Descricao:** Mapas de entidades e flags sao repovoados sem `reserve` ao carregar snapshot.
- **Evidencia:** `cpp/engine/impl/engine_snapshot.cpp:96-140` limpa `entities/entityFlags/entityLayers` e re-insere sem reserva.
- **Impacto:** Rehash e alocacoes desnecessarias ao carregar documentos grandes.
- **Causa raiz provável:** Foco em simplicidade no load.
- **Recomendacao:** `reserve(sd.*.size())` antes dos loops de preenchimento.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

## E) Concorrencia & Thread Safety

- **ID:** CONC-001
- **Severidade:** Low
- **Categoria:** Concorrencia
- **Descricao:** Modelo de threading nao documentado; uso de estado global estatico sem protecao.
- **Evidencia:** `cpp/engine/persistence/snapshot.cpp:24-56` usa tabela CRC32 estatica com init lazy sem sincronizacao.
- **Impacto:** Em futuras evolucoes multithread, ha risco de data races.
- **Causa raiz provável:** Projeto monothread atual sem documentacao formal.
- **Recomendacao:** Documentar modelo de threading e proteger inicializacoes estaticas se threads forem introduzidas.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

## F) Testes & Confiabilidade

- **ID:** TEST-001
- **Severidade:** Medium
- **Categoria:** Testes
- **Descricao:** Arquivos de teste acima dos limites de governanca (monoliticos).
- **Evidencia:** `wc -l` mostra `cpp/tests/engine_test.cpp` (1350 LOC), `cpp/tests/text_commands_test.cpp` (1122 LOC), `cpp/tests/text_layout_test.cpp` (773 LOC).
- **Impacto:** Dificulta manutencao, revisao e isolamento de falhas.
- **Causa raiz provável:** Acumulo incremental de casos sem particionamento.
- **Recomendacao:** Quebrar testes por feature (ex.: commands_text_*), extrair fixtures e helpers.
- **Esforco estimado:** M
- **Risco de mudanca:** Baixo

- **ID:** TEST-002
- **Severidade:** Medium
- **Categoria:** Testes
- **Descricao:** Ausencia de fuzz/prop tests para parsers binarios (comandos/snapshot).
- **Evidencia:** `rg -i "fuzz" cpp` nao encontrou harnesses.
- **Impacto:** Menor cobertura para inputs adversariais e regressao em parsing.
- **Causa raiz provável:** Prioridade em testes deterministas convencionais.
- **Recomendacao:** Adicionar fuzzing para `parseCommandBuffer` e `parseSnapshot`.
- **Esforco estimado:** M
- **Risco de mudanca:** Medio

## G) Build System & Tooling

- **ID:** BUILD-001
- **Severidade:** Medium
- **Categoria:** Build/Tooling
- **Descricao:** CMake nao configura warnings altos, sanitizers ou lints.
- **Evidencia:** `cpp/CMakeLists.txt:1-120` sem `target_compile_options`, `-Wall/-Wextra`, `-Werror`, `-fsanitize`.
- **Impacto:** Defeitos passam despercebidos ate runtime; menor disciplina de qualidade.
- **Causa raiz provável:** Foco inicial em build funcional.
- **Recomendacao:** Adicionar opcoes por target e perfis (Debug/CI) com warnings e sanitizers.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

- **ID:** BUILD-002
- **Severidade:** Low
- **Categoria:** Build/Tooling
- **Descricao:** Dependencias via FetchContent exigem rede por default (ENGINE_ENABLE_TEXT=ON).
- **Evidencia:** `cpp/CMakeLists.txt:18-77` define FetchContent para FreeType/HarfBuzz/msdfgen.
- **Impacto:** Build local falha em ambientes offline; reduz reprodutibilidade.
- **Causa raiz provável:** Setup simplificado para dev.
- **Recomendacao:** Documentar modo offline e/ou adicionar cache/prebuilts.
- **Esforco estimado:** M
- **Risco de mudanca:** Baixo

- **ID:** BUILD-003
- **Severidade:** Medium
- **Categoria:** Build/Tooling
- **Descricao:** Ausencia de pipeline CI/CD visivel para C++ (sem config .github).
- **Evidencia:** `rg --files -g '.github/**'` nao retornou arquivos.
- **Impacto:** Menor garantia de qualidade automatizada por PR.
- **Causa raiz provável:** CI ainda nao configurado para o repositorio.
- **Recomendacao:** Adicionar CI minimo (build + testes + lint) para o target C++.
- **Esforco estimado:** M
- **Risco de mudanca:** Baixo

- **ID:** BUILD-004
- **Severidade:** Low
- **Categoria:** Build/Tooling
- **Descricao:** Referencia a documento ausente em comentario de codigo.
- **Evidencia:** `cpp/engine/protocol/protocol_types.h:12-14` referencia `docs/agents/audit-action-plan.md`, arquivo inexistente em `docs/agents/`.
- **Impacto:** Confusao para novos contribuidores e rastreabilidade de governanca incompleta.
- **Causa raiz provável:** Renomeacao/remoçao de doc sem atualizar referencias.
- **Recomendacao:** Criar o documento ou remover/atualizar a referencia.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

## H) Dependencias & Licencas

- **ID:** DEP-001
- **Severidade:** Medium
- **Categoria:** Dependencias
- **Descricao:** Nao ha inventario/licenca de dependencias no repositorio.
- **Evidencia:** `rg --files -g 'LICENSE*' -g 'COPYING*'` retornou vazio.
- **Impacto:** Risco legal/compliance e desconhecimento de compatibilidades.
- **Causa raiz provável:** Projeto em fase inicial sem curadoria de licencas.
- **Recomendacao:** Adicionar arquivo de licencas e inventario (SPDX ou similar).
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

## I) Observabilidade & Diagnostico

- **ID:** OBS-001
- **Severidade:** Low
- **Categoria:** Observabilidade
- **Descricao:** Logging direto via `printf`/`fprintf` sem niveis, gating ou desativacao em release.
- **Evidencia:**
  - `cpp/engine/command/command_dispatch.cpp:193`
  - `cpp/engine/text_system.cpp:16-25`
  - `cpp/engine/text/font_manager.cpp:203-317`
  - `cpp/engine/interaction/interaction_log.cpp:121`
- **Impacto:** Overhead em runtime, log spam, dificuldade de controle em producao.
- **Causa raiz provável:** Logs de debug adicionados durante desenvolvimento.
- **Recomendacao:** Introduzir logger com niveis/flags de compilacao.
- **Esforco estimado:** S
- **Risco de mudanca:** Baixo

- **ID:** OBS-002
- **Severidade:** Low
- **Categoria:** Observabilidade
- **Descricao:** Metricas internas existem, mas sem padronizacao ou exposicao estruturada.
- **Evidencia:** `cpp/engine.cpp:255-271` monta `EngineStats` com tempos, mas nao ha tracer/metrics.
- **Impacto:** Diagnostico limitado de performance real em campo.
- **Causa raiz provável:** Instrumentacao inicial ad-hoc.
- **Recomendacao:** Padronizar metricas (timers/counters) e exportar via interface unica.
- **Esforco estimado:** M
- **Risco de mudanca:** Baixo

## J) Independencia do Core para acoplar dominio

- **ID:** DOM-001
- **Severidade:** High
- **Categoria:** Arquitetura
- **Descricao:** Modelo de entidades e comandos e fechado; adicionar novos tipos exige alterar switches e estruturas centrais.
- **Evidencia:**
  - `cpp/engine/core/types.h:206` define `EntityKind` fechado.
  - `cpp/engine/render/render.cpp:659-690` switch por tipo.
  - `cpp/engine/interaction/pick_system.cpp:443-559` logica por tipo.
  - `cpp/engine/command/command_dispatch.cpp` switch por `CommandOp`.
- **Impacto:** Alto custo para acoplar dominios (eletrico/hidraulico), risco de regressao e retrabalho.
- **Causa raiz provável:** Arquitetura centrada em enum e switches.
- **Recomendacao:** Introduzir registro de tipos/handlers (interfaces) com tabelas de dispatch, sem switches centrais.
- **Esforco estimado:** L
- **Risco de mudanca:** Alto

- **ID:** DOM-002
- **Severidade:** Medium
- **Categoria:** Arquitetura
- **Descricao:** Protocolo/ABI acoplado ao core via heranca direta, dificultando plugabilidade e versoes paralelas.
- **Evidencia:** `cpp/engine/engine_protocol_types.h:20-56` + `cpp/engine/engine.h:44`.
- **Impacto:** Hard lock do core em uma unica superficie ABI; dificulta extensao por modulos.
- **Causa raiz provável:** Design inicial centrado no binding WASM.
- **Recomendacao:** Definir camada de adaptacao (ports/adapters) e manter core independente do ABI.
- **Esforco estimado:** M
- **Risco de mudanca:** Medio

# Gap Analysis vs “Estado da Arte”

| Pratica moderna | Status | Justificativa |
| --- | --- | --- |
| RAII e ownership explicito | Atende | Uso de `std::unique_ptr` e destruicao ordenada (ex.: `CadEngine::state_`). |
| Zero new/delete no core | Atende | `rg` nao encontrou usos de `new/delete` fora de comentarios. |
| Parsing robusto (overflow-safe) | Nao atende | Checagens de tamanho via soma direta (SEC-001). |
| Sanitizers (ASan/UBSan/TSan) | Nao atende | Nenhuma configuracao encontrada (rg -i sanitize). |
| Warning levels altos (-Wall/-Wextra) | Nao atende | CMake sem flags (BUILD-001). |
| Clang-tidy/clang-format | Nao atende | Nenhum arquivo/config encontrado. |
| Modularizacao por componentes pequenos | Parcial | Modulos existem, mas muitos arquivos >800 LOC (ARCH-003). |
| Extensibilidade por plugins/DI | Nao atende | Enum fechado e switches centrais (DOM-001). |
| Testes deterministas | Atende | Suite gtest ampla, aparentemente determinista. |
| Fuzz/prop testing | Nao atende | Nenhum harness encontrado (TEST-002). |
| Observabilidade estruturada | Parcial | `EngineStats` existe, mas logging ad-hoc (OBS-001). |

# Plano de Ação (Roadmap)

**Fase 0 (1-2 dias): quick wins e baseline**

Checklist:
- [ ] Remover logs de debug ou gate por macro/flag.
- [ ] Adicionar warning flags no CMake para targets nativos.
- [ ] Documentar comandos de build/test no README (C++).
- [ ] Criar inventario de licencas (SPDX ou LICENSES.md).

Criterios de aceite:
- Build Debug com -Wall/-Wextra sem novos warnings criticos.
- Logging controlavel por flag de build.
- Documento de licencas versionado.

**Fase 1: arquitetura/boundaries**

Checklist:
- [ ] Remover compatibilidade legada (aliases e adaptadores).
- [ ] Isolar protocolo/ABI em modulo separado do core.
- [ ] Dividir arquivos >800 LOC em subcomponentes claros.

Criterios de aceite:
- Nenhuma referencia a compatibilidade legada.
- Core compila sem incluir headers de protocolo.
- Arquivos acima de 800 LOC reduzidos abaixo do limite.

**Fase 2: seguranca/robustez/sanitizers**

Checklist:
- [ ] Corrigir checagens de overflow em parsers.
- [ ] Adicionar ASan/UBSan nos targets nativos.
- [ ] Validar retorno de `allocBytes`.

Criterios de aceite:
- Parsers passam fuzz basico sem crash.
- Sanitizers rodando no CI para targets nativos.

**Fase 3: performance/profiling/benchmarks**

Checklist:
- [ ] Eliminar alocacoes em hot paths (render/draft).
- [ ] Introduzir buffers reutilizaveis para tessellation e draft.
- [ ] Definir micro-benchmarks de picking e rebuild.

Criterios de aceite:
- Pointer-move sem alocacoes observadas (heap profiler).
- Benchmarks com baseline documentado.

**Fase 4: testes e confiabilidade**

Checklist:
- [ ] Quebrar testes monoliticos em suites menores.
- [ ] Adicionar fuzz tests para `parseCommandBuffer` e `parseSnapshot`.
- [ ] Adicionar testes de regressao para novos handlers.

Criterios de aceite:
- Nenhum arquivo de teste >1000 LOC.
- Fuzz tests rodando no CI com seed corpus.

**Fase 5: modularizacao para acoplar dominio (2 estrategias)**

Estrategia 1: Boundaries + Interfaces + DI
- [ ] Criar interfaces para handlers (render/pick/serialize) por tipo.
- [ ] Registrar handlers em tabela (id -> vtable).
- [ ] Expor API de extensao para novos tipos sem tocar no core.

Estrategia 2: Plugin/Module ABI-safe
- [ ] Definir ABI estavel para plugins (C interface).
- [ ] Carregar plugins via registro estatico (WASM-safe).
- [ ] Separar protocolo base vs extensoes.

Criterios de aceite:
- Novo tipo de entidade integrado sem alterar switches centrais.
- Plugin de exemplo compila e registra handlers com sucesso.

# Apêndices

**Logs de build/test/analise estatica**

- Nenhum build/test executado (ambiente com rede restrita; dependencias usam FetchContent).
- Static analysis nao executada (nenhuma configuracao encontrada).

**Lista de comandos executados**

- `ls`
- `ls cpp`
- `sed -n '1,200p' cpp/CMakeLists.txt`
- `sed -n '200,400p' cpp/CMakeLists.txt`
- `sed -n '1,200p' README.md`
- `rg --files cpp/engine | head -n 50`
- `sed -n '1,200p' cpp/engine/engine.h`
- `sed -n '200,400p' cpp/engine/engine.h`
- `sed -n '400,800p' cpp/engine/engine.h`
- `sed -n '1,200p' cpp/engine/internal/engine_state.h`
- `sed -n '1,200p' cpp/engine/internal/engine_state.cpp`
- `rg "\bnew\b|\bdelete\b" cpp/engine cpp/tests cpp/engine.cpp`
- `sed -n '1,200p' cpp/engine/internal/engine_state_aliases.h`
- `sed -n '1,200p' cpp/engine/internal/engine_state_aliases_undef.h`
- `sed -n '1,200p' cpp/engine/core/util.h`
- `sed -n '1,200p' cpp/engine/command/command_dispatch.cpp`
- `sed -n '200,400p' cpp/engine/command/command_dispatch.cpp`
- `rg "printf|std::cout|std::cerr" cpp/engine cpp/tests`
- `rg "\bassert\b" cpp/engine cpp/tests`
- `sed -n '1,200p' cpp/engine/persistence/snapshot.cpp`
- `rg "for \\(const auto&|for \\(" -n cpp/engine/interaction/pick_system.cpp | head -n 40`
- `sed -n '200,380p' cpp/engine/interaction/pick_system.cpp`
- `rg "PickSystem::pick" -n cpp/engine/interaction/pick_system.cpp`
- `sed -n '380,520p' cpp/engine/interaction/pick_system.cpp`
- `sed -n '1,200p' cpp/engine/entity/entity_manager.h`
- `rg "deleteEntity\\(" -n cpp/engine/entity/entity_manager.cpp`
- `sed -n '200,320p' cpp/engine/entity/entity_manager.cpp`
- `sed -n '680,760p' cpp/engine/entity/entity_manager.cpp`
- `sed -n '760,820p' cpp/engine/entity/entity_manager.cpp`
- `sed -n '1,200p' cpp/engine/text/text_store.cpp`
- `sed -n '1,200p' cpp/engine/text/text_layout.cpp`
- `sed -n '1,200p' cpp/engine/text/text_shaping.cpp`
- `sed -n '1,200p' cpp/engine.cpp`
- `sed -n '200,400p' cpp/engine.cpp`
- `rg "LayerPropMask" -n cpp/engine`
- `sed -n '1,120p' cpp/engine/protocol/protocol_types.h`
- `rg "setEntityStyleOverride" -n cpp/engine`
- `sed -n '1,200p' cpp/engine/impl/engine_style.cpp`
- `sed -n '1,200p' cpp/engine/impl/engine_event.cpp`
- `find cpp/engine -type f -name '*.cpp' -o -name '*.h' | xargs wc -l | sort -nr | head -n 20`
- `find cpp/tests -type f -name '*.cpp' -o -name '*.h' | xargs wc -l | sort -nr | head -n 20`
- `rg "\bthrow\b" cpp/engine cpp/tests cpp/engine.cpp`
- `sed -n '220,300p' cpp/engine/core/types.h`
- `sed -n '1,120p' cpp/engine/engine_protocol_types.h`
- `rg "updateTransform\\(" -n cpp/engine/interaction/interaction_session.cpp`
- `sed -n '360,520p' cpp/engine/interaction/interaction_session.cpp`
- `rg "std::vector<" -n cpp/engine/interaction/interaction_session.cpp`
- `sed -n '100,180p' cpp/engine/interaction/interaction_session.cpp`
- `sed -n '1260,1350p' cpp/engine/interaction/interaction_session.cpp`
- `sed -n '1,220p' cpp/engine/text/font_manager.cpp`
- `sed -n '220,420p' cpp/engine/text/font_manager.cpp`
- `rg -i "fuzz" cpp`
- `rg -i "sanitize" cpp`
- `rg -i "clang-tidy|clang-format|cppcheck" -g '*CMake*' -g '.clang-*' -g '.clang-format' -g '.clang-tidy' -g '.cppcheck'`
- `rg --files -g 'LICENSE*' -g 'COPYING*'`
- `rg --files -g '.github/**'`
- `nl -ba cpp/engine/engine_protocol_types.h | sed -n '1,80p'`
- `nl -ba cpp/engine/internal/engine_state_aliases.h | sed -n '1,80p'`
- `nl -ba cpp/engine.cpp | sed -n '240,330p'`
- `nl -ba cpp/engine/command/command_dispatch.cpp | sed -n '130,200p'`
- `nl -ba cpp/engine/command/commands.cpp | sed -n '1,120p'`
- `nl -ba cpp/engine/persistence/snapshot.cpp | sed -n '60,140p'`
- `nl -ba cpp/engine/text_system.cpp | sed -n '1,80p'`
- `nl -ba cpp/engine/render/render.cpp | sed -n '640,760p'`
- `nl -ba cpp/engine/interaction/interaction_session.cpp | sed -n '1300,1360p'`
- `nl -ba cpp/engine/core/types.h | sed -n '190,220p'`
- `nl -ba cpp/engine/interaction/pick_system.cpp | sed -n '430,560p'`
- `nl -ba cpp/CMakeLists.txt | sed -n '1,120p'`
- `nl -ba cpp/engine/impl/engine_snapshot.cpp | sed -n '90,180p'`
- `nl -ba cpp/engine/protocol/protocol_types.h | sed -n '1,40p'`

**Glossario de componentes**

- CadEngine: facade principal do engine C++ exposta ao JS/WASM.
- EntityManager: armazenamento e indice de entidades geometricas.
- HistoryManager: undo/redo transacional.
- PickSystem: picking e spatial index.
- InteractionSession: sessao de transformacoes interativas.
- TextSystem: layout, shaping, atlas e buffers de texto.
- Render: tessellation e geracao de buffers de GPU.
- Snapshot: serializacao binaria do documento.
