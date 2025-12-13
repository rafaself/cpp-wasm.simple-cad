import React, { useMemo, useState } from 'react';
import { GitBranch, Plus, ArrowRight, RefreshCw } from 'lucide-react';
import { DiagramNodeKind, Shape } from '../../types';
import { useDataStore } from '../../stores/useDataStore';
import { useUIStore } from '../../stores/useUIStore';
import { getDefaultColorMode } from '../../utils/shapeColors';
import { getShapeCenter } from '../../utils/geometry';
import { generateId } from '../../utils/uuid';

type NodePreset = {
  kind: DiagramNodeKind;
  label: string;
  width: number;
  height: number;
  shape: 'rect' | 'circle';
};

const NODE_PRESETS: NodePreset[] = [
  { kind: 'board', label: 'Quadro', width: 160, height: 90, shape: 'rect' },
  { kind: 'circuit-group', label: 'Circuitos', width: 150, height: 80, shape: 'rect' },
  { kind: 'circuit', label: 'Circuito', width: 140, height: 70, shape: 'rect' },
  { kind: 'command', label: 'Comando', width: 140, height: 64, shape: 'rect' },
  { kind: 'load', label: 'Ponto', width: 140, height: 64, shape: 'circle' },
  { kind: 'note', label: 'Nota', width: 180, height: 110, shape: 'rect' },
];

const diagramLayerDefaults = {
  strokeColor: '#475569',
  fillColor: '#ffffff',
  fillEnabled: true,
  strokeEnabled: true,
  isNative: true,
};

const DiagramPanel: React.FC = () => {
  const dataStore = useDataStore();
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const setSelectedShapeIds = useUIStore((s) => s.setSelectedShapeIds);
  const setTool = useUIStore((s) => s.setTool);

  const [edgeFrom, setEdgeFrom] = useState<string>('');
  const [edgeTo, setEdgeTo] = useState<string>('');
  const [edgeLabel, setEdgeLabel] = useState<string>('');

  const nodes = useMemo(() => Object.values(dataStore.diagramNodes), [dataStore.diagramNodes]);
  const edges = useMemo(() => Object.values(dataStore.diagramEdges), [dataStore.diagramEdges]);

  const worldCenter = {
    x: (canvasSize.width / 2 - viewTransform.x) / viewTransform.scale,
    y: (canvasSize.height / 2 - viewTransform.y) / viewTransform.scale,
  };

  const handleAddNode = (preset: NodePreset) => {
    const diagramLayerId = dataStore.ensureLayer('Diagrama', diagramLayerDefaults);
    const baseId = generateId();
    const shapeId = `shape-${baseId}`;
    const nodeId = `node-${baseId}`;
    const shape: Shape = {
      id: shapeId,
      layerId: diagramLayerId,
      type: preset.shape === 'circle' ? 'circle' : 'rect',
      x: worldCenter.x - preset.width / 2,
      y: worldCenter.y - preset.height / 2,
      width: preset.width,
      height: preset.height,
      strokeColor: diagramLayerDefaults.strokeColor,
      strokeWidth: 2,
      strokeEnabled: true,
      fillColor: diagramLayerDefaults.fillColor,
      fillEnabled: true,
      colorMode: getDefaultColorMode(),
      points: [],
      textContent: preset.label,
      fontSize: 14,
      align: 'center',
      diagramNodeId: nodeId,
    };

    const node = {
      id: nodeId,
      shapeId,
      kind: preset.kind,
      title: preset.label,
    };

    dataStore.addShape(shape, undefined, { node });
    dataStore.syncDiagramEdgesGeometry();
    setSelectedShapeIds(new Set([shapeId]));
    setTool('select');
  };

  const handleConnect = () => {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;

    const diagramLayerId = dataStore.ensureLayer('Diagrama', diagramLayerDefaults);

    const hasDuplicate = edges.some(
      (e) => (e.fromId === edgeFrom && e.toId === edgeTo) || (e.fromId === edgeTo && e.toId === edgeFrom)
    );
    if (hasDuplicate) return;

    const fromNode = dataStore.diagramNodes[edgeFrom];
    const toNode = dataStore.diagramNodes[edgeTo];
    if (!fromNode || !toNode) return;

    const fromShape = dataStore.shapes[fromNode.shapeId];
    const toShape = dataStore.shapes[toNode.shapeId];
    if (!fromShape || !toShape) return;

    const start = getShapeCenter(fromShape);
    const end = getShapeCenter(toShape);

    const edgeBase = generateId();
    const edgeId = `edge-${edgeBase}`;
    const shapeId = `edge-shape-${edgeBase}`;
    const edgeShape: Shape = {
      id: shapeId,
      layerId: diagramLayerId,
      type: 'arrow',
      points: [start, end],
      strokeColor: diagramLayerDefaults.strokeColor,
      strokeWidth: 2,
      strokeEnabled: true,
      fillColor: 'transparent',
      fillEnabled: false,
      colorMode: getDefaultColorMode(),
      arrowHeadSize: 14,
      label: edgeLabel || undefined,
      diagramEdgeId: edgeId,
    };

    const edge = {
      id: edgeId,
      shapeId,
      fromId: edgeFrom,
      toId: edgeTo,
      label: edgeLabel || undefined,
    };

    dataStore.addShape(edgeShape, undefined, { edge });
    dataStore.syncDiagramEdgesGeometry();
    setEdgeLabel('');
  };

  const handleAutoStack = () => {
    if (nodes.length === 0) return;
    const ordered = [...nodes].sort((a, b) => a.title.localeCompare(b.title));
    let cursorY = worldCenter.y - (ordered.length * 140) / 2;

    ordered.forEach((node) => {
      const shape = dataStore.shapes[node.shapeId];
      if (!shape) return;
      const width = shape.width ?? 140;
      const height = shape.height ?? 70;
      const next = {
        x: worldCenter.x - width / 2,
        y: cursorY,
      };
      cursorY += height + 40;
      dataStore.updateShape(shape.id, next);
    });
    dataStore.syncDiagramEdgesGeometry();
  };

  return (
    <div className="flex flex-col gap-3 h-full text-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <GitBranch size={16} className="text-blue-600" />
          <span>Diagrama unifilar</span>
        </div>
        <button
          onClick={handleAutoStack}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={12} />
          Dispor
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {NODE_PRESETS.map((preset) => (
          <button
            key={preset.kind}
            onClick={() => handleAddNode(preset)}
            className="border border-slate-200 rounded-lg p-2 bg-white hover:border-blue-400 hover:shadow-sm transition-colors text-left"
          >
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{preset.label}</span>
              <Plus size={14} className="text-blue-500" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {preset.kind === 'board' && 'Alimenta e protege circuitos.'}
              {preset.kind === 'circuit-group' && 'Agrupa ramais do quadro.'}
              {preset.kind === 'circuit' && 'Representa um circuito individual.'}
              {preset.kind === 'command' && 'Chave ou comando de iluminação.'}
              {preset.kind === 'load' && 'Tomada ou ponto de iluminação.'}
              {preset.kind === 'note' && 'Anotação ou quadro de texto.'}
            </p>
          </button>
        ))}
      </div>

      <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/80 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
          <ArrowRight size={14} className="text-blue-600" />
          <span>Criar ligação</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={edgeFrom}
            onChange={(e) => setEdgeFrom(e.target.value)}
            className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Origem</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
          <select
            value={edgeTo}
            onChange={(e) => setEdgeTo(e.target.value)}
            className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Destino</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </div>
        <input
          value={edgeLabel}
          onChange={(e) => setEdgeLabel(e.target.value)}
          placeholder="Rótulo opcional (ex.: Circuito 1)"
          className="border border-slate-200 rounded px-2 py-1 text-sm bg-white"
        />
        <button
          onClick={handleConnect}
          disabled={!edgeFrom || !edgeTo || edgeFrom === edgeTo}
          className="flex items-center justify-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md py-2 disabled:opacity-60"
        >
          <Plus size={14} />
          Conectar
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white">
        <div className="text-[11px] font-semibold text-slate-600 uppercase px-1 mb-2">Nós</div>
        {nodes.length === 0 && <div className="text-xs text-slate-500 px-1">Nenhum nó adicionado.</div>}
        <div className="flex flex-col gap-1">
          {nodes.map((node) => {
            const outCount = edges.filter((e) => e.fromId === node.id).length;
            const inCount = edges.filter((e) => e.toId === node.id).length;
            return (
              <div
                key={node.id}
                className="flex items-center justify-between px-2 py-1 rounded border border-slate-100 bg-slate-50 text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-800">{node.title}</span>
                  <span className="text-[10px] text-slate-500">
                    {node.kind} • {inCount} in / {outCount} out
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DiagramPanel;
