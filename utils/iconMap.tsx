import React from 'react';
import { 
  MousePointer2, Hand, Minus, Circle, Square, Hexagon, Activity, 
  MoveDiagonal, Ruler, Trash2, Combine, Spline, Layers, Palette,
  Scan, Expand, Settings, Undo, Redo,
  AlignLeft, AlignCenterHorizontal, AlignRight,
  AlignVerticalJustifyStart, AlignCenterVertical, AlignVerticalJustifyEnd,
  Type, Move, RotateCw
} from 'lucide-react';

export const IconMap: Record<string, React.ReactNode> = {
  'Line': <Minus size={20} className="transform -rotate-45" />,
  'Polyline': <Activity size={20} />,
  'Circle': <Circle size={20} />,
  'Arc': <Spline size={20} />,
  'Rect': <Square size={20} />,
  'Polygon': <Hexagon size={20} />,
  'Select': <MousePointer2 size={20} />,
  'Delete': <Trash2 size={18} />,
  'Join': <Combine size={18} />,
  'Explode': <Expand size={18} />,
  'Measure': <Ruler size={24} />,
  'Hand': <Hand size={24} />,
  'Layers': <Layers size={16} />,
  'Palette': <Palette size={16} />,
  'Scan': <Scan size={24} />,
  'Settings': <Settings size={20} />,
  'Undo': <Undo size={20} />,
  'Redo': <Redo size={20} />,
  'AlignLeft': <AlignLeft size={18} />,
  'AlignCenterH': <AlignCenterHorizontal size={18} />,
  'AlignRight': <AlignRight size={18} />,
  'AlignTop': <AlignVerticalJustifyStart size={18} />,
  'AlignMiddle': <AlignCenterVertical size={18} />,
  'AlignBottom': <AlignVerticalJustifyEnd size={18} />,
  'Text': <Type size={20} />,
  'Move': <Move size={20} />,
  'Rotate': <RotateCw size={20} />,
};

export const getIcon = (key: string) => IconMap[key] || <div className="w-4 h-4 bg-red-500" />;