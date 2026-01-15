# AutoCAD-Style Command Input — Analysis & Implementation Plan

## Table of Contents
1. [Current State Findings](#1-current-state-findings)
2. [Proposed UX Specification](#2-proposed-ux-specification)
3. [Architecture & Data Flow](#3-architecture--data-flow)
4. [Incremental Implementation Plan](#4-incremental-implementation-plan)
5. [Test Strategy](#5-test-strategy)

---

## 1. Current State Findings

### 1.1 Footer / Snap UI Structure

**Location:** `frontend/features/editor/components/EditorStatusBar.tsx`

The footer is a React functional component using **Tailwind CSS** for styling. Key characteristics:

```
Layout Structure (left → right):
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Tool Icon + X/Y coords]     [SNAP toggle + menu]     [Undo/Redo + Zoom]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Snap Button Details:**
- Location: Center section of the status bar (line 85-150)
- Structure: Toggle button + dropdown menu in a flex container
- Styling: `bg-surface1 rounded border border-border`
- Toggle state: Uses `snapSettings.enabled` from `useSettingsStore`

**Parent Container:** `NextSurface.tsx` → `NextCanvasArea` renders:
```tsx
<div className="absolute bottom-0 left-0 right-0 z-50">
  <EditorStatusBar />
</div>
```

**Insertion Point:** Command input should be placed:
- In the center `<div className="flex items-center gap-4">` (line 84)
- Immediately before the Snap button's `<div className="relative">` (line 85)

---

### 1.2 Global Keyboard Handling

**Three Parallel Systems:**

| System | File | Purpose |
|--------|------|---------|
| `useKeyboardShortcuts` | `frontend/features/editor/hooks/useKeyboardShortcuts.ts` | Tool selection, undo/redo, pan mode |
| `useInteractionManager` | `frontend/features/editor/interactions/useInteractionManager.ts` | Delegates to active handler |
| `EditorRibbon` | `frontend/features/editor/components/EditorRibbon.tsx` | Number key tab switching |

**Keybindings Registry:** `frontend/config/keybindings.ts`
- Defines `KEYBINDINGS` object with tool/action mappings
- Format: `{ id, label, keys: ['v'], description, category }`
- Helper: `getShortcutLabel(id)` for UI display

**Critical Filtering Logic** (in `useKeyboardShortcuts.ts:16-23`):
```typescript
// Skip if text editing is active
if (useUIStore.getState().engineTextEditState.active) return;

// Skip if user is typing in an input/textarea
const target = e.target as HTMLElement;
if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
```

This existing pattern is the foundation for command input integration.

---

### 1.3 Canvas Active State & Text Editing

**Canvas Focus Tracking:**
- `useUIStore.isMouseOverCanvas` — boolean, set via pointer events
- `useUIStore.engineInteractionActive` — boolean, active during tool operations
- `useUIStore.interactionDragActive` — boolean, active during drag operations

**Text Editing State:** `useUIStore.engineTextEditState`
```typescript
engineTextEditState: {
  active: boolean;              // Is any text currently being edited?
  textId: number | null;        // Which text entity
  editGeneration: number;       // Cache invalidation counter
  caretPosition: { ... } | null;
}
```

**Text Input Mechanism:**
- `TextInputProxy.tsx` — Hidden `<textarea>` for keyboard capture
- `TextHandler.tsx` — Interaction handler that manages focus
- Focus is explicitly set via `requestAnimationFrame(() => inputRef.focus())`

**Focus Detection Pattern:**
```typescript
// TextInputProxy.tsx
isFocused: () => document.activeElement === inputRef.current
```

---

### 1.4 Action Execution Pipeline

**Command Dispatcher:** `frontend/features/editor/commands/useEditorCommands.ts`

```typescript
export const useEditorCommands = () => {
  const executeAction = useCallback((actionId: ActionId, status: ItemStatus) => {
    switch (actionId) {
      case 'undo': runtime.undo();
      case 'redo': runtime.redo();
      case 'delete': deleteSelected();
      case 'zoom-in': setViewTransform(...);
      // ...
    }
  }, [...]);

  const selectTool = useCallback((toolId: ToolId, status: ItemStatus) => {
    setTool(toolId as ToolType);
  }, [setTool]);

  return { executeAction, selectTool };
};
```

**Action IDs (existing):**
```typescript
type ActionId = 'new-file' | 'open-file' | 'save-file' | 'undo' | 'redo' |
                'delete' | 'open-settings' | 'zoom-in' | 'zoom-out' |
                'zoom-to-fit' | 'export-json' | 'export-project' | 'grid';
```

**Tool IDs (from types):**
```typescript
type ToolType = 'select' | 'pan' | 'line' | 'polyline' | 'rect' |
                'circle' | 'polygon' | 'measure' | 'text' | 'arrow';
```

---

## 2. Proposed UX Specification

### 2.1 Auto-Focus / Typing Capture Rules

**Decision Tree:**
```
User presses printable key
    │
    ├─ Is modifier key held? (Ctrl/Cmd/Alt + key)
    │   └─ YES → Pass to existing shortcuts (do NOT capture)
    │
    ├─ Is engineTextEditState.active === true?
    │   └─ YES → Pass to TextInputProxy (do NOT capture)
    │
    ├─ Is document.activeElement an INPUT/TEXTAREA/[contenteditable]?
    │   └─ YES → Let native input handle it (do NOT capture)
    │
    ├─ Is isMouseOverCanvas === true OR command input has focus?
    │   └─ YES → Route to Command Input (CAPTURE)
    │
    └─ OTHERWISE → Ignore (do NOT capture)
```

**Implementation Hook:** Create `useCommandInputCapture` that:
1. Listens to `keydown` on `window` (before other handlers)
2. Checks capture conditions
3. If capturing: `e.preventDefault()`, route character to command buffer
4. If not: let event propagate normally

### 2.2 Key Behavior Specifications

| Key | Behavior | Edge Cases |
|-----|----------|------------|
| **Printable chars** | Append to command buffer | Non-Latin (IME): wait for composition end |
| **Enter** | Execute command if non-empty; no-op if empty | During IME composition: insert composed text, don't execute |
| **Escape** | Clear command buffer AND blur command input | If in modal tool (drafting): also cancel via existing handler |
| **Backspace** | Delete last character from buffer | If buffer empty: no-op (prevent browser back navigation) |
| **Tab** | Autocomplete to first suggestion; cycle if pressed again | If no suggestions: no-op |
| **Arrow Up** | Navigate to previous command in history | Wrap to end if at beginning |
| **Arrow Down** | Navigate to next command in history | Clear buffer if past end |
| **Ctrl/Cmd+V** | Paste into command buffer | Strip newlines, limit length |
| **Ctrl/Cmd+Z** | Pass through to existing undo handler | Do NOT capture |

### 2.3 Visual & Usability Features

**Minimum Viable:**
1. **Input Field:**
   - Placeholder: `"Command..."`
   - Fixed width: `w-48` (192px) — enough for typical commands
   - Monospace font for command consistency
   - Border highlight when active/capturing: `border-primary`

2. **Active Indicator:**
   - Subtle glow or border change when command input is capturing
   - Tooltip: "Type to enter commands (canvas must be active)"

3. **History Navigation:**
   - Store last 50 commands in localStorage
   - Up/Down arrows cycle through history
   - Current buffer saved when navigating (can return with Down)

4. **Error Feedback:**
   - Unknown command: Show inline error message for 2 seconds
   - Format: Red text below input: `"Unknown command: XYZ"`

**Future Enhancements (not MVP):**
- Autocomplete dropdown with command suggestions
- Command palette modal (Ctrl+P style)
- Multi-step command prompts (e.g., "ROTATE → Enter angle:")

### 2.4 Command Format Specification

**Syntax:**
```
COMMAND [ARG1] [ARG2] ...
```

**Examples:**
| Input | Parsed | Action |
|-------|--------|--------|
| `L` | `{ command: 'LINE', args: [] }` | Switch to line tool |
| `LINE` | `{ command: 'LINE', args: [] }` | Switch to line tool |
| `R` | `{ command: 'RECT', args: [] }` | Switch to rectangle tool |
| `SNAP` | `{ command: 'SNAP', args: [] }` | Toggle snap |
| `SNAP ON` | `{ command: 'SNAP', args: ['ON'] }` | Enable snap |
| `SNAP OFF` | `{ command: 'SNAP', args: ['OFF'] }` | Disable snap |
| `ZOOM 150` | `{ command: 'ZOOM', args: ['150'] }` | Set zoom to 150% |
| `U` | `{ command: 'UNDO', args: [] }` | Undo |
| `REDO` | `{ command: 'REDO', args: [] }` | Redo |

**Parsing Rules:**
1. Case-insensitive (normalize to uppercase internally)
2. Whitespace-separated arguments
3. Quoted strings for arguments with spaces: `TEXT "Hello World"`
4. Numbers parsed as numeric arguments

---

## 3. Architecture & Data Flow

### 3.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Keyboard Event                                  │
│                                    │                                         │
│                                    ▼                                         │
│         ┌──────────────────────────────────────────────────────┐            │
│         │            useCommandInputCapture (NEW)               │            │
│         │  ┌─────────────────────────────────────────────────┐ │            │
│         │  │ Should Capture?                                  │ │            │
│         │  │ • No modifier keys                               │ │            │
│         │  │ • No text editing active                         │ │            │
│         │  │ • No INPUT/TEXTAREA focused                      │ │            │
│         │  │ • Canvas active OR command input focused         │ │            │
│         │  └─────────────────────────────────────────────────┘ │            │
│         │                         │                             │            │
│         │         ┌───────────────┴───────────────┐            │            │
│         │         │                               │            │            │
│         │     [CAPTURE]                    [PASS THROUGH]      │            │
│         │         │                               │            │            │
│         │         ▼                               ▼            │            │
│         │  useCommandStore              Existing Handlers      │            │
│         │  (buffer, history)            (shortcuts, tools)     │            │
│         └──────────────────────────────────────────────────────┘            │
│                   │                                                          │
│                   ▼                                                          │
│         ┌─────────────────────┐                                             │
│         │  CommandInput UI    │ ← Status bar component                       │
│         │  (displays buffer)  │                                             │
│         └─────────────────────┘                                             │
│                   │                                                          │
│                   │ [Enter pressed]                                          │
│                   ▼                                                          │
│         ┌─────────────────────┐                                             │
│         │  CommandRegistry    │ ← Lookup command by name/alias               │
│         └─────────────────────┘                                             │
│                   │                                                          │
│                   ▼                                                          │
│         ┌─────────────────────┐                                             │
│         │  CommandParser      │ ← Parse args, validate                       │
│         └─────────────────────┘                                             │
│                   │                                                          │
│                   ▼                                                          │
│         ┌─────────────────────┐                                             │
│         │  CommandExecutor    │ ← Execute via useEditorCommands              │
│         └─────────────────────┘                                             │
│                   │                                                          │
│                   ├──────────────► executeAction()                           │
│                   └──────────────► selectTool()                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Command Registry Design

**File:** `frontend/features/editor/commands/commandRegistry.ts`

```typescript
export interface CommandDefinition {
  id: string;                          // Unique identifier
  name: string;                        // Display name
  aliases: string[];                   // Short forms (e.g., ['L', 'LI'])
  description: string;                 // Help text
  category: 'tools' | 'edit' | 'view' | 'settings';
  args?: ArgSchema[];                  // Optional argument definitions
  requiresSelection?: boolean;         // Only available when entities selected
  execute: (args: ParsedArgs, context: CommandContext) => void;
}

export interface ArgSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  options?: string[];                  // For enum type
  default?: unknown;
}

export interface CommandContext {
  executeAction: (id: ActionId) => void;
  selectTool: (id: ToolId) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setViewTransform: (fn: (prev: ViewTransform) => ViewTransform) => void;
  // ... other action accessors
}

// Registry implementation
class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map();  // alias → command id

  register(command: CommandDefinition): void { ... }
  resolve(input: string): CommandDefinition | null { ... }
  getAll(): CommandDefinition[] { ... }
  getSuggestions(partial: string): CommandDefinition[] { ... }
}

export const commandRegistry = new CommandRegistry();
```

### 3.3 Command Store Design

**File:** `frontend/stores/useCommandStore.ts`

```typescript
interface CommandState {
  // Input state
  buffer: string;                      // Current input text
  isActive: boolean;                   // Is command input capturing?

  // History state
  history: string[];                   // Past executed commands
  historyIndex: number;                // -1 = not navigating
  savedBuffer: string;                 // Buffer saved when navigating

  // Feedback state
  error: string | null;                // Error message to display
  errorTimeout: number | null;         // Timeout ID for clearing error

  // Actions
  setBuffer: (text: string) => void;
  appendChar: (char: string) => void;
  deleteChar: () => void;
  clearBuffer: () => void;
  setActive: (active: boolean) => void;

  navigateHistory: (direction: 'up' | 'down') => void;
  addToHistory: (command: string) => void;

  setError: (message: string) => void;
  clearError: () => void;
}

export const useCommandStore = create<CommandState>((set, get) => ({ ... }));
```

### 3.4 Parser Design

**File:** `frontend/features/editor/commands/commandParser.ts`

```typescript
export interface ParseResult {
  success: true;
  command: string;           // Normalized command name
  args: string[];            // Raw argument strings
}

export interface ParseError {
  success: false;
  error: string;
  position?: number;         // Character position of error
}

export function parseCommand(input: string): ParseResult | ParseError {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: false, error: 'Empty command' };
  }

  // Tokenize: split on whitespace, handle quoted strings
  const tokens = tokenize(trimmed);
  const command = tokens[0].toUpperCase();
  const args = tokens.slice(1);

  return { success: true, command, args };
}

function tokenize(input: string): string[] {
  // Handle quoted strings: "foo bar" → single token
  // Handle escaped quotes: \"
  // Split on whitespace otherwise
}
```

### 3.5 Initial Command Set

| Command | Aliases | Args | Action |
|---------|---------|------|--------|
| `SELECT` | `V`, `SEL` | - | `selectTool('select')` |
| `LINE` | `L`, `LI` | - | `selectTool('line')` |
| `POLYLINE` | `PL`, `PLINE` | - | `selectTool('polyline')` |
| `RECTANGLE` | `R`, `REC`, `RECT` | - | `selectTool('rect')` |
| `CIRCLE` | `C`, `CI` | - | `selectTool('circle')` |
| `POLYGON` | `G`, `POL` | - | `selectTool('polygon')` |
| `TEXT` | `T`, `TX` | - | `selectTool('text')` |
| `MEASURE` | `M`, `DI` | - | `selectTool('measure')` |
| `PAN` | `H` | - | `selectTool('pan')` |
| `UNDO` | `U` | - | `executeAction('undo')` |
| `REDO` | `RE` | - | `executeAction('redo')` |
| `DELETE` | `DEL`, `E` | - | `executeAction('delete')` |
| `SNAP` | `SN` | `ON\|OFF` | Toggle or set snap |
| `GRID` | `GR` | `ON\|OFF` | Toggle or set grid |
| `ZOOM` | `Z` | `number\|FIT\|IN\|OUT` | Zoom control |
| `SAVE` | `SA` | - | `executeAction('save-file')` |
| `OPEN` | `OP` | - | `executeAction('open-file')` |
| `SETTINGS` | `SET`, `OPTIONS` | - | `executeAction('open-settings')` |

---

## 4. Incremental Implementation Plan

### Phase 1: Foundation (1 PR)

**Goal:** Command store, registry, and parser without UI.

**Files to Create:**
1. `frontend/stores/useCommandStore.ts` — Zustand store for command state
2. `frontend/features/editor/commands/commandRegistry.ts` — Registry class
3. `frontend/features/editor/commands/commandParser.ts` — Parser function
4. `frontend/features/editor/commands/commands/index.ts` — Command definitions

**Validation:**
- Unit tests pass for parser (empty, simple, with args, quoted)
- Unit tests pass for registry (lookup by name, alias, case-insensitive)
- Commands can be executed programmatically

**Risks:**
- Low risk — isolated module with no UI dependencies

---

### Phase 2: UI Component (1 PR)

**Goal:** Visible command input in status bar, without keyboard capture.

**Files to Modify:**
1. `frontend/features/editor/components/EditorStatusBar.tsx` — Add CommandInput
2. `frontend/i18n/labels.ts` — Add placeholder text

**Files to Create:**
1. `frontend/features/editor/components/CommandInput.tsx` — Input component

**Component Structure:**
```tsx
const CommandInput: React.FC = () => {
  const { buffer, setBuffer, isActive, error } = useCommandStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    // Parse and execute
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Command..."
        className={cn(
          "w-48 h-6 px-2 text-xs font-mono",
          "bg-surface1 border rounded",
          isActive ? "border-primary" : "border-border"
        )}
      />
      {error && (
        <div className="absolute top-full mt-1 text-xs text-red-500">
          {error}
        </div>
      )}
    </div>
  );
};
```

**Validation:**
- Component renders in status bar
- Manual typing works
- Enter executes (or shows error)
- Escape clears

**Risks:**
- Medium risk — layout integration may need adjustment
- Snap menu absolute positioning may conflict

---

### Phase 3: Keyboard Capture (1 PR)

**Goal:** Auto-route typing to command input when canvas is active.

**Files to Create:**
1. `frontend/features/editor/hooks/useCommandInputCapture.ts` — Capture hook

**Files to Modify:**
1. `frontend/features/editor/components/NextSurface.tsx` — Use capture hook
2. `frontend/features/editor/hooks/useKeyboardShortcuts.ts` — Coordinate with capture

**Key Logic:**
```typescript
export const useCommandInputCapture = (inputRef: RefObject<HTMLInputElement>) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if modifier held (except Shift for uppercase)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Ignore if text editing active
      if (useUIStore.getState().engineTextEditState.active) return;

      // Ignore if in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (target.isContentEditable) return;

      // Ignore non-printable keys (handled separately)
      if (e.key.length !== 1 && !['Backspace', 'Enter', 'Escape'].includes(e.key)) return;

      // Check if canvas is active
      const { isMouseOverCanvas } = useUIStore.getState();
      if (!isMouseOverCanvas) return;

      // Capture!
      e.preventDefault();
      e.stopPropagation();

      if (e.key.length === 1) {
        useCommandStore.getState().appendChar(e.key);
      } else if (e.key === 'Backspace') {
        useCommandStore.getState().deleteChar();
      } else if (e.key === 'Enter') {
        executeCurrentCommand();
      } else if (e.key === 'Escape') {
        useCommandStore.getState().clearBuffer();
      }

      // Focus the input for visual feedback
      inputRef.current?.focus();
    };

    // Register BEFORE other handlers (capture phase)
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [inputRef]);
};
```

**Validation:**
- Typing with mouse over canvas goes to command input
- Typing with focus in another input stays in that input
- Existing shortcuts (Ctrl+Z, tool keys when not capturing) still work
- Text editing in canvas still works

**Risks:**
- High risk — keyboard capture is complex and can break existing behavior
- Need thorough testing of all interaction modes

---

### Phase 4: History & Polish (1 PR)

**Goal:** Command history, autocomplete hints, persistence.

**Files to Modify:**
1. `frontend/stores/useCommandStore.ts` — Add history logic
2. `frontend/features/editor/components/CommandInput.tsx` — History navigation

**Features:**
1. Arrow up/down navigates history
2. History persisted to localStorage (last 50 commands)
3. Tab completes partial command
4. Visual indicator when capturing is active

**Validation:**
- Up/Down cycles through history
- History survives page reload
- Tab completion works
- Clear visual feedback

**Risks:**
- Low risk — incremental improvements

---

### Phase 5: IME Support (1 PR)

**Goal:** Proper handling of non-Latin input (CJK, etc.).

**Files to Modify:**
1. `frontend/features/editor/hooks/useCommandInputCapture.ts` — IME handling
2. `frontend/features/editor/components/CommandInput.tsx` — Composition events

**Key Considerations:**
- During `compositionstart` → `compositionend`, do not execute on Enter
- Let composition complete before processing
- Handle composition update for preview

**Validation:**
- Chinese/Japanese/Korean input methods work correctly
- No double-insertion of composed characters
- Enter only executes after composition ends

**Risks:**
- Medium risk — IME behavior varies across browsers/platforms

---

## 5. Test Strategy

### 5.1 Unit Tests

**Parser Tests** (`commandParser.test.ts`):
```typescript
describe('parseCommand', () => {
  it('parses simple command', () => {
    expect(parseCommand('LINE')).toEqual({ success: true, command: 'LINE', args: [] });
  });

  it('is case-insensitive', () => {
    expect(parseCommand('line')).toEqual({ success: true, command: 'LINE', args: [] });
  });

  it('parses command with args', () => {
    expect(parseCommand('ZOOM 150')).toEqual({ success: true, command: 'ZOOM', args: ['150'] });
  });

  it('handles quoted strings', () => {
    expect(parseCommand('TEXT "Hello World"')).toEqual({
      success: true, command: 'TEXT', args: ['Hello World']
    });
  });

  it('returns error for empty input', () => {
    expect(parseCommand('')).toEqual({ success: false, error: 'Empty command' });
  });
});
```

**Registry Tests** (`commandRegistry.test.ts`):
```typescript
describe('CommandRegistry', () => {
  it('resolves by name', () => {
    expect(registry.resolve('LINE')?.id).toBe('tool.line');
  });

  it('resolves by alias', () => {
    expect(registry.resolve('L')?.id).toBe('tool.line');
  });

  it('returns null for unknown command', () => {
    expect(registry.resolve('FOOBAR')).toBeNull();
  });

  it('returns suggestions for partial match', () => {
    const suggestions = registry.getSuggestions('LI');
    expect(suggestions.map(s => s.id)).toContain('tool.line');
  });
});
```

### 5.2 Integration Tests

**Keyboard Capture Tests** (`useCommandInputCapture.test.tsx`):
```typescript
describe('useCommandInputCapture', () => {
  it('captures typing when canvas is active', () => {
    // Set isMouseOverCanvas: true
    // Fire keydown 'L'
    // Assert commandStore.buffer === 'L'
  });

  it('does not capture when text editing active', () => {
    // Set engineTextEditState.active: true
    // Fire keydown 'L'
    // Assert commandStore.buffer === ''
  });

  it('does not capture when in input element', () => {
    // Focus an <input>
    // Fire keydown 'L'
    // Assert event not prevented
  });

  it('passes through modifier shortcuts', () => {
    // Fire keydown 'Z' with ctrlKey: true
    // Assert commandStore.buffer === ''
    // Assert undo was called
  });

  it('handles Escape to clear buffer', () => {
    // Set buffer to 'LINE'
    // Fire keydown 'Escape'
    // Assert buffer === ''
  });

  it('handles Enter to execute', () => {
    // Set buffer to 'LINE'
    // Fire keydown 'Enter'
    // Assert selectTool('line') called
    // Assert buffer cleared
  });

  it('handles Backspace correctly', () => {
    // Set buffer to 'LINE'
    // Fire keydown 'Backspace'
    // Assert buffer === 'LIN'
  });
});
```

### 5.3 Regression Tests

**Existing Shortcut Tests:**
```typescript
describe('existing shortcuts', () => {
  it('V key still switches to select tool', () => {
    // With canvas active but empty command buffer
    // Fire keydown 'V'
    // Assert tool switched to 'select'
  });

  it('Ctrl+Z still triggers undo', () => {
    // Fire keydown 'Z' with ctrlKey: true
    // Assert undo was called
  });

  it('Space key still triggers pan mode', () => {
    // Fire keydown 'Space'
    // Assert tool switched to 'pan'
  });

  it('Delete key still deletes selection', () => {
    // Select entities
    // Fire keydown 'Delete'
    // Assert deleteSelected called
  });
});
```

### 5.4 E2E Tests (if using Playwright/Cypress)

```typescript
describe('Command Input E2E', () => {
  beforeEach(() => {
    cy.visit('/editor');
  });

  it('typing L switches to line tool', () => {
    cy.get('[data-testid="canvas"]').trigger('mouseover');
    cy.get('body').type('L{enter}');
    cy.get('[data-testid="active-tool"]').should('have.text', 'Linha');
  });

  it('typing SNAP toggles snapping', () => {
    cy.get('[data-testid="canvas"]').trigger('mouseover');
    cy.get('body').type('SNAP{enter}');
    // Assert snap state toggled
  });

  it('does not interfere with text editing', () => {
    // Click to create text
    cy.get('[data-testid="canvas"]').click(200, 200);
    cy.get('[data-testid="canvas"]').dblclick(200, 200);
    // Type text content
    cy.get('body').type('Hello');
    // Assert text was created, not command executed
  });

  it('command history navigation works', () => {
    cy.get('[data-testid="canvas"]').trigger('mouseover');
    cy.get('body').type('LINE{enter}');
    cy.get('body').type('RECT{enter}');
    cy.get('[data-testid="command-input"]').focus();
    cy.get('body').type('{uparrow}');
    cy.get('[data-testid="command-input"]').should('have.value', 'RECT');
    cy.get('body').type('{uparrow}');
    cy.get('[data-testid="command-input"]').should('have.value', 'LINE');
  });
});
```

---

## Summary

This implementation plan provides a complete blueprint for adding AutoCAD-style command input to the editor. Key decisions:

1. **Minimal coupling:** Command system is separate from UI — new commands can be added without touching the status bar.

2. **Safe keyboard capture:** Uses capture phase event listener with strict conditions to avoid interfering with existing functionality.

3. **Incremental delivery:** Five phases that can each be validated independently.

4. **Comprehensive testing:** Unit, integration, and E2E test coverage for all critical paths.

The highest-risk area is Phase 3 (keyboard capture), which requires careful coordination with existing shortcut handlers. Recommend thorough manual testing of all interaction modes (text editing, tool switching, modals) after that phase.
