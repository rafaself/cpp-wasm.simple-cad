import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngineRuntime, type WasmModule, type CadEngineInstance } from '@/engine/core/EngineRuntime';

// Mock factory
vi.mock('@/engine/bridge/getCadEngineFactory', () => ({
  initCadEngineModule: vi.fn(),
}));
import { initCadEngineModule } from '@/engine/bridge/getCadEngineFactory';
import { EXPECTED_PROTOCOL_INFO } from '@/engine/core/protocol';

describe('TextSystem Cache Optimization', () => {
    let mockEngine: CadEngineInstance;
    let mockModule: WasmModule;
    let currentStats = { generation: 1, rectCount: 0, lineCount: 0, polylineCount: 0, pointCount: 0, triangleVertexCount: 0, lineVertexCount: 0, lastLoadMs: 0, lastRebuildMs: 0 };
    let textMetas = [
        { id: 10, boxMode: 0, constraintWidth: 100 },
        { id: 20, boxMode: 1, constraintWidth: 200 }
    ];

    beforeEach(() => {
        textMetas = [
            { id: 10, boxMode: 0, constraintWidth: 100 },
            { id: 20, boxMode: 1, constraintWidth: 200 }
        ];
        
        mockEngine = {
            // Essential dummies
            getProtocolInfo: vi.fn(() => EXPECTED_PROTOCOL_INFO),
            getCapabilities: vi.fn(() => 0),
            pollEvents: vi.fn(() => ({ generation: 0, count: 0, ptr: 0 })),
            ackResync: vi.fn(),
            getFullSnapshotMeta: vi.fn(() => ({ generation: 0, byteCount: 0, ptr: 0 })),
            allocateEntityId: vi.fn(() => 999),
            getSelectionOutlineMeta: vi.fn(),
            getSelectionHandleMeta: vi.fn(),
            getEntityAabb: vi.fn(),
            getHistoryMeta: vi.fn(),
            canUndo: vi.fn(),
            canRedo: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            clear: vi.fn(),
            
            // Stats & Text
            getStats: vi.fn(() => ({ ...currentStats })),
            
            getAllTextMetas: vi.fn(() => ({
                size: () => textMetas.length,
                get: (i: number) => textMetas[i],
                delete: () => {}
            })),
        } as unknown as CadEngineInstance;

        mockModule = {
            CadEngine: class { constructor() { return mockEngine; } },
            HEAPU8: new Uint8Array(1024),
        } as unknown as WasmModule;

        (initCadEngineModule as any).mockResolvedValue(mockModule);
    });

    it('caches text metas within the same generation', async () => {
        const runtime = await EngineRuntime.create();
        
        // Gen 1
        currentStats.generation = 1;
        
        // First call should trigger fetch
        const meta1 = runtime.getTextEntityMeta(10);
        expect(meta1?.id).toBe(10);
        expect(mockEngine.getAllTextMetas).toHaveBeenCalledTimes(1);

        // Second call for another ID in same gen should use cache
        const meta2 = runtime.getTextEntityMeta(20);
        expect(meta2?.id).toBe(20);
        expect(mockEngine.getAllTextMetas).toHaveBeenCalledTimes(1); // Call count stays 1

        // Third call for same ID
        const meta1Again = runtime.getTextEntityMeta(10);
        expect(meta1Again).toBe(meta1);
        expect(mockEngine.getAllTextMetas).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache when generation increases', async () => {
        const runtime = await EngineRuntime.create();
        
        // Gen 1
        currentStats.generation = 1;
        runtime.getTextEntityMeta(10);
        expect(mockEngine.getAllTextMetas).toHaveBeenCalledTimes(1);

        // Gen 2
        currentStats.generation = 2;
        // Should fetch again
        runtime.getTextEntityMeta(10);
        expect(mockEngine.getAllTextMetas).toHaveBeenCalledTimes(2);
        
        // Same Gen 2 call
        runtime.getTextEntityMeta(20);
        expect(mockEngine.getAllTextMetas).toHaveBeenCalledTimes(2);
    });
});
