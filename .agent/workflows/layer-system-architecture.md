---
description: Arquitetura do Sistema de Camadas, Traço e Preenchimento (Estilo AutoCAD + Figma)
---

# Arquitetura do Sistema de Camadas - EndeavourCanvas

## 1. Visão Geral

O sistema de camadas do EndeavourCanvas é inspirado no AutoCAD (conceito "ByLayer") e Figma (UX moderna). Permite que elementos herdem propriedades visuais da camada ou tenham valores personalizados.

### 1.1 Regra Fundamental

> **Todo elemento DEVE estar associado a uma camada.**
>
> - A associação de camada (`layerId`) é obrigatória
> - As cores podem ser herdadas (`layer`) ou customizadas (`custom`)
> - Visibilidade e bloqueio sempre respeitam a camada do elemento

## 2. Modelo de Dados

### 2.1 Interface Layer

```typescript
interface Layer {
  id: string;
  name: string;
  strokeColor: string; // Cor do traço padrão
  strokeEnabled: boolean; // Traço ativado na camada
  fillColor: string; // Cor do preenchimento padrão
  fillEnabled: boolean; // Preenchimento ativado na camada
  visible: boolean; // Visibilidade da camada
  locked: boolean; // Bloqueio da camada
  isNative?: boolean; // Camada nativa (não pode ser deletada)
}
```

### 2.2 Interface Shape (Propriedades Relevantes)

```typescript
interface Shape {
  id: string;
  layerId: string; // OBRIGATÓRIO: Camada à qual pertence

  // Propriedades visuais locais
  strokeColor: string;
  strokeEnabled?: boolean; // Default: true
  strokeWidth?: number;
  strokeOpacity?: number;

  fillColor: string;
  fillEnabled?: boolean; // Default: true
  fillOpacity?: number;

  // Modo de herança de cores
  colorMode?: ShapeColorMode;
}

interface ShapeColorMode {
  fill: "layer" | "custom";
  stroke: "layer" | "custom";
}
```

## 3. Hierarquia de Herança

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAMADA (Layer)                            │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ strokeColor     │  │ fillColor       │                       │
│  │ strokeEnabled   │  │ fillEnabled     │                       │
│  └────────┬────────┘  └────────┬────────┘                       │
└───────────┼───────────────────┼─────────────────────────────────┘
            │ herda (se mode='layer')    │ herda (se mode='layer')
            ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ELEMENTO (Shape)                          │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ strokeColor     │  │ fillColor       │                       │
│  │ strokeEnabled   │  │ fillEnabled     │                       │
│  │ colorMode.stroke│  │ colorMode.fill  │                       │
│  │ 'layer'|'custom'│  │ 'layer'|'custom'│                       │
│  └─────────────────┘  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Funções de Resolução (utils/shapeColors.ts)

### 4.1 Resolução de Cores

```typescript
// Cor efetiva de traço
export const getEffectiveStrokeColor = (
  shape: Shape,
  layer?: Layer | null
): string => {
  if (getShapeColorMode(shape).stroke === "layer" && layer) {
    return layer.strokeColor;
  }
  return shape.strokeColor;
};

// Cor efetiva de preenchimento
export const getEffectiveFillColor = (
  shape: Shape,
  layer?: Layer | null
): string => {
  if (getShapeColorMode(shape).fill === "layer" && layer) {
    return layer.fillColor;
  }
  return shape.fillColor;
};
```

### 4.2 Resolução de Estado Enabled

```typescript
// Traço efetivamente ativado
export const isStrokeEffectivelyEnabled = (
  shape: Shape,
  layer?: Layer | null
): boolean => {
  if (getShapeColorMode(shape).stroke === "layer" && layer) {
    return layer.strokeEnabled !== false;
  }
  return shape.strokeEnabled !== false;
};

// Preenchimento efetivamente ativado
export const isFillEffectivelyEnabled = (
  shape: Shape,
  layer?: Layer | null
): boolean => {
  if (getShapeColorMode(shape).fill === "layer" && layer) {
    return layer.fillEnabled !== false;
  }
  return shape.fillEnabled !== false;
};
```

### 4.3 Resolução Completa

```typescript
interface EffectiveProperties {
  strokeColor: string;
  strokeEnabled: boolean;
  fillColor: string;
  fillEnabled: boolean;
  strokeWidth: number;
}

export const getEffectiveProperties = (
  shape: Shape,
  layer?: Layer | null
): EffectiveProperties => ({
  strokeColor: getEffectiveStrokeColor(shape, layer),
  strokeEnabled: isStrokeEffectivelyEnabled(shape, layer),
  fillColor: getEffectiveFillColor(shape, layer),
  fillEnabled: isFillEffectivelyEnabled(shape, layer),
  strokeWidth: shape.strokeWidth ?? 1,
});
```

## 5. Comportamentos de UI

### 5.1 Toggle de Ativação (Stroke/Fill)

| Modo       | Comportamento do Toggle                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `'layer'`  | Toggle altera `layer.strokeEnabled` ou `layer.fillEnabled` (afeta todos herdantes) |
| `'custom'` | Toggle altera `shape.strokeEnabled` ou `shape.fillEnabled` (apenas o elemento)     |

### 5.2 Mudança de Cor

- Alterar cor sempre muda `colorMode` para `'custom'`
- Botão "Aplicar Camada" reseta `colorMode` para `'layer'`

### 5.3 Botão "Aplicar Camada" (Ribbon)

Ativado quando:

1. Shape tem `colorMode.fill === 'custom'` OU `colorMode.stroke === 'custom'`
2. **OU** `shape.layerId !== activeLayer.id` (camada diferente)

Ao clicar:

- Define `colorMode: { fill: 'layer', stroke: 'layer' }`
- Se camada diferente, também atualiza `layerId`

### 5.4 Indicadores Visuais

| Elemento  | Indicador                                                 |
| --------- | --------------------------------------------------------- |
| Badge 🔗  | Aparece quando cor está herdando da camada                |
| Opacidade | Seção fica `opacity-60` quando stroke/fill desativado     |
| Swatch    | Fica `opacity-40` quando stroke/fill da camada desativado |

## 6. Componentes de UI

### 6.1 StyleProperties (Sidebar)

Seções em ordem:

1. **CAMADA** - Mostra a camada do elemento + mensagem sobre visibilidade/bloqueio
2. **PREENCHIMENTO** - Toggle Camada/Elemento + cor + opacidade
3. **TRAÇO** - Toggle Camada/Elemento + cor + opacidade + espessura

### 6.2 LayerManagerModal

Colunas:

- Status (check ou preview de cor)
- Nome (editável ao clicar)
- Visível (olho)
- Bloq. (cadeado)
- Traço (toggle Pen + swatch)
- Fundo (toggle PaintBucket + swatch)
- Ação (lixeira)

### 6.3 EditorRibbon - LayerControl

- Dropdown de seleção de camada ativa
- Toggles de visibilidade e bloqueio
- Botão "Aplicar Camada" (Palette)
- Botão "Gerenciador de Camadas"

## 7. Renderização (ShapeRenderer.ts)

```typescript
// Determina se deve renderizar stroke
const shouldRenderStroke = isStrokeEffectivelyEnabled(shape, layer);

// Determina se deve renderizar fill
const shouldRenderFill = isFillEffectivelyEnabled(shape, layer);

// Cores efetivas
const strokeColor = getEffectiveStrokeColor(shape, layer);
const fillColor = getEffectiveFillColor(shape, layer);
```

## 8. Camada Padrão

A camada "Desenho" é nativa e não pode ser deletada:

```typescript
{
  id: 'default-layer',
  name: 'Desenho',
  strokeColor: '#000000',
  strokeEnabled: true,
  fillColor: '#ffffff',
  fillEnabled: true,
  visible: true,
  locked: false,
  isNative: true
}
```

## 9. Testes (tests/shapeColors.test.ts)

Casos cobertos:

- Herança de cor da camada
- Override de cor customizada
- Herança de strokeEnabled/fillEnabled
- Override de enabled customizado
- Troca entre modos 'layer' e 'custom'

## 10. Arquivos Principais

| Arquivo                                     | Responsabilidade                        |
| ------------------------------------------- | --------------------------------------- |
| `types/index.ts`                            | Interfaces Layer, Shape, ShapeColorMode |
| `stores/useDataStore.ts`                    | Estado das camadas e shapes             |
| `utils/shapeColors.ts`                      | Funções de resolução                    |
| `components/properties/StyleProperties.tsx` | UI de propriedades na sidebar           |
| `components/EditorRibbon.tsx`               | Controles de camada no ribbon           |
| `components/LayerManagerModal.tsx`          | Modal de gerenciamento                  |
| `renderers/ShapeRenderer.ts`                | Renderização no canvas                  |

## 11. Status da Implementação

✅ = Implementado | ⏳ = Pendente

- [x] Modelo de dados com strokeEnabled/fillEnabled na Layer
- [x] Funções de resolução efetiva
- [x] Toggles unificados entre Sidebar e Ribbon
- [x] Indicadores visuais de herança
- [x] Seção "Camada" na sidebar mostrando associação
- [x] Toggles no LayerManagerModal
- [x] Botão "Aplicar Camada" com mudança de layerId
- [x] Testes unitários
- [ ] Botão "Auto-atribuir novos à camada ativa" (opcional)
