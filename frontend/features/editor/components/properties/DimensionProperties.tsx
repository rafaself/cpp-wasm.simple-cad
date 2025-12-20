import React from 'react';
import { Shape } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import { Link2, Link2Off, CornerUpLeft } from 'lucide-react';

interface DimensionPropertiesProps {
  selectedShape: Shape;
}

export const DimensionProperties: React.FC<DimensionPropertiesProps> = ({ selectedShape }) => {
  const store = useDataStore();
  const proportionLinked = selectedShape.proportionsLinked ?? false;

  const isElectrical = !!selectedShape.electricalElementId;

  const isRect = selectedShape.type === 'rect';
  const isLine = selectedShape.type === 'line' || selectedShape.type === 'polyline';
  const isArrow = selectedShape.type === 'arrow';
  const isArc = selectedShape.type === 'arc';
  const isCircle = selectedShape.type === 'circle';
  const isPolygon = selectedShape.type === 'polygon';

  const updateProp = (prop: keyof Shape, value: any) => {
    store.updateShape(selectedShape.id, { [prop]: value });
  };

  if (isElectrical) {
    return (
      <div className="p-3 border-b border-slate-100">
        <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2 cursor-default">Dimensões</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Símbolos elétricos têm tamanho fixo definido pelo SVG. Use as camadas para controlar cor e visibilidade.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 border-b border-slate-100">
      <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2 cursor-default">Dimensões</h3>

      {/* W / H for all except pure lines */}
      {!isLine && !isArrow && (
        <div className="flex items-center gap-1 mb-2">
          <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7 hover:border-slate-300 focus-within:border-blue-500 transition-all" title="Largura">
            <span className="text-slate-400 text-[10px] w-3 font-medium">L</span>
            <input
              type="number"
              value={selectedShape.width !== undefined ? Math.round(selectedShape.width) : (selectedShape.radius ? Math.round(selectedShape.radius * 2) : 0)}
              onChange={(e) => {
                const newWidth = parseFloat(e.target.value);
                if (!isNaN(newWidth) && newWidth > 0) {
                    const currentWidth = selectedShape.width ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                    const currentHeight = selectedShape.height ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                    const ratio = currentHeight / currentWidth;

                    if (isCircle || isPolygon) {
                        if (proportionLinked) {
                          const newHeight = newWidth * ratio;
                          store.updateShape(selectedShape.id, { width: newWidth, height: newHeight });
                        } else {
                          updateProp('width', newWidth);
                        }
                    } else if (proportionLinked) {
                        const newHeight = newWidth * ratio;
                        store.updateShape(selectedShape.id, { width: newWidth, height: newHeight });
                    } else {
                        updateProp('width', newWidth);
                    }
                }
              }}
              className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
            />
          </div>

          <button
            onClick={() => store.updateShape(selectedShape.id, { proportionsLinked: !proportionLinked })}
            className={`p-1.5 rounded transition-colors ${proportionLinked ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
            title={proportionLinked ? 'Proporções linkadas' : 'Proporções independentes'}
          >
            {proportionLinked ? <Link2 size={14} /> : <Link2Off size={14} />}
          </button>

          <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7 hover:border-slate-300 focus-within:border-blue-500 transition-all" title="Altura">
            <span className="text-slate-400 text-[10px] w-3 font-medium">A</span>
            <input
              type="number"
              value={selectedShape.height !== undefined ? Math.round(selectedShape.height) : (selectedShape.radius ? Math.round(selectedShape.radius * 2) : 0)}
              onChange={(e) => {
                const newHeight = parseFloat(e.target.value);
                if (!isNaN(newHeight) && newHeight > 0) {
                    const currentWidth = selectedShape.width ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                    const currentHeight = selectedShape.height ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                    const ratio = currentWidth / currentHeight;

                    if (isCircle || isPolygon) {
                        if (proportionLinked) {
                          const newWidth = newHeight * ratio;
                          store.updateShape(selectedShape.id, { width: newWidth, height: newHeight });
                        } else {
                          updateProp('height', newHeight);
                        }
                    } else if (proportionLinked) {
                        const newWidth = newHeight * ratio;
                        store.updateShape(selectedShape.id, { width: newWidth, height: newHeight });
                    } else {
                        updateProp('height', newHeight);
                    }
                }
              }}
              className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
            />
          </div>
        </div>
      )}

      {/* Line/Arrow length */}
      {(isLine || isArrow) && selectedShape.points && selectedShape.points.length >= 2 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-slate-500 w-16 shrink-0">Comprimento</span>
            <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7 focus-within:border-blue-500">
                <input
                    type="number"
                    value={Math.round(Math.sqrt(
                        Math.pow(selectedShape.points[1].x - selectedShape.points[0].x, 2) +
                        Math.pow(selectedShape.points[1].y - selectedShape.points[0].y, 2)
                    ))}
                    onChange={(e) => {
                        const newLen = parseFloat(e.target.value);
                        if (!isNaN(newLen) && newLen >= 0) {
                            const p0 = selectedShape.points[0];
                            const p1 = selectedShape.points[1];
                            const dx = p1.x - p0.x;
                            const dy = p1.y - p0.y;
                            const currentAngle = Math.atan2(dy, dx);

                            // Recalculate P1 based on P0 (origin), angle, and new length
                            const newP1 = {
                                x: p0.x + newLen * Math.cos(currentAngle),
                                y: p0.y + newLen * Math.sin(currentAngle)
                            };

                            // Update the shape with new points
                            store.updateShape(selectedShape.id, { points: [p0, newP1, ...selectedShape.points.slice(2)] });
                        }
                    }}
                    className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono text-right"
                />
                <span className="text-[10px] text-slate-400 ml-1">px</span>
            </div>
          </div>

          {isArrow && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-slate-500 w-16 shrink-0">Tam. Ponta</span>
              <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7 focus-within:border-blue-500">
                  <input
                      type="number"
                      min={5}
                      max={100}
                      value={selectedShape.arrowHeadSize || 15}
                      onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 5 && val <= 100) {
                              updateProp('arrowHeadSize', val);
                          }
                      }}
                      className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono text-right"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">px</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Polygon sides */}
      {isPolygon && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-slate-500 w-10 shrink-0">Lados</span>
          <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7 focus-within:border-blue-500">
              <input
                  type="number"
                  min={3}
                  max={24}
                  value={selectedShape.sides || 3}
                  onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 3 && val <= 24) {
                          updateProp('sides', val);
                      }
                  }}
                  className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono text-right"
              />
          </div>
        </div>
      )}

      {/* Arc angles */}
      {isArc && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7" title="Ângulo Inicial">
              <span className="text-slate-400 text-[9px] w-6">Início</span>
              <input
                  type="number"
                  value={Math.round((selectedShape.startAngle || 0) * (180/Math.PI))}
                  onChange={(e) => {
                      const deg = parseFloat(e.target.value);
                      if (!isNaN(deg)) updateProp('startAngle', deg * (Math.PI/180));
                  }}
                  className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
              />
              <span className="text-slate-400 text-[10px] ml-0.5">°</span>
          </div>
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7" title="Ângulo Final">
              <span className="text-slate-400 text-[9px] w-5">Fim</span>
              <input
                  type="number"
                  value={Math.round((selectedShape.endAngle || 360) * (180/Math.PI))}
                  onChange={(e) => {
                      const deg = parseFloat(e.target.value);
                      if (!isNaN(deg)) updateProp('endAngle', deg * (Math.PI/180));
                  }}
                  className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
              />
              <span className="text-slate-400 text-[10px] ml-0.5">°</span>
          </div>
        </div>
      )}

      {/* Corner Radius (Only for Rects) */}
      {isRect && (
           <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-slate-500 w-16 shrink-0">Arredond.</span>
              <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7">
                  <CornerUpLeft size={10} className="text-slate-400 mr-2" />
                  <input
                      type="number"
                      placeholder="0"
                      disabled
                      className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono text-right disabled:opacity-50"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">px</span>
              </div>
          </div>
      )}
    </div>
  );
};
