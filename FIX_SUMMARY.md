# Fix Summary – PDF → SVG Displacement

- Swapped PDF `cm` accumulation to pre-multiply incoming matrices in `frontend/features/import/utils/pdfToShapes.ts`, ensuring translations are not scaled by later transforms; added dev-only CTM warning for extreme translations/scales.
- Unskipped the nested-transform regression test and added PDF-based good/bad fixture tests in `frontend/features/import/utils/pdfToShapes.test.ts` that load real operator streams to assert compact bounding boxes and preserved relative positions.

## Why this resolves the issue
Pre-multiplying the incoming `cm` matrix matches PDF spec semantics (`P_global = P_local * M_new * CTM`), preventing subsequent scales from amplifying earlier translations. The new tests reproduce the original failure case (translate then scale) and confirm the corrected coordinates stay within expected bounds.

## How to test locally
1) `cd frontend`
2) `npm install`
3) `npm test`  
   - key checks: “Matrix Order Regression Test”, “known-good PDF within compact bounds”, and “known-bad PDF with nested scale after translate”.

## Known considerations
- Dev-only CTM warning logs trigger for extreme or non-finite matrices; no production impact.
