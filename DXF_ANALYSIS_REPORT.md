# Relatório de Diagnóstico e Plano de Ação: Importação DXF

Este relatório analisa o estado atual da importação DXF no `EndeavourCanvas` e propõe um caminho prático para atingir fidelidade "nível AutoCAD".

---

## 1. Resumo Executivo

**Estado Atual:** O sistema atual é funcional para layouts simples (paredes retas, blocos explodidos), mas **falha criticamente em fidelidade geométrica e visual** para desenhos técnicos reais. A arquitetura baseada em "explosão total" (flattening) simplifica o renderizador, mas inviabiliza arquivos complexos.

**Pontos Fortes:**
*   **Worker Isolado:** O parsing ocorre fora da thread principal (`dxfWorker.ts`), evitando travamento da UI.
*   **Escala Inteligente:** A lógica de detecção de unidades (Meters vs CM) e normalização de coordenadas é robusta.
*   **Limpeza:** O passo de `cleanupShapes` ajuda a sanear dados ruins.

**Pontos Críticos (Fidelidade Quebrada):**
1.  **Ausência de Curvas em Polylines (Bulge):** O parser ignora completamente o fator `bulge`. Qualquer parede curva, piscina ou arco desenhado como Polyline (padrão AutoCAD) aparece como linhas retas facetadas.
2.  **Linetypes Ignorados:** O renderizador força `ctx.setLineDash([])`, transformando linhas tracejadas/pontilhadas (DEMOLIR, PROJEÇÃO) em contínuas.
3.  **Explosão de Blocos:** Blocos são explodidos recursivamente em primitivas. Um desenho com 1.000 cadeiras gera ~10.000 linhas duplicadas na memória em vez de 1 geometria instanciada 1.000 vezes.
4.  **Splines "Quebradas":** Splines são desenhadas ligando apenas os pontos de controle, sem interpolação, resultando em ziguezagues grosseiros.

**Top 5 Melhorias para "AutoCAD-like":**
1.  **Implementar Algoritmo de Bulge:** Converter segmentos de polyline com `bulge` em arcos reais.
2.  **Suporte a Linetypes:** Mapear estilos DXF (DASHED, CENTER) para `setLineDash` do Canvas.
3.  **Refatorar Blocos para Instancing:** Criar entidade `type: 'block_ref'` para renderizar referências sem duplicar geometria.
4.  **Interpolação de Splines:** Implementar B-Spline sampling para suavizar curvas livres.
5.  **Fidelidade de Texto:** Suportar alinhamentos verticais (valign) e width factors (fontes estreitas).

---

## 2. Diagnóstico Técnico Detalhado

### A. Geometria Curva (Polyline Bulge)
*   **Sintoma:** Paredes curvas, arcos de porta e piscinas aparecem como segmentos retos desconectados ou simplificados.
*   **Causa:** O arquivo `dxfToShapes.ts` itera sobre `entity.vertices` e cria linhas retas, ignorando a propriedade `v.bulge`.
*   **Código:** `frontend/features/import/utils/dxf/dxfToShapes.ts` (Case `LWPOLYLINE`).
*   **Correção:** Detectar `bulge !== 0`. Se existir, calcular centro/raio/ângulos do arco e gerar um shape do tipo `arc` ou discretizar em múltiplos segmentos lineares suaves.

### B. Linhas Tracejadas (Linetypes)
*   **Sintoma:** Linhas de projeção, eixos e demolição aparecem contínuas.
*   **Causa:** O `ShapeRenderer.ts` chama explicitamente `ctx.setLineDash([])` e o modelo de dados `Shape` não armazena o padrão de linha oriundo do DXF.
*   **Código:** `frontend/features/editor/components/canvas/renderers/ShapeRenderer.ts`.
*   **Correção:** Adicionar propriedade `dashArray: number[]` ao tipo `Shape`. No import, mapear nomes (DASHED -> `[10, 5]`) e aplicar no render.

### C. Performance e Semântica de Blocos
*   **Sintoma:** Arquivos grandes (50MB+) estouram memória ou ficam lentos; perda de semântica (não dá para selecionar "a mesa", só "a linha da mesa").
*   **Causa:** `dxfToShapes.ts` usa recursão em `processEntity` para o case `INSERT`, criando novas cópias de shapes para cada instância.
*   **Impacto:** O(N * M) objetos em memória.
*   **Correção:** Arquitetura de "Symbol Table". Importar definições de bloco uma vez para uma `LibraryStore` e criar shapes leves `type: 'insert'` que apenas referenciam o ID do bloco + Transform Matrix.

### D. Splines
*   **Sintoma:** Curvas orgânicas (topografia, paisagismo) parecem "amebas" poligonais.
*   **Causa:** O código apenas conecta `controlPoints` com linhas retas.
*   **Código:** `dxfToShapes.ts` (Case `SPLINE`).
*   **Correção:** Implementar função de avaliação de B-Spline (De Boor's algorithm) para gerar uma polyline densa e suave.

---

## 3. Backlog Priorizado

### **P0 - Crítico (Fidelidade Geométrica)**
*   [ ] **Polyline Bulge:** Implementar função `getBulgeArc(p1, p2, bulge)` para converter segmentos curvos em Arcos ou Polyline densa.
*   [ ] **Spline Interpolation:** Implementar sampling de BSpline para converter Control Points em curva visualmente correta.
*   [ ] **Coordenadas/WCS:** Garantir que o `transform.scaleY: -1` (implícito no renderer) não inverta textos ou arcos (CW/CCW) incorretamente.

### **P1 - Importante (Visual e Performance)**
*   [ ] **Linetype Support:** Adicionar campo `strokeDash` no `Shape` e mapear estilos básicos do DXF.
*   [ ] **Hatch Basic:** Suportar preenchimentos sólidos (`SOLID`) e padrões simples como linhas (convertendo em geometria).
*   [ ] **Block Instancing (Fase 1):** Pelo menos agrupar entidades de um bloco em um `Group` para permitir seleção única, mesmo que geometricamente explodido.

### **P2 - Refinamento**
*   [ ] **Text Styles:** Suportar fontes SHX (via mapeamento para TTF similar) e `Width Factor`.
*   [ ] **Dimensions:** Converter entidades `DIMENSION` em blocos anônimos (geometria explodida) para garantir visualização idêntica, já que renderizar cotas dinamicamente é muito complexo.

---

## 4. Checklist de Fidelidade "AutoCAD"

| Recurso | Status Atual | Meta | Ação Necessária |
| :--- | :---: | :---: | :--- |
| **Coordenadas** | OK | WCS | Manter lógica atual de normalização. |
| **Layers** | OK | Full | Suportar Linetype por Layer. |
| **Cores** | OK | ACI/RGB | Manter. Suporte a `TrueColor` (RGB direto) se falhar. |
| **Polylines** | **FALHA** | Bulge | Implementar matemática de arco por segmento. |
| **Blocks** | Parcial | Instance | Mudar de "Explode" para "Reference" (longo prazo). |
| **Textos** | Parcial | Align | Corrigir alinhamento vertical (Middle/Top). |
| **Splines** | **FALHA** | Smooth | Implementar De Boor algorithm. |
| **Hatch** | Falta | Visual | Converter padrões em linhas clipadas. |
| **Linetypes** | Falta | Dash | Renderizar padrões tracejados. |

---

## 5. Plano de Testes e Validação

Para garantir que não estamos apenas "chutando" a matemática:

1.  **Testes Unitários Geométricos (`dxfToShapes.test.ts`):**
    *   *Caso Bulge:* Criar um teste com `bulge: 1` (semicírculo). Verificar se o output contém um shape `arc` ou pontos intermediários calculados corretamente.
    *   *Caso Spline:* Verificar se 3 pontos de controle geram >10 pontos de vértice interpolados.

2.  **Validação Visual (Golden Files):**
    *   Criar arquivo `reference_curves.dxf` no AutoCAD contendo: 1 Círculo, 1 Arco, 1 Polyline com retas e curvas misturadas, 1 Spline.
    *   Importar no sistema e comparar visualmente (sobreposição).

3.  **Sanity Check de Performance:**
    *   Importar arquivo de 10MB.
    *   Tempo de parse < 5s.
    *   FPS do canvas > 30 durante Pan/Zoom.
