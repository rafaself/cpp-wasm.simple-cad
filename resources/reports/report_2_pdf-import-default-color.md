# Relatório de Ajuste: Unificação de Layout e Cor Padrão na Importação de PDF

## 1. Problema

Havia uma inconsistência visual entre o modal de importação de DXF e o de PDF. Além disso, os usuários desejavam que o cinza fosse a cor pré-selecionada por padrão para PDFs. O usuário solicitou que o DXF adotasse o design de lista que era utilizado no PDF.

## 2. Plano de Abordagem

- **Configuração de Padrão (PDF)**: Alterar o `colorScheme` inicial de PDFs para `'fixedGray153'` (Cinza).
- **Unificação Visual (DXF -> PDF Style)**: Portar o design de lista e botões de seleção de cor da seção PDF para a seção DXF, substituindo o layout de grid anterior. Isso garante uma experiência consistente e simplificada em ambos os tipos de importação.

## 3. Arquivos Alterados

- `frontend/features/import/ImportPlanModal.tsx`:
  - Atualização de `DEFAULT_OPTIONS_PDF`.
  - Refatoração da seção de cores do DXF para adotar o layout de lista.
  - Restauração do layout de lista na seção de cores do PDF.

## 4. Avaliação de Risco

- **Baixo**: A alteração é estética e de configuração inicial. As funções de callback e a lógica de estado permanecem inalteradas.

## 5. Instruções de Verificação

1. Abra o modal de importação de **PDF**.
   - Verifique se o **Cinza** está selecionado por padrão.
   - Verifique se a seção "Estilo e Cores" utiliza o layout de lista vertical.
2. Abra o modal de importação de **DXF**.
   - Verifique se a seção "Estilo e Cores" também utiliza agora o layout de lista vertical (igual ao PDF).
   - Teste a seleção de cores personalizadas em ambos para garantir que o seletor abre corretamente.
