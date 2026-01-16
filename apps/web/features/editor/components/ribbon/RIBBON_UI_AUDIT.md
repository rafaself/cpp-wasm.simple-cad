# 🎯 Revisão Completa de UI do Ribbon

**Data:** 2025-12-31
**Status:** ✅ Implementação Completa

---

## 📋 Resumo Executivo

A análise do Ribbon revelou oportunidades significativas de componentização e refatoração.
Foram identificados padrões repetitivos que foram extraídos em componentes reutilizáveis,
além de inconsistências de estilo que foram corrigidas.

### ✅ Implementado Nesta Revisão

1. **`RibbonDivider`** - Separador visual consistente (vertical/horizontal)
2. **`RibbonIconButton`** - Botão de ícone para toggles (bold, italic, visibility, lock, etc.)
3. **`RibbonToggleGroup`** - Container para grupos de botões de toggle
4. **`RibbonControlWrapper`** - Wrapper para alinhamento vertical de controles
5. **`getRibbonButtonColorClasses`** - Utilitário centralizado para estilos de botão
6. **`RIBBON_ICON_SIZES`** - Tokens padronizados para tamanhos de ícone
7. **Barrel export (`index.ts`)** - Importação simplificada de componentes

---

## 🔍 Análise de Componentes Existentes

### Estrutura Atual

```
ribbon/
├── EditorRibbon.tsx           # Container principal (183 linhas)
├── RibbonButton.tsx           # Botão padrão/pequeno (110 linhas)
├── RibbonLargeButton.tsx      # Botão grande vertical (70 linhas)
├── RibbonGroup.tsx            # Agrupamento de itens (65 linhas)
├── LayerRibbonControls.tsx    # Controles de camada (112 linhas)
├── TextFormattingControls.tsx # Wrapper de texto (21 linhas)
└── ribbonUtils.ts             # Utilitários (36 linhas)
```

---

## 🚨 Problemas Identificados

### 1. **Duplicação de Lógica de Cores/Estados**

**Problema:** `RibbonButton.tsx` e `RibbonLargeButton.tsx` duplicam a mesma lógica de cores e estados:

```tsx
// RibbonButton.tsx (linhas 65-77)
let colorClass = 'bg-surface-2 text-text border border-transparent focus-outline';
if (isActive) {
  colorClass = 'bg-primary text-primary-contrast border-primary/20 shadow-sm focus-outline';
} else if (isStub) {
  colorClass = 'bg-surface-2/50 text-text-muted opacity-60 cursor-not-allowed focus-outline';
} else {
  const hoverClass =
    item.actionId === 'delete'
      ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
      : 'hover:bg-surface-1 hover:text-text hover:border-border/50';
  colorClass = `${colorClass} ${hoverClass}`;
}

// RibbonLargeButton.tsx (linhas 41-53) - EXATAMENTE o mesmo código
```

**Solução:** Extrair para utilitário em `ribbonUtils.ts` ou criar um hook `useRibbonButtonStyles`.

---

### 2. **Botões de Toggle Não Componentizados**

**Problema:** Em `LayerRibbonControls.tsx` e `TextControls.tsx`, os botões de toggle (visibility, lock, bold, italic, etc.) seguem o mesmo padrão mas são escritos inline:

```tsx
// LayerRibbonControls.tsx - Botão de visibilidade
<button
  onClick={() => updateLayerFlags(!activeLayer?.visible, undefined)}
  className={`w-7 h-full ${BUTTON_STYLES.centered} focus-outline ${activeLayer?.visible ? 'text-primary hover:text-primary-hover' : 'text-text-muted hover:text-text'} rounded hover:bg-surface-2 transition-colors shrink-0`}
  title={...}
>
  {activeLayer?.visible ? <Eye size={13} /> : <EyeOff size={13} />}
</button>

// TextControls.tsx - Botões de estilo (bold, italic, etc.)
<button
  className={`w-8 h-full ${BUTTON_STYLES.centered} focus-outline ${stateClass}`}
  ...
>
```

**Solução:** Criar componente `RibbonIconToggle`.

---

### 3. **Grupo de Botões de Toggle Repetido**

**Problema:** O padrão de "grupo de botões com borda" aparece em múltiplos lugares:

```tsx
// TextControls.tsx - Align Control (linha 163)
<div className="flex bg-surface-2 rounded border border-border/50 p-0.5 ribbon-fill-h gap-0.5">
  {alignOptions.map(...)}
</div>

// TextControls.tsx - Style Control (linha 298)
<div className="flex bg-surface-2 rounded border border-border/50 p-0.5 ribbon-fill-h gap-0.5">
  {options.map(...)}
</div>

// LayerRibbonControls.tsx (linha 72)
<div className="flex bg-surface-2 rounded border border-border/50 p-0.5 h-full gap-0.5 shrink-0 items-center">
```

**Solução:** Criar componente `RibbonToggleGroup`.

---

### 4. **Divisor Vertical Inline**

**Problema:** O divisor vertical é repetido em vários locais:

```tsx
// LayerRibbonControls.tsx (linha 83)
<div className="w-px bg-border/50 my-0.5 h-4/5" />

// EditorRibbon.tsx (linha 108)
<div className="h-full w-px bg-border mx-2 opacity-50" aria-hidden="true" />
```

**Solução:** Criar componente `RibbonDivider`.

---

### 5. **InputWrapper Interno em TextControls**

**Problema:** O componente `InputWrapper` é definido internamente em `TextControls.tsx` mas poderia ser reutilizado:

```tsx
const InputWrapper: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={`flex flex-col justify-center w-full h-full ${className || ''}`}>{children}</div>
);
```

**Solução:** Mover para `ribbon/` e reutilizar.

---

### 6. **Função `getBindingId` Hardcoded**

**Problema:** A função `getBindingId` em `ribbonUtils.ts` usa uma série de if/else hardcoded:

```tsx
export const getBindingId = (item: RibbonItem): string | undefined => {
  if (item.kind === 'tool' && item.toolId) {
    if (item.toolId === 'select') return 'tools.select';
    if (item.toolId === 'line') return 'tools.line';
    // ... muitos mais
  }
  // ...
};
```

**Solução:** Usar um mapa de lookup ou adicionar `bindingId` à configuração do `RibbonItem`.

---

### 7. **Falta de Prop `size` Consistente**

**Problema:** Ícones têm tamanhos diferentes espalhados pelo código:

- `RibbonLargeButton`: `size={20}`
- `RibbonButton`: `size={15}`
- `LayerRibbonControls`: `size={13}` e `size={12}`
- `TextControls`: `size={16}`

**Solução:** Definir tokens de tamanho de ícone para ribbon.

---

## ✅ Plano de Ação - Componentização

### Fase 1: Utilitários Compartilhados

#### 1.1 Criar `useRibbonButtonStyles` Hook

```tsx
// ribbonUtils.ts (adicionar)
export const useRibbonButtonStyles = (
  isActive: boolean,
  isStub: boolean,
  actionId?: string,
): string => {
  if (isActive) {
    return 'bg-primary text-primary-contrast border-primary/20 shadow-sm focus-outline';
  }
  if (isStub) {
    return 'bg-surface-2/50 text-text-muted opacity-60 cursor-not-allowed focus-outline';
  }
  const hoverClass =
    actionId === 'delete'
      ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
      : 'hover:bg-surface-1 hover:text-text hover:border-border/50';
  return `bg-surface-2 text-text border border-transparent focus-outline ${hoverClass}`;
};
```

#### 1.2 Adicionar Tokens de Ícone

```css
/* global.css */
:root {
  --ribbon-icon-lg: 20px;
  --ribbon-icon-md: 16px;
  --ribbon-icon-sm: 13px;
}
```

---

### Fase 2: Novos Componentes

#### 2.1 `RibbonDivider.tsx`

```tsx
interface RibbonDividerProps {
  orientation?: 'vertical' | 'horizontal';
}

export const RibbonDivider: React.FC<RibbonDividerProps> = ({ orientation = 'vertical' }) =>
  orientation === 'vertical' ? (
    <div className="h-full w-px bg-border/50 mx-2" aria-hidden="true" />
  ) : (
    <div className="w-full h-px bg-border/50 my-1" aria-hidden="true" />
  );
```

#### 2.2 `RibbonIconButton.tsx`

```tsx
interface RibbonIconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  isToggle?: boolean;
  title?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'warning';
}

export const RibbonIconButton: React.FC<RibbonIconButtonProps> = ({
  icon,
  onClick,
  isActive = false,
  isToggle = false,
  title,
  size = 'md',
  disabled = false,
  variant = 'default',
}) => {
  const sizeClass = size === 'sm' ? 'w-7' : 'w-8';

  let stateClass = '';
  if (isActive) {
    stateClass = BUTTON_STYLES.active;
  } else if (variant === 'danger') {
    stateClass = 'text-red-500 hover:text-red-400';
  } else if (variant === 'warning') {
    stateClass = 'text-yellow-500 hover:text-yellow-400';
  }

  return (
    <button
      onClick={onClick}
      className={`${sizeClass} h-full ${BUTTON_STYLES.centered} focus-outline rounded hover:bg-surface-2 transition-colors ${stateClass}`}
      title={title}
      disabled={disabled}
      aria-pressed={isToggle ? isActive : undefined}
    >
      {icon}
    </button>
  );
};
```

#### 2.3 `RibbonToggleGroup.tsx`

```tsx
interface RibbonToggleGroupProps {
  children: React.ReactNode;
  separator?: boolean; // Show separator between items?
}

export const RibbonToggleGroup: React.FC<RibbonToggleGroupProps> = ({
  children,
  separator = false,
}) => (
  <div className="flex bg-surface-2 rounded border border-border/50 p-0.5 ribbon-fill-h gap-0.5 items-center">
    {children}
  </div>
);
```

#### 2.4 `RibbonControlWrapper.tsx`

```tsx
interface RibbonControlWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export const RibbonControlWrapper: React.FC<RibbonControlWrapperProps> = ({
  children,
  className,
}) => (
  <div className={`flex flex-col justify-center w-full h-full ${className || ''}`}>{children}</div>
);
```

---

### Fase 3: Refatoração de Componentes Existentes

#### 3.1 Simplificar `RibbonButton.tsx` e `RibbonLargeButton.tsx`

- Usar `useRibbonButtonStyles` hook
- Remover duplicação de lógica de cores

#### 3.2 Refatorar `LayerRibbonControls.tsx`

- Usar `RibbonIconButton` para visibility/lock
- Usar `RibbonToggleGroup` para container
- Usar `RibbonDivider` interno

#### 3.3 Refatorar `TextControls.tsx`

- Usar `RibbonIconButton` para bold/italic/underline/strike
- Usar `RibbonToggleGroup` para containers
- Usar `RibbonControlWrapper` ao invés de InputWrapper inline

---

## 📊 Métricas de Impacto

| Área                      | Antes   | Depois (Estimado) |
| ------------------------- | ------- | ----------------- |
| Linhas duplicadas         | ~60     | ~10               |
| Componentes reutilizáveis | 4       | 9                 |
| Consistência visual       | Parcial | Total             |
| Manutenibilidade          | Média   | Alta              |

---

## 🎨 Inconsistências Visuais a Corrigir

### 1. Tamanhos de Ícone

- **Problema:** Variação entre 12px, 13px, 15px, 16px, 20px
- **Solução:** Padronizar para 3 tamanhos: `sm=14px`, `md=16px`, `lg=20px`

### 2. Border Radius

- **Problema:** Todos usam `rounded` (4px), consistente ✅

### 3. Padding dos Botões

- **Problema:** Variação entre `p-0.5`, `px-2`, `px-2.5`
- **Solução:** Padronizar baseado no tipo de botão

### 4. Cores de Estado Ativo

- **Problema:** Inconsistência entre `BUTTON_STYLES.active` e classes inline
- **Solução:** Usar sempre `BUTTON_STYLES.active`

---

## 🔧 Próximos Passos

1. [ ] Criar `useRibbonButtonStyles` hook
2. [ ] Criar `RibbonDivider` componente
3. [ ] Criar `RibbonIconButton` componente
4. [ ] Criar `RibbonToggleGroup` componente
5. [ ] Criar `RibbonControlWrapper` componente
6. [ ] Refatorar `RibbonButton.tsx` para usar hook
7. [ ] Refatorar `RibbonLargeButton.tsx` para usar hook
8. [ ] Refatorar `LayerRibbonControls.tsx` para usar novos componentes
9. [ ] Refatorar `TextControls.tsx` para usar novos componentes
10. [ ] Atualizar `recipes.ts` com novos padrões de botão do ribbon

---

## 📁 Estrutura Proposta

```
ribbon/
├── components/
│   ├── RibbonButton.tsx
│   ├── RibbonLargeButton.tsx
│   ├── RibbonIconButton.tsx      # NOVO
│   ├── RibbonToggleGroup.tsx     # NOVO
│   ├── RibbonDivider.tsx         # NOVO
│   ├── RibbonControlWrapper.tsx  # NOVO
│   └── RibbonGroup.tsx
├── controls/
│   ├── LayerRibbonControls.tsx
│   ├── TextFormattingControls.tsx
│   └── TextControls.tsx          # Mover de ribbon/components/
├── hooks/
│   └── useRibbonButtonStyles.ts  # NOVO
├── utils/
│   └── ribbonUtils.ts
└── index.ts                      # Barrel export
```

---

## ✨ Benefícios Esperados

1. **Consistência Visual:** Todos os elementos seguem o mesmo padrão
2. **DRY (Don't Repeat Yourself):** Menos código duplicado
3. **Manutenibilidade:** Mudanças em um único lugar afetam toda a UI
4. **Testabilidade:** Componentes isolados são mais fáceis de testar
5. **Performance:** Menos re-renders com componentes otimizados
6. **Developer Experience:** API clara e documentada para novos controles
