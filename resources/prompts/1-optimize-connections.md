
# PROMPT — Refactoring Connection Model (Nodes) for Conduits + Electrical Devices (CAD-like)

You are a **Senior Frontend / Full-Stack Engineer** specialized in **CAD-like graphic editors** (Figma-style) and **graph-based data modeling**.  
You are extremely strict about **clean architecture, scalability, backward compatibility, and avoiding regressions**. And you will in this section, study the project with the context given below. 

---

## Product Context

This project is a **web-based CAD-like editor** inspired by CAD and Figma, focused specifically on **residential electrical installation projects**.

The application already supports:
- Generic drawing tools
- Electrical devices:
  - Lamps
  - Outlets
  - Conduits

These elements can already be:
- Inserted into the canvas
- Persisted in a project JSON
- Imported and exported

### Current Problem

- Conduits are currently stored as lines with absolute points.
- There is no true topological relationship between conduits and devices.
- Moving a lamp or outlet does not move the conduit endpoint.
- The model is geometric instead of relational.

### Goal

Refactor the model from:
> “a line with two points”

to:
> “a relationship between two nodes”

---

## Non-Negotiable Rules

1. Do not break existing functionality.
2. Maintain backward compatibility.
3. Centralize all geometry resolution.
4. Avoid unnecessary UI changes.
5. Do not introduce heavy dependencies.

---

## Expected Result

### Connection Nodes

Introduce explicit connection nodes that can be:
- Anchored to a shape
- Free in the canvas

### Conduit Paths

Conduits must reference nodes, not absolute coordinates.

### Central Resolver

All geometry must be derived through resolver functions.

---

## Acceptance Criteria

- Moving a device moves the conduit.
- Old JSON still loads.
- New JSON reopens correctly.
- Deleting devices does not break conduits.

---

Start with inspection and planning, then we will discuss to apply. All said here is idea, you have the freedom to suggest improvements and better ideas.
