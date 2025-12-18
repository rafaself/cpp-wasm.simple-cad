import { describe, it, expect } from 'vitest';
import DxfParser from 'dxf-parser/dist/dxf-parser.js';
import { dxfToSvg } from './dxfToSvg';
import { DxfData } from './types';

describe('dxfToSvg fidelity (Alta Perf)', () => {
  it('renders SPLINE entities as paths', () => {
    // Minimal spline with control points.
    const dxf = `
0
SECTION
2
ENTITIES
0
SPLINE
8
0
70
0
71
3
72
7
73
4
40
0
40
0
40
0
40
1
40
2
40
3
40
3
10
0
20
0
10
10
20
0
10
10
20
10
10
0
20
10
0
ENDSEC
0
EOF
`;
    const data = new DxfParser().parseSync(dxf.trim()) as unknown as DxfData;
    const out = dxfToSvg(data, { floorId: 'f1', defaultLayerId: 'def' });
    expect(out.svgRaw).toContain('<path');
  });

  it('adds stroke-dasharray for non-continuous linetypes when pattern is known', () => {
    const dxf = `
0
SECTION
2
ENTITIES
0
LINE
8
0
6
DASHED
10
0
20
0
11
10
21
0
0
ENDSEC
0
EOF
`;
    const data = new DxfParser().parseSync(dxf.trim()) as unknown as DxfData;
    const out = dxfToSvg(data, { floorId: 'f1', defaultLayerId: 'def' });
    expect(out.svgRaw).toContain('stroke-dasharray="');
  });
});
