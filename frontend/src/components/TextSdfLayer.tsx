import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Shape } from '@/types';
import { TEXT_PADDING, getTextDimensions } from '@/utils/geometry';
import { getEffectiveStrokeColor } from '@/utils/shapeColors';
import { isShapeVisible } from '@/utils/visibility';
import { getFontAtlas, type FontAtlas, type FontStyleKey } from '../next/textSdf/fontAtlas';

type GlyphInstance = {
  originX: number;
  originY: number;
  sizeX: number;
  sizeY: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  r: number;
  g: number;
  b: number;
  a: number;
};

const parseCssColorToRgba = (color: string): { r: number; g: number; b: number; a: number } => {
  const c = color.trim().toLowerCase();
  if (c === 'transparent') return { r: 1, g: 1, b: 1, a: 0 };
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16) / 255;
      const g = Number.parseInt(hex[1] + hex[1], 16) / 255;
      const b = Number.parseInt(hex[2] + hex[2], 16) / 255;
      return { r, g, b, a: 1 };
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
      const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
      const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
      return { r, g, b, a: 1 };
    }
  }
  // Fallback: white
  return { r: 1, g: 1, b: 1, a: 1 };
};

const buildStyleKey = (shape: Shape): FontStyleKey => ({
  fontFamily: shape.fontFamily ?? 'Inter',
  bold: !!shape.bold,
  italic: !!shape.italic,
});

const styleKeyToString = (k: FontStyleKey): string => `${k.fontFamily}|${k.bold ? 'b' : 'n'}${k.italic ? 'i' : 'n'}`;

const buildGeometry = (instances: readonly GlyphInstance[]) => {
  const geom = new THREE.InstancedBufferGeometry();

  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));

  const count = instances.length;
  const origin = new Float32Array(count * 2);
  const size = new Float32Array(count * 2);
  const uvRect = new Float32Array(count * 4);
  const color = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const inst = instances[i];
    origin[i * 2 + 0] = inst.originX;
    origin[i * 2 + 1] = inst.originY;
    size[i * 2 + 0] = inst.sizeX;
    size[i * 2 + 1] = inst.sizeY;
    uvRect[i * 4 + 0] = inst.u0;
    uvRect[i * 4 + 1] = inst.v0;
    uvRect[i * 4 + 2] = inst.u1;
    uvRect[i * 4 + 3] = inst.v1;
    color[i * 4 + 0] = inst.r;
    color[i * 4 + 1] = inst.g;
    color[i * 4 + 2] = inst.b;
    color[i * 4 + 3] = inst.a;
  }

  geom.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(origin, 2));
  geom.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
  geom.setAttribute('iUvRect', new THREE.InstancedBufferAttribute(uvRect, 4));
  geom.setAttribute('iColor', new THREE.InstancedBufferAttribute(color, 4));
  geom.instanceCount = count;

  return geom;
};

const createMaterial = (texture: THREE.Texture) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    uniforms: {
      uAtlas: { value: texture },
    },
    vertexShader: `
      attribute vec2 iOrigin;
      attribute vec2 iSize;
      attribute vec4 iUvRect;
      attribute vec4 iColor;
      varying vec2 vUv;
      varying vec4 vColor;
      void main() {
        vec2 local = position.xy;
        vec2 world = iOrigin + local * iSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world.x, world.y, 0.0, 1.0);
        vUv = vec2(
          mix(iUvRect.x, iUvRect.z, uv.x),
          mix(iUvRect.y, iUvRect.w, uv.y)
        );
        vColor = iColor;
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D uAtlas;
      varying vec2 vUv;
      varying vec4 vColor;
      void main() {
        float dist = texture2D(uAtlas, vUv).r;
        float w = fwidth(dist);
        float alpha = smoothstep(0.5 - w, 0.5 + w, dist);
        gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
      }
    `,
  });

const TextSdfBatch: React.FC<{ atlas: FontAtlas; instances: readonly GlyphInstance[] }> = ({ atlas, instances }) => {
  const [mat] = useState(() => createMaterial(atlas.texture));
  const geom = useMemo(() => buildGeometry(instances), [instances]);

  useEffect(() => {
    return () => {
      geom.dispose();
    };
  }, [geom]);

  useEffect(() => {
    (mat.uniforms.uAtlas.value as THREE.Texture) = atlas.texture;
    mat.needsUpdate = true;
  }, [atlas.texture, mat]);

  useEffect(() => {
    return () => {
      mat.dispose();
    };
  }, [mat]);

  return <mesh geometry={geom} material={mat} frustumCulled={false} />;
};

const TextSdfLayer: React.FC = () => {
  const shapesById = useDataStore((s) => s.shapes);
  const layers = useDataStore((s) => s.layers);
  const { activeFloorId, activeDiscipline } = useUIStore((s) => ({
    activeFloorId: s.activeFloorId ?? 'terreo',
    activeDiscipline: s.activeDiscipline,
  }));

  const textShapes = useMemo(() => {
    const out: Shape[] = [];
    for (const shape of Object.values(shapesById)) {
      if (!shape) continue;
      if (shape.type !== 'text') continue;
      const layer = layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) continue;
      if (!isShapeVisible(shape, { activeFloorId, activeDiscipline })) continue;
      out.push(shape);
    }
    return out;
  }, [activeDiscipline, activeFloorId, layers, shapesById]);

  const styleKeys = useMemo(() => {
    const keys = new Map<string, FontStyleKey>();
    for (const s of textShapes) {
      const k = buildStyleKey(s);
      keys.set(styleKeyToString(k), k);
    }
    return Array.from(keys.values());
  }, [textShapes]);

  const [atlases, setAtlases] = useState<Map<string, FontAtlas>>(new Map());

  useEffect(() => {
    let disposed = false;
    (async () => {
      const next = new Map<string, FontAtlas>();
      for (const k of styleKeys) {
        const atlas = await getFontAtlas(k);
        if (disposed) return;
        next.set(styleKeyToString(k), atlas);
      }
      if (!disposed) setAtlases(next);
    })();
    return () => {
      disposed = true;
    };
  }, [styleKeys]);

  const batches = useMemo(() => {
    const grouped = new Map<string, GlyphInstance[]>();
    for (const s of textShapes) {
      const key = styleKeyToString(buildStyleKey(s));
      const atlas = atlases.get(key);
      if (!atlas) continue;

      const text = s.textContent ?? '';
      const fontSize = s.fontSize ?? 16;
      const lineHeight = s.lineHeight ?? fontSize * 1.2;
      const align = s.align ?? 'left';
      const { width, height, lines } = getTextDimensions(s);

      const layer = layers.find((l) => l.id === s.layerId);
      const stroke = getEffectiveStrokeColor(s, layer);
      const rgba = parseCssColorToRgba(stroke);

      const topY = (s.y ?? 0) + height - TEXT_PADDING;
      const baseX = (s.x ?? 0);
      const innerWidth = Math.max(0, width - TEXT_PADDING * 2);
      const advance = fontSize * 0.6;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex] ?? '';
        const lineWidth = line.length * advance;
        let xStart = baseX + TEXT_PADDING;
        if (align === 'center') xStart = baseX + TEXT_PADDING + (innerWidth - lineWidth) / 2;
        if (align === 'right') xStart = baseX + width - TEXT_PADDING - lineWidth;

        const lineTop = topY - lineIndex * lineHeight;
        const glyphBottom = lineTop - fontSize;

        for (let ci = 0; ci < line.length; ci++) {
          const cp = line.charCodeAt(ci);
          const glyph = atlas.glyphs.get(cp) ?? atlas.glyphs.get(63) ?? atlas.glyphs.get(32);
          if (!glyph) continue;

          const list = grouped.get(key) ?? [];
          list.push({
            originX: xStart + ci * advance,
            originY: glyphBottom,
            sizeX: advance,
            sizeY: fontSize,
            u0: glyph.u0,
            v0: glyph.v0,
            u1: glyph.u1,
            v1: glyph.v1,
            r: rgba.r,
            g: rgba.g,
            b: rgba.b,
            a: rgba.a,
          });
          grouped.set(key, list);
        }
      }
    }
    return grouped;
  }, [atlases, layers, textShapes]);

  return (
    <>
      {Array.from(batches.entries()).map(([key, instances]) => {
        const atlas = atlases.get(key);
        if (!atlas) return null;
        if (instances.length === 0) return null;
        return <TextSdfBatch key={key} atlas={atlas} instances={instances} />;
      })}
    </>
  );
};

export default TextSdfLayer;
