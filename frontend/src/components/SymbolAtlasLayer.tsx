import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useDataStore } from '@/stores/useDataStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Shape } from '@/types';
import { isShapeVisible } from '@/utils/visibility';

type SymbolUv = { u0: number; v0: number; u1: number; v1: number };

type AtlasResult = {
  texture: THREE.CanvasTexture;
  uvsBySymbolId: Map<string, SymbolUv>;
};

type Instance = {
  centerX: number;
  centerY: number;
  sizeX: number;
  sizeY: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  sin: number;
  cos: number;
  flipX: number;
  flipY: number;
};

const ensureSvgPixelSize = (svg: string, px: number): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const svgEl = doc.documentElement;
  svgEl.setAttribute('width', String(px));
  svgEl.setAttribute('height', String(px));
  if (!svgEl.getAttribute('preserveAspectRatio')) svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return new XMLSerializer().serializeToString(svgEl);
};

const loadSvgImage = (svg: string, px: number): Promise<HTMLImageElement> => {
  const sized = ensureSvgPixelSize(svg, px);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load SVG image.'));
    img.src = url;
  });
};

const buildAtlas = async (entries: Array<{ id: string; svg: string }>, opts: { cellPx: number; cols: number }): Promise<AtlasResult> => {
  const { cellPx, cols } = opts;
  const rows = Math.ceil(entries.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellPx;
  canvas.height = rows * cellPx;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context for symbol atlas.');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const uvsBySymbolId = new Map<string, SymbolUv>();
  for (let i = 0; i < entries.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = col * cellPx;
    const y0 = row * cellPx;

    const img = await loadSvgImage(entries[i].svg, cellPx);
    ctx.drawImage(img, x0, y0, cellPx, cellPx);

    uvsBySymbolId.set(entries[i].id, {
      u0: x0 / canvas.width,
      v0: y0 / canvas.height,
      u1: (x0 + cellPx) / canvas.width,
      v1: (y0 + cellPx) / canvas.height,
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return { texture, uvsBySymbolId };
};

const buildGeometry = (instances: readonly Instance[]) => {
  const geom = new THREE.InstancedBufferGeometry();

  const positions = new Float32Array([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0.5, 0.5, 0,
    -0.5, 0.5, 0,
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
  const center = new Float32Array(count * 2);
  const size = new Float32Array(count * 2);
  const uvRect = new Float32Array(count * 4);
  const sinCos = new Float32Array(count * 2);
  const flip = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const inst = instances[i];
    center[i * 2 + 0] = inst.centerX;
    center[i * 2 + 1] = inst.centerY;
    size[i * 2 + 0] = inst.sizeX;
    size[i * 2 + 1] = inst.sizeY;
    uvRect[i * 4 + 0] = inst.u0;
    uvRect[i * 4 + 1] = inst.v0;
    uvRect[i * 4 + 2] = inst.u1;
    uvRect[i * 4 + 3] = inst.v1;
    sinCos[i * 2 + 0] = inst.sin;
    sinCos[i * 2 + 1] = inst.cos;
    flip[i * 2 + 0] = inst.flipX;
    flip[i * 2 + 1] = inst.flipY;
  }

  geom.setAttribute('iCenter', new THREE.InstancedBufferAttribute(center, 2));
  geom.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
  geom.setAttribute('iUvRect', new THREE.InstancedBufferAttribute(uvRect, 4));
  geom.setAttribute('iSinCos', new THREE.InstancedBufferAttribute(sinCos, 2));
  geom.setAttribute('iFlip', new THREE.InstancedBufferAttribute(flip, 2));
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
      attribute vec2 iCenter;
      attribute vec2 iSize;
      attribute vec4 iUvRect;
      attribute vec2 iSinCos;
      attribute vec2 iFlip;
      varying vec2 vUv;
      void main() {
        vec2 local = position.xy * iSize * iFlip;
        float s = iSinCos.x;
        float c = iSinCos.y;
        vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
        vec2 world = iCenter + rotated;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world.x, world.y, 0.0, 1.0);
        vUv = vec2(
          mix(iUvRect.x, iUvRect.z, uv.x),
          mix(iUvRect.y, iUvRect.w, uv.y)
        );
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D uAtlas;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uAtlas, vUv);
        if (c.a <= 0.001) discard;
        gl_FragColor = c;
      }
    `,
  });

const SymbolAtlasBatch: React.FC<{ atlas: AtlasResult; instances: readonly Instance[] }> = ({ atlas, instances }) => {
  const geom = useMemo(() => buildGeometry(instances), [instances]);
  const [mat] = useState(() => createMaterial(atlas.texture));

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

const SymbolAtlasLayer: React.FC = () => {
  const shapesById = useDataStore((s) => s.shapes);
  const layers = useDataStore((s) => s.layers);
  const electricalSymbols = useLibraryStore((s) => s.electricalSymbols);
  const { activeFloorId, activeDiscipline } = useUIStore((s) => ({
    activeFloorId: s.activeFloorId ?? 'terreo',
    activeDiscipline: s.activeDiscipline,
  }));

  const atlasEntries = useMemo(() => {
    return Object.values(electricalSymbols).map((sym) => ({ id: sym.id, svg: sym.canvasSvg }));
  }, [electricalSymbols]);

  const [atlas, setAtlas] = useState<AtlasResult | null>(null);

  useEffect(() => {
    if (atlasEntries.length === 0) return;
    let disposed = false;
    (async () => {
      const next = await buildAtlas(atlasEntries, { cellPx: 256, cols: 8 });
      if (!disposed) setAtlas(next);
    })();
    return () => {
      disposed = true;
    };
  }, [atlasEntries]);

  const instances = useMemo(() => {
    if (!atlas) return [];
    const out: Instance[] = [];

    for (const shape of Object.values(shapesById)) {
      if (!shape) continue;
      if (!shape.svgSymbolId) continue;
      if (shape.x === undefined || shape.y === undefined) continue;
      const uv = atlas.uvsBySymbolId.get(shape.svgSymbolId);
      if (!uv) continue;

      const layer = layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) continue;
      if (!isShapeVisible(shape, { activeFloorId, activeDiscipline })) continue;

      const width = shape.width ?? 0;
      const height = shape.height ?? 0;
      if (width <= 0 || height <= 0) continue;

      const rotation = shape.rotation ?? 0;
      out.push({
        centerX: shape.x + width / 2,
        centerY: shape.y + height / 2,
        sizeX: width,
        sizeY: height,
        u0: uv.u0,
        v0: uv.v0,
        u1: uv.u1,
        v1: uv.v1,
        sin: Math.sin(rotation),
        cos: Math.cos(rotation),
        flipX: shape.scaleX ?? 1,
        flipY: shape.scaleY ?? 1,
      });
    }

    return out;
  }, [activeDiscipline, activeFloorId, atlas, layers, shapesById]);

  if (!atlas) return null;
  if (instances.length === 0) return null;

  return <SymbolAtlasBatch atlas={atlas} instances={instances} />;
};

export default SymbolAtlasLayer;

