import { describe, expect, it } from 'vitest';

import { svgToVectorDocumentV1 } from './svgToVectorDocument';

describe('svgToVectorDocumentV1', () => {
  it('parses basic path with style', () => {
    const svg = `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <path d="M 0 0 L 10 0 L 10 10 Z" fill="#ff0000" stroke="#00ff00" stroke-width="2" fill-rule="evenodd"/>
    </svg>`;
    const doc = svgToVectorDocumentV1(svg);
    expect(doc.version).toBe(1);
    expect(doc.paths.length).toBe(1);
    expect(doc.draws.length).toBe(1);
    expect(doc.draws[0]!.style.fill?.color).toBe('#ff0000');
    expect(doc.draws[0]!.style.stroke?.color).toBe('#00ff00');
    expect(doc.draws[0]!.style.stroke?.width).toBe(2);
    expect(doc.draws[0]!.style.fillRule).toBe('evenodd');
  });

  it('applies nested transforms via draw.transform', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(10 0)">
        <path d="M0 0 L1 0" />
      </g>
    </svg>`;
    const doc = svgToVectorDocumentV1(svg);
    expect(doc.draws).toHaveLength(1);
    expect(doc.draws[0]!.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 0 });
  });

  it('dedupes referenced shapes via <use>', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path id="p" d="M0 0 L1 0 L1 1 Z" />
      </defs>
      <use href="#p" x="10" />
      <use href="#p" x="20" />
    </svg>`;
    const doc = svgToVectorDocumentV1(svg);
    expect(doc.paths.length).toBe(1);
    expect(doc.draws.length).toBe(2);
    expect(doc.draws[0]!.pathId).toBe(doc.draws[1]!.pathId);
  });

  it('emits clipStack for clip-path url()', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="clip">
          <rect x="0" y="0" width="5" height="5" />
        </clipPath>
      </defs>
      <g clip-path="url(#clip)">
        <path d="M0 0 L10 0 L10 10 Z" />
      </g>
    </svg>`;
    const doc = svgToVectorDocumentV1(svg);
    expect(doc.draws).toHaveLength(1);
    expect(doc.draws[0]!.clipStack?.length).toBe(1);
    expect(doc.draws[0]!.clipStack?.[0]!.pathId).toBeDefined();
  });
});

