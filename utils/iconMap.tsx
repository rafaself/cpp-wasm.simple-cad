import React from 'react';
import { 
  MousePointer2, Hand, Minus, Circle, Square, Hexagon, Activity, 
  MoveDiagonal, Ruler, Trash2, Combine, Spline, Layers, Palette,
  Scan, Link
} from 'lucide-react';

export const IconMap: Record<string, React.ReactNode> = {
  'Line': <Minus size={20} className="transform -rotate-45" />,
  'Polyline': <Activity size={20} />,
  'Circle': <Circle size={20} />,
  'Arc': <Combine size={20} />,
  'Rect': <Square size={20} />,
  'Polygon': <Hexagon size={20} />,
  'Select': <MousePointer2 size={20} />,
  'Delete': <Trash2 size={18} />,
  'Join': <Link size={18} />,
  'Explode': <Spline size={18} />,
  'Measure': <Ruler size={24} />,
  'Hand': <Hand size={24} />,
  'Layers': <Layers size={16} />,
  'Palette': <Palette size={16} />,
  'Scan': <Scan size={24} />,
};

export const getIcon = (key: string) => IconMap[key] || <div className="w-4 h-4 bg-red-500" />;