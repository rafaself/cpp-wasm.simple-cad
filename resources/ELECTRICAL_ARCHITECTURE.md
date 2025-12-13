# Electrical Architecture

This document describes the architectural changes and data models for the Electrical Design features (Lançamento Elétrico).

## 1. Electrical Elements & Symbols

### Data Model
The system distinguishes between the **Geometric Shape** (on canvas) and the **Electrical Element** (business data).

- **Shape (`Shape`)**:
  - `id`: Unique ID.
  - `type`: 'rect' (for symbols) or 'conduit'.
  - `svgSymbolId`: ID of the library symbol (e.g., 'duplex_outlet').
  - `electricalElementId`: Link to the `ElectricalElement`.
  - `connectionPoint`: Normalized (0-1) anchor point for conduit connections.

- **Electrical Element (`ElectricalElement`)**:
  - `id`: Unique ID.
  - `shapeId`: Link back to the Shape.
  - `category`: 'power', 'lighting', 'conduit', etc.
  - `name`: Shared group name (e.g., 'TUG', 'Lâmpada').
  - `description`: Shared description.
  - `metadata`: JSON object containing specific properties (Voltage, Power, Height, etc.).

### Pre-loading Strategy
To ensure zero-latency rendering of symbols:
- `ShapeRenderer.ts` exports a `preloadElectricalSymbol` function.
- `useLibraryStore.ts` iterates all loaded library symbols and calls `preloadElectricalSymbol` at startup.
- This creates and caches `HTMLImageElement` instances with the default layer colors, ensuring synchronous rendering by `StaticCanvas`.

## 2. Shared Properties Logic

Entities of the same "nature" share common properties like **Name** and **Description**.
- **Nature Definition**: Defined by matching `name` and `category`.
- **Propagation**:
  - When the user edits `Name` or `Description` in the Property Panel, `useDataStore.updateSharedElectricalProperties` is called.
  - This action iterates through all `electricalElements`.
  - It finds all elements matching the *current* name of the edited element.
  - It updates them all to the new value.

## 3. Conduit Connectivity

### Anchoring
- Electrical symbols define a `defaultConnectionPoint` (usually center 0.5, 0.5) in their library definition.
- `getConnectionPoint` helper calculates the absolute world coordinates of this anchor.

### Launching Tool (`conduit`)
- The tool now prioritizes snapping to these **Connection Points** (`connectionPoint`).
- **First Click**: Validates if the user clicked on a valid connection point. If so, snaps `conduitStart` exactly to that point.
- **Second Click**: Validates the end point.
- **Result**: `connectedStartId` and `connectedEndId` are stored on the Conduit shape, enabling logical network analysis.

### Fixes Applied
1.  **Invisible First Render**: Solved by Pre-loading assets.
2.  **Conduit Failure**: Solved by robust start-point validation and connection point snapping in `useCanvasInteraction`.
