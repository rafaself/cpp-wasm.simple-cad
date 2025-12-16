# Relatório de Implementação: Importação DWG/DXF

## 1. Varredura e Diagnóstico

### Estado Atual (Importação de PDF/Imagem)
O sistema atual utiliza um fluxo client-side robusto:
- **UI:** `ImportPlanModal` permite upload de PDF/SVG/Imagens.
- **Lógica:** `usePlanImport` orquestra o processo.
- **Parsing:** `pdfToShapes.ts` utiliza `pdfjs-dist` para extrair vetores ou rasterizar como fallback.
- **Modelo:** Os objetos são convertidos para a interface `Shape` (internal representation) e armazenados no `useDataStore`.
- **Coordenadas:** O sistema interno utiliza Y-Up (Cartesiano). O importador de PDF inverte o eixo Y para corrigir a transformação de viewport do PDF.js.

### Pontos de Extensão
- **Pipeline:** O fluxo é facilmente extensível para novos formatos adicionando um parser específico e conectando-o ao `usePlanImport`.
- **Worker:** A arquitetura já prevê assincronismo (Promises), facilitando a inclusão de Web Workers para processamento pesado (DWG/DXF).

### Riscos Identificados
- **Performance:** Arquivos CAD podem conter dezenas de milhares de entidades. Processar isso na thread principal travaria a UI.
- **Coordenadas:** DXF/DWG usam Y-Up. É crucial manter a consistência com o sistema de coordenadas do Canvas.
- **Entidades Complexas:** Blocos (`INSERT`), `HATCH` e `SPLINE` requerem tratamento especial (explodir ou simplificar).
- **Licenciamento:** DWG é um formato binário proprietário. Parsers JS puros são inexistentes. Parsers WASM (LibreDWG) geralmente são GPL, o que pode conflitar com projetos comerciais.

## 2. Decisão Arquitetural

**Abordagem Escolhida: Client-side DXF (com suporte a DWG via conversão prévia)**

Decidimos implementar um parser robusto de **DXF** rodando inteiramente no cliente via Web Worker.

### Justificativa
1.  **Compatibilidade e Licença:** A biblioteca `dxf-parser` é MIT, estável e amplamente utilizada. Isso evita problemas legais (GPL) e complexidade de deploy (WASM blobs grandes).
2.  **Performance:** O uso de Web Worker garante que o parsing de arquivos grandes (50MB+) não congele a interface.
3.  **Segurança:** Processamento local garante privacidade dos dados do usuário (arquivos não sobem para servidor).
4.  **UX:** O usuário recebe feedback imediato. Para arquivos `.dwg`, o sistema instruirá a conversão para `.dxf` (formato de intercâmbio padrão) ou poderá ser expandido futuramente com um conversor WASM/Server-side dedicado.

### Estratégia de Implementação
- **Worker:** `dxfWorker.ts` recebe o texto do arquivo, parseia via `dxf-parser` e retorna um DTO simplificado.
- **Conversor:** `dxfToShapes.ts` transforma as entidades DXF em `Shape` do sistema, aplicando normalização de unidades e coordenadas.
- **Limites:** Serão aplicados limites de tamanho de arquivo (ex: 50MB) e contagem de entidades para proteger a memória do navegador.

## 3. Próximos Passos (Roadmap DWG Nativo)
Para suportar `.dwg` binário nativamente no futuro, recomendamos:
- **Opção A (WASM):** Integrar `libredwg-wasm` (GPL) se a licença permitir, ou adquirir licença comercial da ODA (Open Design Alliance).
- **Opção B (Server-side):** Criar um microserviço com `oda-file-converter` para converter DWG -> DXF on-the-fly.
