# Relatório de Investigação: Unificação de Toast e UserHint

Este relatório documenta a investigação sobre os componentes de notificação e dicas contextuais no projeto EndeavourCanvas.

## 1. Problema Identificado

Foram identificados dois componentes que servem propósitos muito similares:

- **Toast.tsx**: Atualmente órfão (sem usos no código), mas pronto para notificações globais.
- **UserHint.tsx**: Em uso para fornecer instruções contextuais (ex: ferramentas de elétrica).

A manutenção de dois componentes visualmente distintos para fins similares gera inconsistência estética e dívida técnica.

## 2. Componentes Encontrados

### Toast (`frontend/components/ui/Toast.tsx`)

- **Status**: Ativo no código, mas não instanciado em nenhum lugar.
- **Implementação**: Usa `fixed` positioning, focado em notificações de sistema (Info, Success, Warning, Error).
- **Estética**: Retangular, cantos levemente arredondados, fundo escuro sólido.

### UserHint (`frontend/features/editor/components/UserHint.tsx`)

- **Status**: Em uso ativo em `CanvasManager.tsx`.
- **Implementação**: Usa `absolute` positioning, focado em interações do usuário com o Canvas.
- **Estética**: Estilo "Pill" (arredondado), backdrop-blur, ícone pulsante, transparência elegante.

## 3. Outros Componentes Similares

- **QuickAccessToolbar**: Usa posicionamento similar (`bottom-4 left-1/2`), mas é estritamente uma barra de ferramentas.
- **ImportPlanModal**: Possui tratamento de erro próprio que utiliza o `alert` nativo do browser ou UI interna, perdendo a chance de usar um sistema de Toast unificado.

## 4. Proposta de Unificação

Recomenda-se a criação de um componente `Notification` (ou refatoração do `Toast`) que suporte:

- **Modos Visuais**: `pill` (estilo hint) ou `classic` (estilo toast).
- **Escopos**: `global` (overlay da app) ou `contextual` (dentro do canvas).
- **Auto-dismiss**: Parametrizável para mensagens de aviso permanentes ou transitórias.

---

**Data**: 2025-12-17
**Autor**: Antigravity
**Status do Plano**: Aguardando aprovação para execução.
