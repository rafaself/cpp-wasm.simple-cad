# Análise Técnica: Evolução para CAD Elétrico

Este documento apresenta uma análise técnica sobre a viabilidade de evoluir a plataforma atual ("ProtonCanvas") para um software de projetos elétricos residenciais, respondendo à dúvida sobre migração para modelos "CAD-like".

## 1. Diagnóstico da Arquitetura Atual

O sistema atual é construído sobre **HTML5 Canvas** nativo, gerenciado por **React** e **Zustand**.

*   **Renderização:** Customizada (`EditorCanvas.tsx`). Controle total sobre o pixel.
*   **Dados:** Vetoriais. Os objetos (`Shape`) armazenam coordenadas matemáticas (x, y), não pixels rasterizados.
*   **Precisão:** Utiliza `number` do JavaScript (ponto flutuante de 64 bits), que oferece cerca de 15-17 dígitos decimais de precisão.

### O que é "Vectorial Data"?
Você já tem isso. Seu software *é* vetorial. Quando você desenha uma linha, o sistema guarda `{ x1: 10, y1: 10, x2: 100, y2: 100 }`. Isso é a definição de dado vetorial. Diferente do Photoshop (que guarda pixels), seu software permite zoom infinito sem perda de qualidade e edição precisa de geometria.

## 2. Pontos de Decisão

### A. Precisão Numérica
*   **Mito:** "Preciso de um motor CAD C++ para ter precisão".
*   **Realidade:** Para arquitetura civil/elétrica, a precisão do JavaScript é superabundante.
    *   Uma casa de 100m representada em precisão float pode ter erros na casa dos nanômetros, o que é irrelevante para a construção civil.
*   **Desafio Real:** O desafio não é o armazenamento, mas a **interface**. Implementar *snapping* (imã), *trigonometria* para interseções e *unidades de medida* (saber que 100 pixels = 1 metro). Seu código já implementa um sistema básico de *snap*, o que é um excelente sinal.

### B. "Inteligência" (Engenharia vs Desenho)
Atualmente, seu software vê "Linhas" e "Círculos". Para um projeto elétrico, ele precisa ver "Eletrodutos" e "Tomadas".

*   **Abordagem de Migração (Engine Pronta):** Se você usar uma lib de CAD genérica, ela ainda verá apenas linhas. Você terá que programar a lógica elétrica de qualquer jeito.
*   **Abordagem Atual:** É trivial adicionar metadados aos seus objetos.
    *   *Exemplo:* Adicionar `properties: { type: 'wire', gauge: '2.5mm' }` ao seu objeto `Shape`.
    *   Isso permite calcular listas de materiais iterando sobre o array de formas.

### C. Exportação DWG/DXF
Esta é uma funcionalidade de *entrada/saída*, não de *núcleo*.
*   Existem bibliotecas JavaScript (como `dxf-writer` ou `maker.js`) que pegam arrays de coordenadas e geram arquivos DXF.
*   Como seus dados já são vetoriais (`ponto A` a `ponto B`), criar um exportador é uma tarefa de mapeamento direta, independente da engine gráfica usada.

## 3. Veredito: Migrar ou Evoluir?

**Recomendação: EVOLUIR a base atual.**

Não há ganho técnico significativo em jogar fora sua implementação de Canvas para adotar outra biblioteca de renderização 2D (como Fabric.js ou Konva) neste momento, pois:
1.  **Controle:** Você já domina o ciclo de renderização. Engines prontas muitas vezes dificultam customizações específicas (ex: desenhar símbolos elétricos complexos ou réguas dinâmicas).
2.  **Performance:** Sua implementação nativa é leve. Bibliotecas grandes trazem peso desnecessário.
3.  **O Trabalho Duro é o mesmo:** A complexidade de um CAD elétrico está na **Lógica de Negócios** (validar circuitos, calcular fiação), não em desenhar linhas na tela. Nenhuma engine gráfica fará isso por você.

## 4. Roteiro de Evolução Sugerido

Para transformar o app atual em uma ferramenta elétrica, foque nestas melhorias de "Data Model", não em gráficos:

1.  **Sistema de Unidades:** Definir uma escala global (ex: 50 pixels = 100 cm). Isso transforma "desenho" em "projeto".
2.  **Camada Semântica:** Criar tipos específicos de objetos. Ao invés de apenas `Shape`, ter `ElectricalElement`.
    *   *Linha* vira *Eletroduto* (com propriedade de diâmetro).
    *   *Círculo* vira *Caixa de Passagem*.
3.  **Cálculos em Tempo Real:** Criar observadores que somam comprimentos baseados nos metadados acima.

---
*Esta análise foi gerada com base na inspeção do código fonte atual (`frontend/features/editor/components/EditorCanvas.tsx` e `frontend/stores/useAppStore.ts`).*
