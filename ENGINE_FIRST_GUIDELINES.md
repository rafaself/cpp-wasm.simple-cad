# ENGINE_FIRST_GUIDELINES.md

## Regras de Autoridade
- O engine C++ e a unica fonte de verdade para: shapes, texto, selecao, z-order, layers, visibilidade e lock.
- React/TS mantem apenas estado de UI (viewport, tool ativa, modais, preferencia de usuario).
- Toda alteracao de documento deve ocorrer via comandos para o engine e respostas via snapshot/delta.
- JS nao deve reconstituir estado canonico a partir de caches locais.

## O que e proibido no JS
- Guardar copia autoritativa de shapes, texto ou selecao.
- Aplicar transformacoes de geometria diretamente no store como verdade final.
- Implementar picking final em JS (apenas UI hints e render overlays).
- Fazer O(N) em pointermove/typing para logica de documento.
- Inventar IDs de entidades sem coordenacao com o engine.

## O que deve viver no Engine
- Armazenamento canonico de entidades (shapes, texto, layers, flags).
- Picking, hit-test, spatial index e z-order.
- Transform sessions (move, resize, vertex drag) e commit/cancel.
- Layout de texto, conteudo, selecao e caret.
- Undo/redo e serializacao do documento.

## Regras de Boundary (TS <-> WASM)
- Enums, opcodes e payloads devem ter paridade estrita e versao explicita.
- Comandos opcionais devem ter feature negotiation (ou fallback claro).
- IDs devem ser emitidos ou validados pelo engine, com mapa unico no runtime.
- JS so consome dados via snapshots/deltas; nao edita memoria do engine.
