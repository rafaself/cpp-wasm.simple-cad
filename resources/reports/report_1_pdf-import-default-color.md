# Relatório de Ajuste: Cor Padrão na Importação de PDF

## 1. Problema

Ao importar um arquivo PDF no sistema, a cor padrão pré-selecionada não era o cinza, o que exigia que o usuário fizesse a alteração manualmente caso desejasse esse estilo.

## 2. Plano de Abordagem

- Identificar as opções padrão de importação para o formato PDF.
- Alterar o esquema de cores padrão (`colorScheme`) de `'custom'` para `'fixedGray153'`.
- Garantir que essa alteração reflita em ambos os modos de importação de PDF (Geometria Editável e Planta de Referência).

## 3. Arquivos Alterados

- `frontend/features/import/ImportPlanModal.tsx`: Atualização do objeto `DEFAULT_OPTIONS_PDF` para incluir `colorScheme: 'fixedGray153'`.

## 4. Avaliação de Risco

- **Baixo**: A alteração afeta apenas o valor inicial das opções de importação exibidas no modal. O usuário ainda tem total liberdade para alterar a cor antes de confirmar a importação. Não há impacto na lógica de processamento de arquivos ou na estabilidade do sistema.

## 5. Instruções de Verificação

1. Clique no botão de importar planta (PDF).
2. Abra as "Configurações Avançadas".
3. Verifique se na seção "Estilo e Cores", a opção **Cinza** já está selecionada por padrão.
4. Realize uma importação e confirme que os elementos importados (sejam shapes ou SVG) utilizam a cor cinza (#999999).
