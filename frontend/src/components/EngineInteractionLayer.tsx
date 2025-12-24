import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElectricalElement, Patch, Point, Shape } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
// NOTE: The WASM text engine expects raw TTF/OTF bytes (FreeType).
// We load fonts from `/public/fonts` to avoid dev-server issues with `/node_modules/...` URLs
// and to keep the font format compatible.
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { screenToWorld, getDistance, getShapeBoundingBox, getShapeCenter, getShapeHandles, isPointInShape, isShapeInSelection, rotatePoint, getRectCornersWorld, supportsBBoxResize, worldToScreen } from '@/utils/geometry';
import { calculateZoomTransform } from '@/utils/zoomHelper';
import SelectionOverlay from './SelectionOverlay';
import { CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX, HIT_TOLERANCE } from '@/config/constants';
import { generateId } from '@/utils/uuid';
import { getDefaultColorMode } from '@/utils/shapeColors';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { getConnectionPoint } from '@/features/editor/snapEngine/detectors';
import { resolveConnectionNodePosition } from '@/utils/connections';
import { getDefaultMetadataForSymbol, getElectricalLayerConfig } from '@/features/library/electricalProperties';
import { isConduitShape } from '@/features/editor/utils/tools';
import { isShapeInteractable } from '@/utils/visibility';
import { getEngineRuntime } from '@/engine/runtime/singleton';
import { GpuPicker } from '@/engine/picking/gpuPicker';
import { getSymbolAlphaAtUv, primeSymbolAlphaMask } from '@/features/library/symbolAlphaMaskCache';
import { isSymbolInstanceHitAtWorldPoint } from '@/features/library/symbolPicking';
// Engine-native text tool integration
import { TextTool, createTextTool, type TextToolState, type TextToolCallbacks } from '@/features/editor/tools/TextTool';
import { TextInputProxy, type TextInputProxyRef } from '@/components/TextInputProxy';
import { TextCaretOverlay, useTextCaret } from '@/components/TextCaretOverlay';
import type { TextInputDelta } from '@/types/text';
import { TextAlign, TextStyleFlags, TextBoxMode, packColorRGBA } from '@/types/text';
import { registerTextTool, registerTextMapping, getTextIdForShape, getShapeIdForText, getTextMappings, unregisterTextMappingByShapeId, setTextMeta, getTextMeta } from '@/engine/runtime/textEngineSync';

type Draft =
  | { kind: 'none' }
  | { kind: 'line'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'rect'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'ellipse'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'polygon'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'polyline'; points: { x: number; y: number }[]; current: { x: number; y: number } | null }
  | { kind: 'arrow'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'conduit'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'text'; start: { x: number; y: number }; current: { x: number; y: number } };

type TextBoxMeta = {
  boxMode: TextBoxMode;
  constraintWidth: number;
  fixedHeight?: number;
  maxAutoWidth: number;
};

type SelectionBox = {
  start: { x: number; y: number };
  current: { x: number; y: number };
  direction: 'LTR' | 'RTL';
};

const toWorldPoint = (
  evt: React.PointerEvent<HTMLDivElement>,
  viewTransform: ReturnType<typeof useUIStore.getState>['viewTransform'],
): { x: number; y: number } => {
  const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
  const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  return screenToWorld(screen, viewTransform);
};

const pointSegmentDistance = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const projX = a.x + t * vx;
  const projY = a.y + t * vy;
  return Math.hypot(p.x - projX, p.y - projY);
};

const pickShapeAtGeometry = (
  worldPoint: { x: number; y: number },
  toleranceWorld: number,
): string | null => {
  const data = useDataStore.getState();
  const ui = useUIStore.getState();

  const queryRect = {
    x: worldPoint.x - toleranceWorld,
    y: worldPoint.y - toleranceWorld,
    width: toleranceWorld * 2,
    height: toleranceWorld * 2,
  };

  const candidates = data.spatialIndex
    .query(queryRect)
    .map((c) => data.shapes[c.id])
    .filter(Boolean) as Shape[];

  for (const shape of candidates) {
    const layer = data.layers.find((l) => l.id === shape.layerId);
    if (layer && (!layer.visible || layer.locked)) continue;
    if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
    if (shape.svgSymbolId) {
      if (!isSymbolInstanceHitAtWorldPoint(shape, worldPoint, getSymbolAlphaAtUv, { toleranceWorld })) continue;
      return shape.id;
    }
    if (shape.type === 'rect' && shape.svgRaw) {
      void primeSymbolAlphaMask(shape.id, shape.svgRaw, 256);
      if (!isSymbolInstanceHitAtWorldPoint(shape, worldPoint, getSymbolAlphaAtUv, { toleranceWorld, symbolIdOverride: shape.id })) continue;
      return shape.id;
    }
    if (isPointInShape(worldPoint, shape, ui.viewTransform.scale || 1, layer)) return shape.id;
  }

  return null;
};

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const snapToGrid = (p: { x: number; y: number }, gridSize: number): { x: number; y: number } => {
  if (!gridSize || gridSize <= 0) return p;
  return { x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
};

const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > 2;

const getCursorForTool = (tool: ReturnType<typeof useUIStore.getState>['activeTool']): string => {
  if (tool === 'pan') return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'move' || tool === 'rotate') return 'default';
  return 'crosshair';
};

type ConduitStart = { nodeId: string; point: { x: number; y: number } };
type MoveState = { start: { x: number; y: number }; snapshot: Map<string, Shape> };

type ResizeState = {
  shapeId: string;
  handleIndex: number; // 0 BL, 1 BR, 2 TR, 3 TL (matches geometry.ts corners order)
  fixedCornerIndex: number;
  fixedCornerWorld: { x: number; y: number };
  startPointerWorld: { x: number; y: number };
  snapshot: Shape;
  applyMode: 'topLeft' | 'center';
  startAspectRatio: number; // height/width at start of resize
};

type VertexDragState = {
  shapeId: string;
  vertexIndex: number;
  startPointerWorld: { x: number; y: number };
  snapshot: Shape;
};

type SelectInteraction =
  | { kind: 'none' }
  | { kind: 'marquee' }
  | { kind: 'move'; moved: boolean; state: MoveState }
  | { kind: 'resize'; moved: boolean; state: ResizeState }
  | { kind: 'vertex'; moved: boolean; state: VertexDragState };

const HANDLE_SIZE_PX = 8;
const HANDLE_HIT_RADIUS_PX = 10;

const rotateVec = (v: { x: number; y: number }, angle: number): { x: number; y: number } => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

const snapVectorTo45Deg = (from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: from.x, y: from.y };
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snappedAngle = Math.round(angle / step) * step;
  return { x: from.x + len * Math.cos(snappedAngle), y: from.y + len * Math.sin(snappedAngle) };
};

const applyResizeToShape = (
  shape: Shape,
  applyMode: ResizeState['applyMode'],
  center: { x: number; y: number },
  w: number,
  h: number,
  scaleX: number,
  scaleY: number,
): Partial<Shape> => {
  if (applyMode === 'center') {
    return { x: clampTiny(center.x), y: clampTiny(center.y), width: clampTiny(w), height: clampTiny(h), scaleX, scaleY };
  }
  return { x: clampTiny(center.x - w / 2), y: clampTiny(center.y - h / 2), width: clampTiny(w), height: clampTiny(h), scaleX, scaleY };
};

const EngineInteractionLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const activeTool = useUIStore((s) => s.activeTool);
  const activeElectricalSymbolId = useUIStore((s) => s.activeElectricalSymbolId);
  const electricalRotation = useUIStore((s) => s.electricalRotation);
  const electricalFlipX = useUIStore((s) => s.electricalFlipX);
  const electricalFlipY = useUIStore((s) => s.electricalFlipY);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const setSelectedShapeIds = useUIStore((s) => s.setSelectedShapeIds);
  const canvasSize = useUIStore((s) => s.canvasSize);

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);
  const snapOptions = useSettingsStore((s) => s.snap);
  const gridSize = useSettingsStore((s) => s.grid.size);
  const gpuPickingEnabled = useSettingsStore((s) => s.featureFlags.gpuPicking);

  const pointerDownRef = useRef<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformStartRef = useRef<{ x: number; y: number; scale: number } | null>(null);

  const [draft, setDraft] = useState<Draft>({ kind: 'none' });
  const draftRef = useRef<Draft>({ kind: 'none' });
  const [polygonSidesModal, setPolygonSidesModal] = useState<{ center: { x: number; y: number } } | null>(null);
  const [polygonSidesValue, setPolygonSidesValue] = useState<number>(3);
  const [conduitStart, setConduitStart] = useState<ConduitStart | null>(null);
  const moveRef = useRef<MoveState | null>(null);
  const selectInteractionRef = useRef<SelectInteraction>({ kind: 'none' });
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const runtimeRef = useRef<Awaited<ReturnType<typeof getEngineRuntime>> | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const gpuPickerRef = useRef<GpuPicker | null>(null);

  // Engine-native text tool state
  const textToolRef = useRef<TextTool | null>(null);
  const textInputProxyRef = useRef<TextInputProxyRef>(null);
  const { caret, selectionRects, anchor, rotation, setCaret: setCaretPosition, hideCaret, clearSelection, setSelection } = useTextCaret();
  const engineTextEditState = useUIStore((s) => s.engineTextEditState);
  const setEngineTextEditActive = useUIStore((s) => s.setEngineTextEditActive);
  const setEngineTextEditContent = useUIStore((s) => s.setEngineTextEditContent);
  const setEngineTextEditCaret = useUIStore((s) => s.setEngineTextEditCaret);
  const setEngineTextEditCaretPosition = useUIStore((s) => s.setEngineTextEditCaretPosition);
  const clearEngineTextEdit = useUIStore((s) => s.clearEngineTextEdit);
  const setEngineTextStyleSnapshot = useUIStore((s) => s.setEngineTextStyleSnapshot);
  const clearEngineTextStyleSnapshot = useUIStore((s) => s.clearEngineTextStyleSnapshot);

  // Track if we're dragging for FixedWidth text creation
  const textDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const textBoxMetaRef = useRef<Map<number, TextBoxMeta>>(new Map());

  // Note: Text ID ↔ Shape ID mapping is now managed centrally via textEngineSync module

  // Ribbon text defaults (font family/size/style)
  const ribbonTextDefaults = useSettingsStore((s) => s.toolDefaults.text);

  // Reset transient drawing state when switching tools to avoid stale outlines
  useEffect(() => {
    setDraft({ kind: 'none' });
    draftRef.current = { kind: 'none' };
    textDragStartRef.current = null;
    setSelectionBox(null);
  }, [activeTool]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const runtime = await getEngineRuntime();
      if (!disposed) {
        runtimeRef.current = runtime;
        setRuntimeReady(true);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  // Initialize TextTool when runtime is ready
  useEffect(() => {
    if (!runtimeReady) return;
    const runtime = runtimeRef.current;
    if (!runtime) return;

    // Create TextTool with callbacks
    const callbacks: TextToolCallbacks = {
      onStateChange: (state: TextToolState) => {
        // Sync state to UI store
        setEngineTextEditActive(state.mode !== 'idle', state.activeTextId);
        setEngineTextEditContent(state.content);
        setEngineTextEditCaret(state.caretIndex, state.selectionStart, state.selectionEnd);
        if (state.mode === 'idle') {
          clearEngineTextStyleSnapshot();
        }
      },
      onCaretUpdate: (x: number, y: number, height: number, rotation: number, anchorX: number, anchorY: number) => {
        setCaretPosition(x, y, height, rotation, anchorX, anchorY);
        setEngineTextEditCaretPosition({ x, y, height });
      },
      onSelectionUpdate: (rects: import('@/types/text').TextSelectionRect[]) => {
        setSelection(rects);
      },
      onStyleSnapshot: (textId, snapshot) => {
        setEngineTextStyleSnapshot(textId, snapshot);
      },
      onEditEnd: () => {
        clearEngineTextEdit();
        clearEngineTextStyleSnapshot();
        hideCaret();
        clearSelection();
        // Switch back to select tool
        useUIStore.getState().setTool('select');
      },
        onTextCreated: (textId: number, x: number, y: number, boxMode: TextBoxMode, constraintWidth: number, initialWidth: number, initialHeight: number) => {
          const data = useDataStore.getState();
          const shapeId = generateId();
  
          // Store mapping from engine text ID to JS shape ID (centralized)
          registerTextMapping(textId, shapeId);
          setTextMeta(textId, boxMode, constraintWidth);
  
          textBoxMetaRef.current.set(textId, {
            boxMode,
            constraintWidth: boxMode === TextBoxMode.FixedWidth ? constraintWidth : 0,
            fixedHeight: boxMode === TextBoxMode.FixedWidth ? initialHeight : undefined,
            maxAutoWidth: Math.max(initialWidth, constraintWidth, 0),
          });
        
        const ribbonDefaults = useSettingsStore.getState().toolDefaults.text;
        
        // In Y-Up world coordinates:
        // - Text engine anchor (x, y) is at the TOP-LEFT of the text box
        // - Shape.y should be the BOTTOM of the box for correct bounding box math
        // - So shape.y = anchor.y - height (moving down in world = decreasing Y)
        const s: Shape = {
          id: shapeId,
          layerId: data.activeLayerId,
          type: 'text',
          points: [],
          x: clampTiny(x),
          y: clampTiny(y - initialHeight), // Bottom of text box in Y-Up
          width: initialWidth,
          height: initialHeight,
          strokeColor: '#FFFFFF',
          strokeEnabled: false,
          fillColor: 'transparent',
          fillEnabled: false,
          colorMode: getDefaultColorMode(),
          floorId: activeFloorId,
          discipline: activeDiscipline,
          // Text-specific properties
          textContent: '',
          fontSize: ribbonDefaults.fontSize,
          fontFamily: ribbonDefaults.fontFamily,
          align: ribbonDefaults.align ?? 'left',
          bold: ribbonDefaults.bold,
          italic: ribbonDefaults.italic,
          underline: ribbonDefaults.underline,
          strike: ribbonDefaults.strike,
        };
        
        data.addShape(s);
        setSelectedShapeIds(new Set([shapeId]));
      },
      onTextUpdated: (textId: number, content: string, bounds: { width: number; height: number }, boxMode: TextBoxMode, constraintWidth: number, x?: number, y?: number) => {
        const shapeId = getShapeIdForText(textId);
        if (!shapeId) return;
        
        const data = useDataStore.getState();
        const shape = data.shapes[shapeId];
        if (!shape) return;
        
        // Always reset metadata for auto-width to avoid stale constraints leaking in.
        const freshMeta: TextBoxMeta = {
          boxMode,
          constraintWidth: boxMode === TextBoxMode.FixedWidth ? constraintWidth : 0,
          fixedHeight: boxMode === TextBoxMode.FixedWidth ? (shape.height ?? bounds.height) : undefined,
          maxAutoWidth: bounds.width,
        };

        let nextWidth = bounds.width;
        let nextHeight = bounds.height;

        if (freshMeta.boxMode === TextBoxMode.FixedWidth) {
          nextWidth = Math.max(freshMeta.constraintWidth, 0);
          const fixedHeight = freshMeta.fixedHeight ?? shape.height ?? bounds.height;
          freshMeta.fixedHeight = fixedHeight;
          nextHeight = fixedHeight;
        } else {
          nextWidth = bounds.width;
          freshMeta.fixedHeight = undefined;
          freshMeta.maxAutoWidth = nextWidth;
        }

        textBoxMetaRef.current.set(textId, freshMeta);
        
        // Calculate Y position
        // If Engine provided exact coordinates (via sync), use them (this preserves Baseline).
        // Otherwise, fallback to keeping the top anchor fixed (legacy behavior for simple resizing).
        let nextY = 0;
        let nextX = shape.x ?? 0;

        if (y !== undefined && x !== undefined) {
           nextY = y;
           nextX = x;
        } else {
           // Fallback: Adjust Y to maintain top-anchor position
           // The anchor (top in engine) is at shape.y + shape.height (in Y-Up)
           // After update: new shape.y = anchor.y - new height
           const oldAnchorY = (shape.y ?? 0) + (shape.height ?? 0);
           nextY = oldAnchorY - nextHeight;
        }

        const updates: Partial<Shape> = {
          textContent: content,
          width: nextWidth,
          height: nextHeight,
          x: clampTiny(nextX),
          y: clampTiny(nextY), 
        };
        
        data.updateShape(shapeId, updates, false); // false = don't record to history yet
      },
      onTextDeleted: (textId: number) => {
        const shapeId = getShapeIdForText(textId);
        if (!shapeId) return;
        textBoxMetaRef.current.delete(textId);
        
        unregisterTextMappingByShapeId(shapeId);
        
        const data = useDataStore.getState();
        data.deleteShape(shapeId);
        setSelectedShapeIds(new Set());
      },
    };

    const tool = createTextTool(callbacks);
    if (tool.initialize(runtime)) {
      textToolRef.current = tool;
      // Register with centralized sync manager
      registerTextTool(tool);
      // Load the 4 supported fonts into the engine.
      // IMPORTANT: In the C++ engine, `fontId=0` is reserved as "default".
      // So we register our fonts as 1..4 and map UI selections accordingly.
      // Note: Arial/Times are mapped to DejaVu Sans/Serif font files (shipped in /public/fonts).
      void (async () => {
        const loadFromUrl = async (fontId: number, url: string, label: string) => {
          try {
            const res = await fetch(url);
            if (!res.ok) {
              console.warn('TextTool: font fetch failed', { fontId, label, url, status: res.status, statusText: res.statusText });
              return;
            }
            const buf = await res.arrayBuffer();
            const ok = tool.loadFont(fontId, new Uint8Array(buf));
            if (ok) {
              console.log('[DEBUG] TextTool: font loaded successfully', { fontId, label, url, byteSize: buf.byteLength });
            } else {
              console.warn('TextTool: engine rejected font data', { fontId, label, url });
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn('TextTool: font load threw', { fontId, label, url, error: e, message });
          }
        };

        const baseUrl = import.meta.env.BASE_URL || '/';
        const publicUrl = (path: string) => `${baseUrl}${path.replace(/^\//, '')}`;

        // fontId mapping used by ribbon -> engine:
        // 0 = default (Inter), 1 = Arial (DejaVu Sans), 2 = Times (DejaVu Serif), 3 = Roboto
        // IMPORTANT: `fontId=0` is reserved for "default" in the C++ engine, so we register
        // Inter as fontId=4 and load it FIRST to become the engine default.
        // (Inter/Roboto are currently mapped to DejaVu Sans for engine rendering.)
        const sansTtf = publicUrl('/fonts/DejaVuSans.ttf');
        const serifTtf = publicUrl('/fonts/DejaVuSerif.ttf');

        await loadFromUrl(4, sansTtf, 'Inter');
        await loadFromUrl(1, sansTtf, 'Arial');
        await loadFromUrl(2, serifTtf, 'Times');
        await loadFromUrl(3, sansTtf, 'Roboto');
      })();
    }

    return () => {
      // Clean up on unmount
      registerTextTool(null);
      textToolRef.current = null;
    };
  }, [runtimeReady, setEngineTextEditActive, setEngineTextEditContent, setEngineTextEditCaret, setCaretPosition, setEngineTextEditCaretPosition, clearEngineTextEdit, hideCaret, clearSelection]);

  // Keep TextTool defaults in sync with ribbon settings (font family/size/style/align).
  useEffect(() => {
    const tool = textToolRef.current;
    if (!tool) return;

    const fontIdByFamily: Record<string, number> = {
      Inter: 0,
      Arial: 1,
      Times: 2,
      Roboto: 3,
    };

    const flags =
      (ribbonTextDefaults.bold ? TextStyleFlags.Bold : 0) |
      (ribbonTextDefaults.italic ? TextStyleFlags.Italic : 0) |
      (ribbonTextDefaults.underline ? TextStyleFlags.Underline : 0) |
      (ribbonTextDefaults.strike ? TextStyleFlags.Strikethrough : 0);

    const align =
      ribbonTextDefaults.align === 'center'
        ? TextAlign.Center
        : ribbonTextDefaults.align === 'right'
          ? TextAlign.Right
          : TextAlign.Left;

    tool.setStyleDefaults({
      fontId: fontIdByFamily[ribbonTextDefaults.fontFamily] ?? 0,
      fontSize: ribbonTextDefaults.fontSize,
      flags,
      align,
      // Default to white for visibility on dark canvas; can be extended later to a ribbon color control.
      colorRGBA: packColorRGBA(1, 1, 1, 1),
    });
  }, [ribbonTextDefaults]);

  // Ensure the hidden input is focused whenever we enter engine text edit mode.
  useEffect(() => {
    if (!engineTextEditState.active) return;
    requestAnimationFrame(() => {
      textInputProxyRef.current?.focus();
    });
  }, [engineTextEditState.active]);

  useEffect(() => {
    if (!gpuPickingEnabled) return;
    if (!gpuPickerRef.current) gpuPickerRef.current = new GpuPicker();
  }, [gpuPickingEnabled]);

  useEffect(() => {
    return () => {
      gpuPickerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const pickShape = useCallback((world: Point, screen: Point, tolerance: number): string | null => {
    {
      const data = useDataStore.getState();
      const ui = useUIStore.getState();
      const queryRect = { x: world.x - tolerance, y: world.y - tolerance, width: tolerance * 2, height: tolerance * 2 };
      const svgCandidates = data.spatialIndex
        .query(queryRect)
        .map((c) => data.shapes[c.id])
        .filter((s): s is Shape => !!s && s.type === 'rect' && !!s.svgRaw && (!s.svgSymbolId || s.svgSymbolId.startsWith('plan:')));

      if (svgCandidates.length) {
        const orderIndex = new Map<string, number>();
        for (let i = 0; i < data.shapeOrder.length; i++) orderIndex.set(data.shapeOrder[i]!, i);
        svgCandidates.sort((a, b) => (orderIndex.get(b.id) ?? -1) - (orderIndex.get(a.id) ?? -1));

        for (const shape of svgCandidates) {
          const layer = data.layers.find((l) => l.id === shape.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
          void primeSymbolAlphaMask(shape.id, shape.svgRaw ?? '', 256);
          if (isSymbolInstanceHitAtWorldPoint(shape, world, getSymbolAlphaAtUv, { toleranceWorld: tolerance, symbolIdOverride: shape.id })) return shape.id;
        }
      }
    }

    {
      const data = useDataStore.getState();
      const ui = useUIStore.getState();
      const queryRect = { x: world.x - tolerance, y: world.y - tolerance, width: tolerance * 2, height: tolerance * 2 };
      const symbolCandidates = data.spatialIndex
        .query(queryRect)
        .map((c) => data.shapes[c.id])
        .filter((s): s is Shape => !!s && !!s.svgSymbolId);

      if (symbolCandidates.length) {
        const orderIndex = new Map<string, number>();
        for (let i = 0; i < data.shapeOrder.length; i++) orderIndex.set(data.shapeOrder[i]!, i);
        symbolCandidates.sort((a, b) => (orderIndex.get(b.id) ?? -1) - (orderIndex.get(a.id) ?? -1));

        for (const shape of symbolCandidates) {
          const layer = data.layers.find((l) => l.id === shape.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
          if (isSymbolInstanceHitAtWorldPoint(shape, world, getSymbolAlphaAtUv, { toleranceWorld: tolerance })) return shape.id;
        }
      }
    }

    if (gpuPickingEnabled && gpuPickerRef.current) {
      const data = useDataStore.getState();
      const gpuHit = gpuPickerRef.current.pick({
        screen,
        world,
        toleranceWorld: tolerance,
        viewTransform,
        canvasSize,
        shapes: data.shapes,
        shapeOrder: data.shapeOrder,
        layers: data.layers,
        spatialIndex: data.spatialIndex,
        activeFloorId: activeFloorId ?? 'terreo',
        activeDiscipline,
      });
      if (gpuHit) return gpuHit;
    }

    return pickShapeAtGeometry(world, tolerance);
  }, [activeDiscipline, activeFloorId, canvasSize, gpuPickingEnabled, viewTransform]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (polygonSidesModal && e.key === 'Escape') {
        e.preventDefault();
        setPolygonSidesModal(null);
        return;
      }

      if (activeTool !== 'polyline') return;
      const prev = draftRef.current;

      if (e.key === 'Escape') {
        if (prev.kind === 'polyline') {
          e.preventDefault();
          setDraft({ kind: 'none' });
        }
        return;
      }

      if (e.key === 'Enter') {
        if (prev.kind === 'polyline') {
          e.preventDefault();
          commitPolyline(prev.current ? [...prev.points, prev.current] : prev.points);
          setDraft({ kind: 'none' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, polygonSidesModal]);

  const cursor = useMemo(() => {
    if (engineTextEditState.active) return 'text';
    return cursorOverride ? cursorOverride : getCursorForTool(activeTool);
  }, [activeTool, cursorOverride, engineTextEditState.active]);

  useEffect(() => {
    setSelectionBox(null);
    selectInteractionRef.current = { kind: 'none' };
    setCursorOverride(null);
    setDraft((prev) => (prev.kind === 'polyline' ? { kind: 'none' } : prev));
    setPolygonSidesModal(null);
  }, [activeTool]);

  const handleWheel = (evt: React.WheelEvent<HTMLDivElement>) => {
    evt.preventDefault();
    const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mouse = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    setViewTransform((prev) => calculateZoomTransform(prev, mouse, evt.deltaY, screenToWorld));
  };

  const beginPan = (evt: React.PointerEvent<HTMLDivElement>) => {
    isPanningRef.current = true;
    panStartRef.current = { x: evt.clientX, y: evt.clientY };
    transformStartRef.current = { ...viewTransform };
  };

  const updatePan = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current || !transformStartRef.current) return;
    const dx = evt.clientX - panStartRef.current.x;
    const dy = evt.clientY - panStartRef.current.y;
    setViewTransform({
      x: transformStartRef.current.x + dx,
      y: transformStartRef.current.y + dy,
      scale: transformStartRef.current.scale,
    });
  };

  const endPan = () => {
    isPanningRef.current = false;
    transformStartRef.current = null;
  };

  const tryFindAnchoredNode = (world: { x: number; y: number }): { nodeId: string; point: { x: number; y: number } } | null => {
    const data = useDataStore.getState();
    const ui = useUIStore.getState();
    const scale = Math.max(ui.viewTransform.scale || 1, 0.01);
    const tolerance = CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX / scale;

    const runtime = runtimeRef.current;
    if (runtime && typeof runtime.engine.snapElectrical === 'function') {
      try {
        const r = runtime.engine.snapElectrical(world.x, world.y, tolerance);
        if (r.kind === 1 && r.id !== 0) {
          const nodeStringId = runtime.getIdMaps().idHashToString.get(r.id);
          if (nodeStringId && data.connectionNodes[nodeStringId]) {
            return { nodeId: nodeStringId, point: { x: r.x, y: r.y } };
          }
        }
        if (r.kind === 2 && r.id !== 0) {
          const symbolStringId = runtime.getIdMaps().idHashToString.get(r.id);
          if (symbolStringId) {
            const nodeId = data.getOrCreateAnchoredConnectionNode(symbolStringId);
            return { nodeId, point: { x: r.x, y: r.y } };
          }
        }
      } catch {
        // Fall back to TS snap below.
      }
    }

    const queryRect = { x: world.x - tolerance, y: world.y - tolerance, width: tolerance * 2, height: tolerance * 2 };
    const candidates = data.spatialIndex.query(queryRect).map((c) => data.shapes[c.id]).filter(Boolean) as Shape[];

    for (const shape of candidates) {
      const layer = data.layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) continue;

      const connPt = getConnectionPoint(shape);
      if (!connPt) continue;

      const nearConnection = getDistance(connPt, world) <= tolerance;
      const bbox = getShapeBoundingBox(shape);
      const insideBBox =
        !!bbox &&
        world.x >= bbox.x - tolerance &&
        world.x <= bbox.x + bbox.width + tolerance &&
        world.y >= bbox.y - tolerance &&
        world.y <= bbox.y + bbox.height + tolerance;

      if (nearConnection || insideBBox) {
        const nodeId = data.getOrCreateAnchoredConnectionNode(shape.id);
        return { nodeId, point: connPt };
      }
    }

    for (const node of Object.values(data.connectionNodes)) {
      const pos = resolveConnectionNodePosition(node, data.shapes);
      if (!pos) continue;
      if (getDistance(pos, world) <= tolerance) return { nodeId: node.id, point: pos };
    }

    return null;
  };

  const pickResizeHandleAtScreen = (
    screenPoint: { x: number; y: number },
    view: ReturnType<typeof useUIStore.getState>['viewTransform'],
  ): { shapeId: string; handleIndex: number; cursor: string } | null => {
    const data = useDataStore.getState();
    const ui = useUIStore.getState();

    let best: { shapeId: string; handleIndex: number; cursor: string; d2: number } | null = null;
    const hitR2 = HANDLE_HIT_RADIUS_PX * HANDLE_HIT_RADIUS_PX;

    selectedShapeIds.forEach((id) => {
      const shape = data.shapes[id];
      if (!shape) return;
      if (!supportsBBoxResize(shape)) return;

      const layer = data.layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) return;
      if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) return;

      if (shape.type === 'text') {
        const allowTextResize = useSettingsStore.getState().featureFlags.enableTextResize;
        if (!allowTextResize) return;
      }

      const handles = getShapeHandles(shape).filter((h) => h.type === 'resize');
      for (const h of handles) {
        const p = worldToScreen({ x: h.x, y: h.y }, view);
        const dx = screenPoint.x - p.x;
        const dy = screenPoint.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > hitR2) continue;
        if (!best || d2 < best.d2) best = { shapeId: id, handleIndex: h.index, cursor: h.cursor, d2 };
      }
    });

    return best ? { shapeId: best.shapeId, handleIndex: best.handleIndex, cursor: best.cursor } : null;
  };

  const pickVertexHandleAtScreen = (
    screenPoint: { x: number; y: number },
    view: ReturnType<typeof useUIStore.getState>['viewTransform'],
  ): { shapeId: string; vertexIndex: number } | null => {
    const data = useDataStore.getState();
    const ui = useUIStore.getState();

    let best: { shapeId: string; vertexIndex: number; d2: number } | null = null;
    const hitR2 = HANDLE_HIT_RADIUS_PX * HANDLE_HIT_RADIUS_PX;

    selectedShapeIds.forEach((id) => {
      const shape = data.shapes[id];
      if (!shape) return;
      if (shape.type !== 'line' && shape.type !== 'arrow' && shape.type !== 'polyline') return;
      const ptsWorld = shape.points ?? [];
      if (ptsWorld.length < 2) return;

      const layer = data.layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) return;
      if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) return;

      const pts = ptsWorld.map((p) => worldToScreen(p, view));
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const dx = screenPoint.x - p.x;
        const dy = screenPoint.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > hitR2) continue;
        if (!best || d2 < best.d2) best = { shapeId: id, vertexIndex: i, d2 };
      }
    });

    return best ? { shapeId: best.shapeId, vertexIndex: best.vertexIndex } : null;
  };

  const commitElectricalSymbolAt = (world: { x: number; y: number }) => {
    if (!activeElectricalSymbolId) return;
    const library = useLibraryStore.getState();
    const data = useDataStore.getState();

    const symbol = library.electricalSymbols[activeElectricalSymbolId];
    if (!symbol) return;

    const layerConfig = getElectricalLayerConfig(symbol.id, symbol.category);
    const targetLayerId = data.ensureLayer(layerConfig.name, {
      strokeColor: layerConfig.strokeColor,
      fillColor: layerConfig.fillColor ?? '#ffffff',
      fillEnabled: layerConfig.fillEnabled ?? false,
      strokeEnabled: true,
      isNative: true,
    });

    const width = symbol.viewBox.width * symbol.scale;
    const height = symbol.viewBox.height * symbol.scale;
    const shapeId = generateId();

    const shape: Shape = {
      id: shapeId,
      layerId: targetLayerId,
      type: 'rect',
      x: clampTiny(world.x - width / 2),
      y: clampTiny(world.y - height / 2),
      width: clampTiny(width),
      height: clampTiny(height),
      strokeColor: layerConfig.strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled: false,
      fillColor: '#ffffff',
      fillEnabled: false,
      colorMode: getDefaultColorMode(),
      points: [],
      rotation: electricalRotation,
      scaleX: electricalFlipX,
      scaleY: electricalFlipY,
      svgSymbolId: symbol.id,
      svgRaw: symbol.canvasSvg,
      svgViewBox: symbol.viewBox,
      symbolScale: symbol.scale,
      connectionPoint: symbol.defaultConnectionPoint,
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    const metadata = getDefaultMetadataForSymbol(symbol.id);
    const electricalElement: ElectricalElement = {
      id: `el-${shapeId}`,
      shapeId,
      category: symbol.category,
      name: symbol.id,
      metadata,
    };

    data.addShape(shape, electricalElement);
    setSelectedShapeIds(new Set([shapeId]));
  };

  const commitConduitSegmentTo = (end: { x: number; y: number }) => {
    const start = conduitStart;
    if (!start) return;

    const data = useDataStore.getState();
    const endHit = tryFindAnchoredNode(end);
    const endNodeId = endHit ? endHit.nodeId : data.createFreeConnectionNode(end);

    if (endNodeId === start.nodeId) {
      setConduitStart(null);
      setDraft({ kind: 'none' });
      return;
    }

    const layer = data.layers.find((l) => l.id === 'eletrodutos') ?? data.layers.find((l) => l.id === data.activeLayerId) ?? data.layers[0];
    const layerId = layer?.id ?? data.activeLayerId;
    const strokeColor = layer?.strokeColor ?? toolDefaults.strokeColor;

    const conduitId = data.addConduitBetweenNodes({ fromNodeId: start.nodeId, toNodeId: endNodeId, layerId, strokeColor });
    setSelectedShapeIds(new Set([conduitId]));
    setConduitStart(null);
    setDraft({ kind: 'none' });
  };

  const finalizeDrawCreation = (id: string) => {
    setSelectedShapeIds(new Set([id]));
    const ui = useUIStore.getState();
    ui.setSidebarTab('desenho');
    ui.setTool('select');
  };

  const commitLine = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.hypot(dx, dy) < 1e-3) return;

    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;

    const s: Shape = {
      id,
      layerId,
      type: 'line',
      points: [
        { x: clampTiny(start.x), y: clampTiny(start.y) },
        { x: clampTiny(end.x), y: clampTiny(end.y) },
      ],
      strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled,
      fillColor: toolDefaults.fillColor ?? '#D9D9D9',
      fillEnabled: false,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const commitRect = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const r = normalizeRect(start, end);
    if (r.w < 1e-3 || r.h < 1e-3) return;

    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;
    const fillEnabled = toolDefaults.fillEnabled !== false;

    const s: Shape = {
      id,
      layerId,
      type: 'rect',
      points: [],
      x: clampTiny(r.x),
      y: clampTiny(r.y),
      width: clampTiny(r.w),
      height: clampTiny(r.h),
      strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled,
      fillColor,
      fillEnabled,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const commitDefaultRectAt = (center: { x: number; y: number }) => {
    const half = 50;
    commitRect({ x: center.x - half, y: center.y - half }, { x: center.x + half, y: center.y + half });
  };

  const commitEllipse = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const r = normalizeRect(start, end);
    if (r.w < 1e-3 || r.h < 1e-3) return;

    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;
    const fillEnabled = toolDefaults.fillEnabled !== false;

    const s: Shape = {
      id,
      layerId,
      type: 'circle',
      points: [],
      x: clampTiny(r.x + r.w / 2),
      y: clampTiny(r.y + r.h / 2),
      width: clampTiny(r.w),
      height: clampTiny(r.h),
      strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled,
      fillColor,
      fillEnabled,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const commitDefaultEllipseAt = (center: { x: number; y: number }) => {
    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;
    const fillEnabled = toolDefaults.fillEnabled !== false;

    const s: Shape = {
      id,
      layerId,
      type: 'circle',
      points: [],
      x: clampTiny(center.x),
      y: clampTiny(center.y),
      width: 100,
      height: 100,
      strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled,
      fillColor,
      fillEnabled,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const commitPolygon = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const r = normalizeRect(start, end);
    if (r.w < 1e-3 || r.h < 1e-3) return;

    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;
    const fillEnabled = toolDefaults.fillEnabled !== false;
    const clampedSides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
    const rotation = clampedSides === 3 ? Math.PI : 0;

    const s: Shape = {
      id,
      layerId,
      type: 'polygon',
      points: [],
      x: clampTiny(r.x + r.w / 2),
      y: clampTiny(r.y + r.h / 2),
      width: clampTiny(r.w),
      height: clampTiny(r.h),
      sides: clampedSides,
      rotation,
      strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled,
      fillColor,
      fillEnabled,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const commitDefaultPolygonAt = (center: { x: number; y: number }, sides: number) => {
    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;
    const fillEnabled = toolDefaults.fillEnabled !== false;
    const clampedSides = Math.max(3, Math.min(24, Math.floor(sides)));
    const rotation = clampedSides === 3 ? Math.PI : 0;

    const s: Shape = {
      id,
      layerId,
      type: 'polygon',
      points: [],
      x: clampTiny(center.x),
      y: clampTiny(center.y),
      width: 100,
      height: 100,
      sides: clampedSides,
      rotation,
      strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled,
      fillColor,
      fillEnabled,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const commitPolyline = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return;

    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;
    const s: Shape = {
      id,
      layerId,
      type: 'polyline',
      points: points.map((p) => ({ x: clampTiny(p.x), y: clampTiny(p.y) })),
      strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled,
      fillColor: toolDefaults.fillColor ?? '#D9D9D9',
      fillEnabled: false,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const commitArrow = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.hypot(dx, dy) < 1e-3) return;

    const id = generateId();
    const data = useDataStore.getState();
    const layerId = data.activeLayerId;
    const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
    const strokeEnabled = toolDefaults.strokeEnabled !== false;
    const strokeWidth = toolDefaults.strokeWidth ?? 2;

    const s: Shape = {
      id,
      layerId,
      type: 'arrow',
      points: [
        { x: clampTiny(start.x), y: clampTiny(start.y) },
        { x: clampTiny(end.x), y: clampTiny(end.y) },
      ],
      arrowHeadSize: Math.round(Math.max(16, strokeWidth * 10) * 1.1),
      strokeColor,
      strokeWidth,
      strokeEnabled,
      fillColor: toolDefaults.fillColor ?? '#D9D9D9',
      fillEnabled: false,
      colorMode: getDefaultColorMode(),
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    data.addShape(s);
    finalizeDrawCreation(id);
  };

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
    (evt.currentTarget as HTMLDivElement).setPointerCapture(evt.pointerId);

    // If currently editing text, manage clicks inside vs outside
    if (engineTextEditState.active && textToolRef.current) {
      const world = toWorldPoint(evt, viewTransform);
      

      // Check if click is inside the ACTIVE text being edited
      // We need the shape ID for the active text ID
      const activeTextId = engineTextEditState.textId;
      const activeShapeId = activeTextId !== null ? getShapeIdForText(activeTextId) : null;
      
      if (activeShapeId) {
        const data = useDataStore.getState();
        const shape = data.shapes[activeShapeId];
        if (shape) {
          const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
          const meta = textBoxMetaRef.current.get(activeTextId!);

          const boxWidth = Math.max(
            0,
            meta
              ? meta.boxMode === TextBoxMode.FixedWidth
                ? meta.constraintWidth
                : meta.maxAutoWidth ?? (shape.width || 0)
              : shape.width || 0
          );
          const boxHeight = Math.max(0, meta?.fixedHeight ?? (shape.height || 0));

          const anchorX = shape.x || 0;
          const anchorY = (shape.y || 0) + boxHeight;

          const minX = anchorX - tolerance;
          const maxX = anchorX + boxWidth + tolerance;
          const minY = (shape.y || 0) - tolerance; // shape.y is bottom in world (Y-up)
          const maxY = anchorY + tolerance;

          const inside = world.x >= minX && world.x <= maxX && world.y >= minY && world.y <= maxY;
          
          if (inside) {
             // Clicked INSIDE active text - move caret using latest box metrics
             const localX = world.x - anchorX;
             const localY = world.y - anchorY;
             
             const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
             const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

             textToolRef.current.handlePointerDown(activeTextId!, localX, localY, evt.shiftKey, anchorX, anchorY, shape.rotation || 0, boxMode, constraintWidth);
             // Keep focus stable for subsequent clicks inside the text box
             textInputProxyRef.current?.focus();
             evt.preventDefault();
             // Stop propagation to prevent selection tool from taking over
             evt.stopPropagation();
             return; 
          }
        }
      }

      // Clicked OUTSIDE - commit and exit
      textToolRef.current.commitAndExit();
      // Allow event to fall through to standard selection logic (so you can select something else immediately)
    }

    if (evt.button === 2 && activeTool === 'polyline') {
      const prev = draftRef.current;
      if (prev.kind === 'polyline') {
        evt.preventDefault();
        commitPolyline(prev.current ? [...prev.points, prev.current] : prev.points);
        setDraft({ kind: 'none' });
        return;
      }
    }

    if (evt.button === 1 || evt.button === 2 || evt.altKey || activeTool === 'pan') {
      beginPan(evt);
      return;
    }

    if (evt.button !== 0) return;

    const world = toWorldPoint(evt, viewTransform);
    const snapped = activeTool === 'select' ? world : (snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world);

    pointerDownRef.current = { x: evt.clientX, y: evt.clientY, world: snapped };
    if (activeTool === 'select') setSelectionBox(null);

    if (activeTool === 'text') {
      // Start potential drag for FixedWidth text
      textDragStartRef.current = snapped;
      setDraft({ kind: 'text', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'move') {
      const data = useDataStore.getState();
      const selected = Array.from(selectedShapeIds)
        .map((id) => data.shapes[id])
        .filter(Boolean) as Shape[];

      const movable = selected.filter((s) => {
        const layer = data.layers.find((l) => l.id === s.layerId);
        if (layer?.locked) return false;
        if (isConduitShape(s)) return false; // avoid breaking anchored connection semantics for now
        return true;
      });

      if (movable.length === 0) return;
      moveRef.current = { start: snapped, snapshot: new Map(movable.map((s) => [s.id, s])) };
      return;
    }

    if (activeTool === 'electrical-symbol') {
      commitElectricalSymbolAt(snapped);
      return;
    }

    if (activeTool === 'eletroduto') {
      if (!conduitStart) {
        const startHit = tryFindAnchoredNode(snapped);
        const startNodeId = startHit ? startHit.nodeId : useDataStore.getState().createFreeConnectionNode(snapped);
        const startPoint = startHit ? startHit.point : snapped;
        setConduitStart({ nodeId: startNodeId, point: startPoint });
        setDraft({ kind: 'conduit', start: startPoint, current: startPoint });
        return;
      }

      commitConduitSegmentTo(snapped);
      return;
    }

    if (activeTool === 'line') {
      setDraft({ kind: 'line', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'rect') {
      setDraft({ kind: 'rect', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'circle') {
      setDraft({ kind: 'ellipse', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'polygon') {
      setDraft({ kind: 'polygon', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'polyline') {
      setDraft((prev) => {
        if (prev.kind !== 'polyline') return { kind: 'polyline', points: [snapped], current: snapped };
        return { kind: 'polyline', points: [...prev.points, snapped], current: snapped };
      });
      return;
    }

    if (activeTool === 'arrow') {
      setDraft({ kind: 'arrow', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'select') {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

      const handleHit = pickResizeHandleAtScreen(screen, viewTransform);
      if (handleHit) {
        const data = useDataStore.getState();
        const shape = data.shapes[handleHit.shapeId];
        const corners = shape ? getRectCornersWorld(shape) : null;
        if (shape && corners) {
          const bbox0 = getShapeBoundingBox(shape);
          const baseW = Math.max(1e-3, bbox0.width || 1);
          const baseH = Math.max(1e-3, bbox0.height || 1);
          const fixedCornerIndex = (handleHit.handleIndex + 2) % 4;
          selectInteractionRef.current = {
            kind: 'resize',
            moved: false,
            state: {
              shapeId: shape.id,
              handleIndex: handleHit.handleIndex,
              fixedCornerIndex,
              fixedCornerWorld: corners.corners[fixedCornerIndex],
              startPointerWorld: world,
              snapshot: shape,
              applyMode: shape.type === 'circle' || shape.type === 'polygon' ? 'center' : 'topLeft',
              startAspectRatio: baseH / baseW,
            },
          };
          setCursorOverride(handleHit.cursor);
          return;
        }
      }

      const endpointHit = pickVertexHandleAtScreen(screen, viewTransform);
      if (endpointHit) {
        const data = useDataStore.getState();
        const shape = data.shapes[endpointHit.shapeId];
        const layer = shape ? data.layers.find((l) => l.id === shape.layerId) : null;
        const movable = !!shape && !(layer?.locked) && !isConduitShape(shape);
        if (shape && movable) {
          if (!selectedShapeIds.has(shape.id) || selectedShapeIds.size !== 1) setSelectedShapeIds(new Set([shape.id]));
          selectInteractionRef.current = {
            kind: 'vertex',
            moved: false,
            state: { shapeId: shape.id, vertexIndex: endpointHit.vertexIndex, startPointerWorld: world, snapshot: shape },
          };
          setCursorOverride('default');
          return;
        }
      }

      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hitId = pickShape(world, screen, tolerance);
      if (hitId) {
        if (!selectedShapeIds.has(hitId) || selectedShapeIds.size !== 1) setSelectedShapeIds(new Set([hitId]));

        const data = useDataStore.getState();
        const hitShape = data.shapes[hitId];
        const layer = hitShape ? data.layers.find((l) => l.id === hitShape.layerId) : null;
        const movable = !!hitShape && !(layer?.locked) && !isConduitShape(hitShape);
        if (movable && hitShape) {
          if (hitShape.type === 'line' || hitShape.type === 'arrow' || hitShape.type === 'polyline') {
            const pts = hitShape.points ?? [];
            if (pts.length >= 2) {
              const hitR2 = HANDLE_HIT_RADIUS_PX * HANDLE_HIT_RADIUS_PX;
              let best: { idx: number; d2: number } | null = null;
              for (let i = 0; i < pts.length; i++) {
                const s = worldToScreen(pts[i]!, viewTransform);
                const d2 = (screen.x - s.x) * (screen.x - s.x) + (screen.y - s.y) * (screen.y - s.y);
                if (d2 > hitR2) continue;
                if (!best || d2 < best.d2) best = { idx: i, d2 };
              }
              if (best) {
                selectInteractionRef.current = {
                  kind: 'vertex',
                  moved: false,
                  state: { shapeId: hitShape.id, vertexIndex: best.idx, startPointerWorld: world, snapshot: hitShape },
                };
                setCursorOverride('default');
                return;
              }
            }
          }

          selectInteractionRef.current = {
            kind: 'move',
            moved: false,
            state: { start: world, snapshot: new Map([[hitId, hitShape]]) },
          };
          setCursorOverride('move');
          return;
        }

        selectInteractionRef.current = { kind: 'none' };
        setCursorOverride('move');
        return;
      }

      selectInteractionRef.current = { kind: 'marquee' };
      setCursorOverride(null);
      return;
    }
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      updatePan(evt);
      return;
    }

    // Delegate pointer move when editing text
    if (engineTextEditState.active) {
       if (textToolRef.current && engineTextEditState.textId !== null) {
          const activeTextId = engineTextEditState.textId;
          const activeShapeId = getShapeIdForText(activeTextId);
          if (activeShapeId) {
             const data = useDataStore.getState();
             const shape = data.shapes[activeShapeId];
             if (shape) {
                const world = toWorldPoint(evt, viewTransform);
             const bbox = getShapeBoundingBox(shape);
             const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
             const inside =
              world.x >= bbox.x - tolerance &&
              world.x <= bbox.x + bbox.width + tolerance &&
              world.y >= bbox.y - tolerance &&
              world.y <= bbox.y + bbox.height + tolerance;
             setCursorOverride(inside ? 'text' : null);

                const anchorY = (shape.y || 0) + (shape.height || 0);
                const anchorX = (shape.x || 0);
                const localX = world.x - anchorX;
                const localY = world.y - anchorY;
                textToolRef.current.handlePointerMove(activeTextId, localX, localY);
             }
          }
       }
       return;
    }

    const world = toWorldPoint(evt, viewTransform);
    const snapped = activeTool === 'select' ? world : (snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world);

    if (activeTool === 'text') {
      if (textDragStartRef.current) {
        setDraft({ kind: 'text', start: textDragStartRef.current, current: snapped });
      }
      return;
    }

    if (activeTool === 'select') {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

      const down = pointerDownRef.current;
      const interaction = selectInteractionRef.current;

      if (!down) {
        const handleHover = pickResizeHandleAtScreen(screen, viewTransform);
        if (handleHover) {
          setCursorOverride(handleHover.cursor);
          return;
        }

        const endpointHover = pickVertexHandleAtScreen(screen, viewTransform);
        if (endpointHover) {
          setCursorOverride('default');
          return;
        }

        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
        const hit = pickShape(world, screen, tolerance);
        setCursorOverride(hit ? 'move' : null);
        return;
      }

      const dx = evt.clientX - down.x;
      const dy = evt.clientY - down.y;
      const dragged = isDrag(dx, dy);

      if (interaction.kind === 'move') {
        if (!interaction.moved && !dragged) return;
        if (!interaction.moved) selectInteractionRef.current = { ...interaction, moved: true };

        const moveState = interaction.state;
        const data = useDataStore.getState();
        const ddx = snapped.x - moveState.start.x;
        const ddy = snapped.y - moveState.start.y;
        moveState.snapshot.forEach((shape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;

          const diff: Partial<Shape> = {};
          if (shape.x !== undefined) diff.x = clampTiny(shape.x + ddx);
          if (shape.y !== undefined) diff.y = clampTiny(shape.y + ddy);
          if (shape.points) diff.points = shape.points.map((p) => ({ x: clampTiny(p.x + ddx), y: clampTiny(p.y + ddy) }));

          if (Object.keys(diff).length) data.updateShape(id, diff, false);

          // Sync text position with engine if this is a text shape
          if (shape.type === 'text' && textToolRef.current) {
            const textId = getTextIdForShape(id);
            if (textId !== null) {
              const meta = textBoxMetaRef.current.get(textId);
              const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
              const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

              // Engine anchor is at top-left of text box in Y-Up world:
              // - shape.x is bottom-left X (same as anchor X)  
              // - anchor Y = shape.y + shape.height (top of box in Y-Up)
              const newAnchorX = diff.x ?? shape.x ?? 0;
              const newShapeY = diff.y ?? shape.y ?? 0;
              const height = shape.height ?? 0;
              const newAnchorY = newShapeY + height;
              textToolRef.current.moveText(textId, newAnchorX, newAnchorY, boxMode, constraintWidth);
            }
          }
        });
        return;
      }

      if (interaction.kind === 'vertex') {
        if (!interaction.moved && !dragged) return;
        if (!interaction.moved) selectInteractionRef.current = { ...interaction, moved: true };

        const { state } = interaction;
        const data = useDataStore.getState();
        const curr = data.shapes[state.shapeId];
        if (!curr) return;
        if (!curr.points || curr.points.length < 2) return;

        let nextPoint = { x: clampTiny(snapped.x), y: clampTiny(snapped.y) };
        if ((curr.type === 'line' || curr.type === 'arrow') && curr.points.length >= 2 && evt.shiftKey) {
          const fixedIdx = state.vertexIndex === 0 ? 1 : 0;
          const fixed = curr.points[fixedIdx]!;
          nextPoint = snapVectorTo45Deg(fixed, nextPoint);
        }

        const nextPoints = curr.points.map((p, i) => (i === state.vertexIndex ? nextPoint : p));
        data.updateShape(state.shapeId, { points: nextPoints }, false);
        return;
      }

      if (interaction.kind === 'resize') {
        if (!interaction.moved && !dragged) return;
        if (!interaction.moved) selectInteractionRef.current = { ...interaction, moved: true };

        const { state } = interaction;
        const data = useDataStore.getState();
        const curr = data.shapes[state.shapeId];
        if (!curr) return;

        const rotation = state.snapshot.rotation || 0;
        const fixed = state.fixedCornerWorld;

        const vWorld = { x: snapped.x - fixed.x, y: snapped.y - fixed.y };
        const vLocal = rotateVec(vWorld, -rotation);

        // Always treat the fixed corner as local origin; the signed vector to the pointer defines size and flip.
        // This keeps behavior consistent across all corners (Figma-like).
        const rawW0 = vLocal.x;
        const rawH0 = vLocal.y;

        const bbox0 = getShapeBoundingBox(state.snapshot);
        const eps = 1e-3;
        const baseW = Math.max(eps, bbox0.width || 1);
        const baseH = Math.max(eps, bbox0.height || 1);
        const ratio = Number.isFinite(state.startAspectRatio) && state.startAspectRatio > 0 ? state.startAspectRatio : (baseH / baseW);

        let rawW = rawW0;
        let rawH = rawH0;

        const constrainProportions = !!state.snapshot.proportionsLinked || evt.shiftKey;
        if (constrainProportions) {
          const wAbs = Math.abs(rawW);
          const hAbs = Math.abs(rawH);
          const wRel = wAbs / baseW;
          const hRel = hAbs / baseH;
          if (wRel >= hRel) {
            rawH = Math.sign(rawH || 1) * wAbs * ratio;
          } else {
            rawW = Math.sign(rawW || 1) * (hAbs / ratio);
          }
        }

        // Flip-friendly local AABB from (0,0) at fixed corner to signed (rawW, rawH).
        let localMinX = Math.min(0, rawW);
        let localMaxX = Math.max(0, rawW);
        let localMinY = Math.min(0, rawH);
        let localMaxY = Math.max(0, rawH);

        const nextW = Math.max(eps, localMaxX - localMinX);
        let nextH = Math.max(eps, localMaxY - localMinY);

        const baseScaleX = state.snapshot.scaleX ?? 1;
        const baseScaleY = state.snapshot.scaleY ?? 1;
        const expectedSignX = state.handleIndex === 1 || state.handleIndex === 2 ? 1 : -1;
        const expectedSignY = state.handleIndex === 2 || state.handleIndex === 3 ? 1 : -1;

        const nextSignX = Math.sign(rawW || expectedSignX) || expectedSignX;
        const nextSignY = Math.sign(rawH || expectedSignY) || expectedSignY;

        const flippedX = nextSignX !== expectedSignX;
        const flippedY = nextSignY !== expectedSignY;

        let nextScaleX = (flippedX ? -1 : 1) * baseScaleX;
        let nextScaleY = (flippedY ? -1 : 1) * baseScaleY;

        // Text Reflow Logic
        if (curr.type === 'text' && textToolRef.current) {
            // Find Engine Text ID
            const textId = getTextIdForShape(curr.id);

            if (textId !== null) {
              const newBounds = textToolRef.current.resizeText(textId, nextW);
              if (newBounds) {
                 // Allow box to be taller than text (vertical resize), but at least as tall as content
                 nextH = Math.max(newBounds.height, nextH);
                 
                 // Update rawH to match the ACTUAL height so that center calculation is correct
                 // relative to the fixed corner.
                 const sY = Math.sign(rawH) || expectedSignY || 1;
                 rawH = sY * nextH;
                 
                 // Text should not scale, just reflow.
                 nextScaleX = 1; 
                 nextScaleY = 1;

                 // Recalculate local bounds with updated rawH
                 localMinY = Math.min(0, rawH);
                 localMaxY = Math.max(0, rawH);
              }
            }
        }

        const localCenter = { x: (localMinX + localMaxX) / 2, y: (localMinY + localMaxY) / 2 };
        const center = { x: fixed.x + rotateVec(localCenter, rotation).x, y: fixed.y + rotateVec(localCenter, rotation).y };

        const diff = applyResizeToShape(state.snapshot, state.applyMode, center, nextW, nextH, nextScaleX, nextScaleY);
        data.updateShape(state.shapeId, diff, false);

        if (curr.type === 'text') {
          const textId = getTextIdForShape(curr.id);
          if (textId !== null) {
            textBoxMetaRef.current.set(textId, {
              boxMode: TextBoxMode.FixedWidth,
              constraintWidth: nextW,
              fixedHeight: nextH,
              maxAutoWidth: nextW,
            });
          }
        }
        return;
      }

      if (interaction.kind !== 'marquee') {
        if (selectionBox) setSelectionBox(null);
        return;
      }

      // Marquee selection box.
      if (!dragged) {
        if (selectionBox) setSelectionBox(null);
        return;
      }

      const direction: 'LTR' | 'RTL' = evt.clientX >= down.x ? 'LTR' : 'RTL';
      setSelectionBox({ start: down.world, current: snapped, direction });
      return;
    }

    if (activeTool === 'move') {
      const moveState = moveRef.current;
      if (moveState) {
        const data = useDataStore.getState();
        const dx = snapped.x - moveState.start.x;
        const dy = snapped.y - moveState.start.y;
        moveState.snapshot.forEach((shape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;

          const diff: Partial<Shape> = {};
          if (shape.x !== undefined) diff.x = clampTiny(shape.x + dx);
          if (shape.y !== undefined) diff.y = clampTiny(shape.y + dy);
          if (shape.points) diff.points = shape.points.map((p) => ({ x: clampTiny(p.x + dx), y: clampTiny(p.y + dy) }));

          if (Object.keys(diff).length) data.updateShape(id, diff, false);

          // Sync text position with engine if this is a text shape
          if (shape.type === 'text' && textToolRef.current) {
            const textId = getTextIdForShape(id);
            if (textId !== null) {
              const meta = textBoxMetaRef.current.get(textId);
              const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
              const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

              const newAnchorX = diff.x ?? shape.x ?? 0;
              const newShapeY = diff.y ?? shape.y ?? 0;
              const height = shape.height ?? 0;
              const newAnchorY = newShapeY + height;
              textToolRef.current.moveText(textId, newAnchorX, newAnchorY, boxMode, constraintWidth);
            }
          }
        });
      }
      return;
    }

    setDraft((prev) => {
      if (prev.kind === 'line') return { ...prev, current: snapped };
      if (prev.kind === 'arrow') return { ...prev, current: snapped };
      if (prev.kind === 'rect' || prev.kind === 'ellipse' || prev.kind === 'polygon') {
        if (!evt.shiftKey) return { ...prev, current: snapped };
        const dx = snapped.x - prev.start.x;
        const dy = snapped.y - prev.start.y;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        const sx = dx === 0 ? 1 : Math.sign(dx);
        const sy = dy === 0 ? 1 : Math.sign(dy);
        return { ...prev, current: { x: prev.start.x + sx * size, y: prev.start.y + sy * size } };
      }
      if (prev.kind === 'polyline') return { ...prev, current: snapped };
      if (prev.kind === 'conduit') return { ...prev, current: snapped };
      return prev;
    });
  };

  const handlePointerUp = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      endPan();
      return;
    }

    if (evt.button !== 0) return;

    // Delegate pointer up when editing text
    if (engineTextEditState.active) {
       textToolRef.current?.handlePointerUp();
       return;
    }

    // Handle text tool creation
    if (activeTool === 'text' && textDragStartRef.current) {
      const world = toWorldPoint(evt, viewTransform);
      const snapped = snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world;
      const start = textDragStartRef.current;
      textDragStartRef.current = null;

      if (textToolRef.current) {
        const dx = snapped.x - start.x;
        const dy = snapped.y - start.y;
        const dragDistance = Math.hypot(dx, dy);

        if (dragDistance > 10) {
          // Drag creates FixedWidth text
          textToolRef.current.handleDrag(start.x, start.y, snapped.x, snapped.y);
        } else {
          // Click creates AutoWidth text
          textToolRef.current.handleClick(start.x, start.y);
        }

        // Focus the text input proxy
        requestAnimationFrame(() => textInputProxyRef.current?.focus());
      }
      setDraft({ kind: 'none' });
      return;
    }

    if (activeTool === 'move') {
      const moveState = moveRef.current;
      moveRef.current = null;
      if (moveState) {
        const data = useDataStore.getState();
        const patches: Patch[] = [];
        moveState.snapshot.forEach((prevShape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;
          const diff: Partial<Shape> = {};
          if (prevShape.x !== curr.x) diff.x = curr.x;
          if (prevShape.y !== curr.y) diff.y = curr.y;
          if (prevShape.points || curr.points) diff.points = curr.points;
          if (Object.keys(diff).length === 0) return;
          patches.push({ type: 'UPDATE', id, diff, prev: prevShape });
        });
        data.saveToHistory(patches);
      }
      return;
    }

    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    const clickNoDrag = !!down && !isDrag(evt.clientX - down.x, evt.clientY - down.y);

    if (activeTool === 'select') {
      if (!down) return;
      const dx = evt.clientX - down.x;
      const dy = evt.clientY - down.y;
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

      const interaction = selectInteractionRef.current;
      selectInteractionRef.current = { kind: 'none' };
      setCursorOverride(null);

      if (interaction.kind === 'move') {
        if (!interaction.moved) return;
        const data = useDataStore.getState();
        const patches: Patch[] = [];
        interaction.state.snapshot.forEach((prevShape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;
          const diff: Partial<Shape> = {};
          if (prevShape.x !== curr.x) diff.x = curr.x;
          if (prevShape.y !== curr.y) diff.y = curr.y;
          if (prevShape.points || curr.points) diff.points = curr.points;
          if (Object.keys(diff).length === 0) return;
          patches.push({ type: 'UPDATE', id, diff, prev: prevShape });
        });
        data.saveToHistory(patches);
        return;
      }

      if (interaction.kind === 'resize') {
        if (!interaction.moved) return;
        const data = useDataStore.getState();
        const prevShape = interaction.state.snapshot;
        const curr = data.shapes[interaction.state.shapeId];
        if (!curr) return;
        const diff: Partial<Shape> = {};
        if (prevShape.x !== curr.x) diff.x = curr.x;
        if (prevShape.y !== curr.y) diff.y = curr.y;
        if (prevShape.width !== curr.width) diff.width = curr.width;
        if (prevShape.height !== curr.height) diff.height = curr.height;
        if (prevShape.scaleX !== curr.scaleX) diff.scaleX = curr.scaleX;
        if (prevShape.scaleY !== curr.scaleY) diff.scaleY = curr.scaleY;
        if (Object.keys(diff).length === 0) return;
        data.saveToHistory([{ type: 'UPDATE', id: curr.id, diff, prev: prevShape }]);
        return;
      }

      if (interaction.kind === 'vertex') {
        if (!interaction.moved) return;
        const data = useDataStore.getState();
        const prevShape = interaction.state.snapshot;
        const curr = data.shapes[interaction.state.shapeId];
        if (!curr) return;
        const diff: Partial<Shape> = {};
        if (prevShape.points || curr.points) diff.points = curr.points;
        if (Object.keys(diff).length === 0) return;
        data.saveToHistory([{ type: 'UPDATE', id: curr.id, diff, prev: prevShape }]);
        return;
      }

      if (interaction.kind !== 'marquee') return;

      if (isDrag(dx, dy)) {
        const direction: 'LTR' | 'RTL' = evt.clientX >= down.x ? 'LTR' : 'RTL';
        const mode: 'WINDOW' | 'CROSSING' = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
        const worldUp = toWorldPoint(evt, viewTransform);
        const rect = normalizeRect(down.world, worldUp);

        const data = useDataStore.getState();
        const ui = useUIStore.getState();
        const queryRect = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
        const candidates = data.spatialIndex
          .query(queryRect)
          .map((c) => data.shapes[c.id])
          .filter(Boolean) as Shape[];

        const selected = new Set<string>();
        for (const shape of candidates) {
          const layer = data.layers.find((l) => l.id === shape.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
          if (!isShapeInSelection(shape, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }, mode)) continue;
          selected.add(shape.id);
        }

        setSelectionBox(null);
        setSelectedShapeIds(selected);
        return;
      }

      // Click selection (no marquee, no drag interactions).
      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hit = pickShape(down.world, screen, tolerance);
      setSelectionBox(null);
      setSelectedShapeIds(hit ? new Set([hit]) : new Set());
      return;
    }

    if (activeTool === 'line') {
      const prev = draftRef.current;
      setDraft({ kind: 'none' });
      if (prev.kind === 'line') commitLine(prev.start, prev.current);
      return;
    }

    if (activeTool === 'rect') {
      const prev = draftRef.current;
      setDraft({ kind: 'none' });
      if (prev.kind === 'rect') {
        if (clickNoDrag) commitDefaultRectAt(prev.start);
        else commitRect(prev.start, prev.current);
      }
      return;
    }

    if (activeTool === 'circle') {
      const prev = draftRef.current;
      setDraft({ kind: 'none' });
      if (prev.kind === 'ellipse') {
        if (clickNoDrag) commitDefaultEllipseAt(prev.start);
        else commitEllipse(prev.start, prev.current);
      }
      return;
    }

    if (activeTool === 'polygon') {
      const prev = draftRef.current;
      setDraft({ kind: 'none' });
      if (prev.kind === 'polygon') {
        if (clickNoDrag) {
          const clampedSides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
          setPolygonSidesValue(clampedSides);
          setPolygonSidesModal({ center: prev.start });
        } else {
          commitPolygon(prev.start, prev.current);
        }
      }
      return;
    }

    if (activeTool === 'arrow') {
      const prev = draftRef.current;
      setDraft({ kind: 'none' });
      if (prev.kind === 'arrow') commitArrow(prev.start, prev.current);
      return;
    }
  };

  const handleDoubleClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    // Determine context for double click
    
    // 1. Text editing
    if (activeTool === 'select') {
      const world = toWorldPoint({
        currentTarget: evt.currentTarget,
        clientX: evt.clientX,
        clientY: evt.clientY
      } as React.PointerEvent<HTMLDivElement>, viewTransform); // Reuse util

      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hitId = pickShape(world, { x: evt.clientX, y: evt.clientY } as Point, tolerance); // Reuse pickShape
        
      if (hitId) {
        const data = useDataStore.getState();
        const shape = data.shapes[hitId];
        if (shape && shape.type === 'text') {
          // Enter edit mode
          const textWrapperId = shape.id;
          const foundTextId = getTextIdForShape(textWrapperId);
          
          if (foundTextId !== null && textToolRef.current) {
            useUIStore.getState().setTool('text');
            
            // Coordinate transform: 
            // Engine Anchor (Top-Left) = shape.y + shape.height
            const anchorY = (shape.y || 0) + (shape.height || 0);
            const anchorX = (shape.x || 0);
            const localX = world.x - anchorX;
            const localY = anchorY - world.y; // World Y up vs Local Y down
            
            const meta = textBoxMetaRef.current.get(foundTextId);
            const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
            const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

            textToolRef.current.handlePointerDown(foundTextId, localX, localY, evt.shiftKey, anchorX, anchorY, shape.rotation || 0, boxMode, constraintWidth, false);
            
            requestAnimationFrame(() => textInputProxyRef.current?.focus());
            return;
          }
        }
      }
    }

    // 2. Polyline finish
    if (activeTool === 'polyline') {
        evt.preventDefault();
        const prev = draftRef.current;
        setDraft({ kind: 'none' });
        if (prev.kind === 'polyline') commitPolyline(prev.current ? [...prev.points, prev.current] : prev.points);
        return;
    }
  };

  const draftSvg = useMemo(() => {
    if (draft.kind === 'none') return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const stroke = toolDefaults.strokeColor || '#22c55e';
    // SVG is rendered in screen space, so keep stroke width in pixels (do not scale with zoom).
    const strokeWidth = Math.max(1, toolDefaults.strokeWidth ?? 2);

    if (draft.kind === 'line') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'arrow') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'rect') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'text') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'ellipse') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'polygon') {
      const sides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2;
      const ry = h / 2;
      const pts = Array.from({ length: sides }, (_, i) => {
        const t = (i / sides) * Math.PI * 2 - Math.PI / 2;
        return { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
      });
      const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <polygon points={pointsAttr} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'conduit') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    const pts = draft.points;
    const pathPts = [...pts, ...(draft.current ? [draft.current] : [])].map((p) => worldToScreen(p, viewTransform));
    const d = pathPts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    return (
      <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
      </svg>
    );
  }, [canvasSize.height, canvasSize.width, draft, toolDefaults.strokeColor, toolDefaults.strokeWidth, viewTransform]);

  const selectionSvg = useMemo(() => {
    if (!selectionBox) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const a = worldToScreen(selectionBox.start, viewTransform);
    const b = worldToScreen(selectionBox.current, viewTransform);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);

    const isWindow = selectionBox.direction === 'LTR';
    const stroke = isWindow ? '#3b82f6' : '#22c55e';
    const fill = isWindow ? 'rgba(59,130,246,0.12)' : 'rgba(34,197,94,0.10)';

    return (
      <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1} strokeDasharray="4 3" />
      </svg>
    );
  }, [canvasSize.height, canvasSize.width, selectionBox, viewTransform]);


  // Important: this is the only interactive layer above the WebGL canvas.
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none', cursor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {draftSvg}
      <SelectionOverlay hideAnchors={engineTextEditState.active} />
      {selectionSvg}
      {/* Engine-native text editing components */}
      <TextInputProxy
        ref={textInputProxyRef}
        active={engineTextEditState.active}
        content={engineTextEditState.content}
        caretIndex={engineTextEditState.caretIndex}
        selectionStart={engineTextEditState.selectionStart}
        selectionEnd={engineTextEditState.selectionEnd}
        positionHint={engineTextEditState.caretPosition ?? undefined}
        onInput={(delta: TextInputDelta) => {
          textToolRef.current?.handleInputDelta(delta);
        }}
        onSelectionChange={(start, end) => {
          textToolRef.current?.handleSelectionChange(start, end);
        }}
        onSpecialKey={(key, e) => {
          textToolRef.current?.handleSpecialKey(key, e);
        }}
      />

      <TextCaretOverlay
        caret={caret}
        selectionRects={selectionRects}
        viewTransform={viewTransform}
        anchor={anchor}
        rotation={rotation}
      />
      {polygonSidesModal ? (
        <>
          <div className="absolute inset-0 z-[60]" onPointerDown={() => setPolygonSidesModal(null)} />
          <div
            className="absolute left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2 w-[280px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3 text-slate-100">
              <div className="text-xs font-semibold mb-2">Lados do polígono</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={3}
                  max={24}
                  value={polygonSidesValue}
                  onChange={(e) => setPolygonSidesValue(Number.parseInt(e.target.value, 10))}
                  className="w-full h-8 bg-slate-800 border border-slate-700 rounded px-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  type="button"
                  className="h-8 px-3 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
                  onClick={() => {
                    const defaultSides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
                    const sides = Number.isFinite(polygonSidesValue) ? polygonSidesValue : defaultSides;
                    commitDefaultPolygonAt(polygonSidesModal.center, sides);
                    setPolygonSidesModal(null);
                  }}
                >
                  OK
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">Min 3, max 24. Tamanho inicial 100×100.</div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default EngineInteractionLayer;
