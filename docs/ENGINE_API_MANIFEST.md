# Engine API Manifest

Source hash: `b8c3abad5be4c1012b54018ed75b97f34fa7c68c8f0f45a3a910971f99c6f4b2`
Generated at: 2025-12-29T19:20:43.829Z

Bindings:
- cpp/engine/bindings.cpp

| Name | Kind | Owner | Source | TS call sites |
| --- | --- | --- | --- | --- |
| BufferMeta | value_object | render | cpp/engine/bindings.cpp:208 | 12 × frontend/engine/core/CanvasController.ts:5, frontend/engine/core/CanvasController.ts:82, frontend/engine/core/EngineRuntime.ts:22 |
| ByteBufferMeta | value_object | render | cpp/engine/bindings.cpp:215 | — |
| CadEngine | class | core | cpp/engine/bindings.cpp:77 | 6 × frontend/engine/bridge/textBridge.ts:32, frontend/engine/core/EngineRuntime.ts:58, frontend/engine/core/interactionSession.ts:12 |
| DocumentDigest | value_object | core | cpp/engine/bindings.cpp:233 | 7 × frontend/engine/core/EngineRuntime.ts:9, frontend/engine/core/EngineRuntime.ts:154, frontend/engine/core/protocol.ts:95 |
| EngineCapability | enum | core | cpp/engine/bindings.cpp:72 | 6 × frontend/engine/core/EngineRuntime.ts:2, frontend/engine/core/EngineRuntime.ts:107, frontend/engine/core/capabilities.ts:1 |
| EngineEvent | value_object | events | cpp/engine/bindings.cpp:220 | 8 × frontend/engine/core/EngineRuntime.ts:10, frontend/engine/core/EngineRuntime.ts:129, frontend/engine/core/engineEventDecoder.ts:1 |
| EngineStats | value_object | core | cpp/engine/bindings.cpp:242 | — |
| EntityAabb | value_object | core | cpp/engine/bindings.cpp:262 | 7 × frontend/engine/core/EngineRuntime.ts:12, frontend/engine/core/EngineRuntime.ts:202, frontend/engine/core/protocol.ts:144 |
| EventBufferMeta | value_object | render | cpp/engine/bindings.cpp:228 | 3 × frontend/engine/core/protocol.ts:115, frontend/engine/core/wasm-types.ts:3, frontend/engine/core/wasm-types.ts:73 |
| HistoryMeta | value_object | history | cpp/engine/bindings.cpp:237 | 11 × frontend/engine/core/EngineRuntime.ts:13, frontend/engine/core/EngineRuntime.ts:159, frontend/engine/core/engineStateSync.ts:2 |
| LayerRecord | value_object | layers | cpp/engine/bindings.cpp:203 | 7 × frontend/engine/core/EngineRuntime.ts:286, frontend/engine/core/protocol.ts:80, frontend/engine/core/runtime/LayerSystem.ts:2 |
| MarqueeMode | enum | interaction | cpp/engine/bindings.cpp:62 | 4 × frontend/engine/core/protocol.ts:45, frontend/engine/core/protocol.ts:254, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:5 |
| OverlayBufferMeta | value_object | render | cpp/engine/bindings.cpp:255 | 12 × frontend/engine/core/EngineRuntime.ts:11, frontend/engine/core/EngineRuntime.ts:231, frontend/engine/core/EngineRuntime.ts:235 |
| PickEntityKind | enum | interaction | cpp/engine/bindings.cpp:28 | 14 × frontend/engine/core/runtime/PickSystem.ts:2, frontend/engine/core/runtime/PickSystem.ts:31, frontend/engine/core/runtime/PickSystem.ts:59 |
| PickResult | value_object | interaction | cpp/engine/bindings.cpp:186 | 36 × frontend/engine/core/EngineRuntime.ts:16, frontend/engine/core/EngineRuntime.ts:180, frontend/engine/core/EngineRuntime.ts:184 |
| PickSubTarget | enum | interaction | cpp/engine/bindings.cpp:18 | 9 × frontend/engine/core/runtime/PickSystem.ts:2, frontend/engine/core/runtime/PickSystem.ts:22, frontend/engine/core/runtime/PickSystem.ts:32 |
| ProtocolInfo | value_object | core | cpp/engine/bindings.cpp:195 | 6 × frontend/engine/core/EngineRuntime.ts:5, frontend/engine/core/protocol.ts:86, frontend/engine/core/protocol.ts:382 |
| ReorderAction | enum | core | cpp/engine/bindings.cpp:66 | 13 × frontend/engine/core/EngineRuntime.ts:8, frontend/engine/core/EngineRuntime.ts:327, frontend/engine/core/protocol.ts:50 |
| SelectionMode | enum | selection | cpp/engine/bindings.cpp:50 | 22 × frontend/engine/core/EngineRuntime.ts:7, frontend/engine/core/EngineRuntime.ts:219, frontend/engine/core/EngineRuntime.ts:227 |
| SelectionModifier | enum | selection | cpp/engine/bindings.cpp:56 | 6 × frontend/engine/core/protocol.ts:38, frontend/engine/core/protocol.ts:248, frontend/engine/core/protocol.ts:249 |
| TextBoundsResult | value_object | text | cpp/engine/bindings.cpp:309 | 4 × frontend/engine/bridge/textBridge.ts:25, frontend/engine/bridge/textBridge.ts:48, frontend/engine/bridge/textBridge.ts:414 |
| TextBoxMode | enum | text | cpp/engine/bindings.cpp:13 | 46 × frontend/engine/bridge/textBridge.ts:27, frontend/engine/bridge/textBridge.ts:51, frontend/engine/bridge/textBridge.ts:473 |
| TextCaretPosition | value_object | text | cpp/engine/bindings.cpp:275 | 7 × frontend/engine/bridge/textBridge.ts:21, frontend/engine/bridge/textBridge.ts:41, frontend/engine/bridge/textBridge.ts:377 |
| TextContentMeta | value_object | text | cpp/engine/bindings.cpp:288 | 5 × frontend/engine/bridge/textBridge.ts:24, frontend/engine/bridge/textBridge.ts:47, frontend/engine/core/wasm-types.ts:8 |
| TextEntityMeta | value_object | text | cpp/engine/bindings.cpp:323 | 11 × frontend/engine/core/EngineRuntime.ts:22, frontend/engine/core/EngineRuntime.ts:26, frontend/engine/core/EngineRuntime.ts:273 |
| TextHitResult | value_object | text | cpp/engine/bindings.cpp:270 | 7 × frontend/engine/bridge/textBridge.ts:20, frontend/engine/bridge/textBridge.ts:40, frontend/engine/bridge/textBridge.ts:366 |
| TextSelectionRect | value_object | text | cpp/engine/bindings.cpp:316 | 14 × frontend/components/TextCaretOverlay.tsx:14, frontend/components/TextCaretOverlay.tsx:35, frontend/components/TextCaretOverlay.tsx:209 |
| TextStyleSnapshot | value_object | text | cpp/engine/bindings.cpp:293 | 15 × frontend/engine/bridge/textBridge.ts:28, frontend/engine/bridge/textBridge.ts:52, frontend/engine/bridge/textBridge.ts:73 |
| TextureBufferMeta | value_object | text | cpp/engine/bindings.cpp:281 | 11 × frontend/engine/bridge/textBridge.ts:23, frontend/engine/bridge/textBridge.ts:44, frontend/engine/bridge/textBridge.ts:501 |
| TransformMode | enum | interaction | cpp/engine/bindings.cpp:39 | 5 × frontend/engine/core/interactionSession.ts:5, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:6, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:21 |
| TransformOpCode | enum | interaction | cpp/engine/bindings.cpp:45 | 14 × frontend/engine/core/interactionSession.ts:12, frontend/engine/core/interactionSession.ts:13, frontend/engine/core/interactionSession.ts:73 |
| VectorLayerRecord | vector | layers | cpp/engine/bindings.cpp:331 | — |
| VectorTextEntityMeta | vector | text | cpp/engine/bindings.cpp:330 | — |
| VectorTextSelectionRect | vector | text | cpp/engine/bindings.cpp:329 | — |
| VectorUInt32 | vector | core | cpp/engine/bindings.cpp:328 | — |
| ackResync | function | core | cpp/engine/bindings.cpp:103 | — |
| allocBytes | function | core | cpp/engine/bindings.cpp:80 | — |
| allocateEntityId | function | core | cpp/engine/bindings.cpp:94 | — |
| allocateLayerId | function | layers | cpp/engine/bindings.cpp:95 | — |
| applyCommandBuffer | function | render | cpp/engine/bindings.cpp:82 | — |
| beginTransform | function | interaction | cpp/engine/bindings.cpp:172 | — |
| canRedo | function | core | cpp/engine/bindings.cpp:99 | — |
| canUndo | function | core | cpp/engine/bindings.cpp:98 | — |
| cancelTransform | function | interaction | cpp/engine/bindings.cpp:177 | — |
| clear | function | core | cpp/engine/bindings.cpp:79 | 2 × frontend/utils/benchmarks/pickBenchmarks.ts:241, frontend/utils/benchmarks/pickBenchmarks.ts:242 |
| clearAtlasDirty | function | render | cpp/engine/bindings.cpp:147 | — |
| clearSelection | function | selection | cpp/engine/bindings.cpp:118 | — |
| commitTransform | function | interaction | cpp/engine/bindings.cpp:176 | — |
| deleteLayer | function | layers | cpp/engine/bindings.cpp:111 | 1 × frontend/features/editor/hooks/useEditorLogic.ts:27 |
| freeBytes | function | core | cpp/engine/bindings.cpp:81 | — |
| getAllTextMetas | function | text | cpp/engine/bindings.cpp:151 | — |
| getAtlasTextureMeta | function | text | cpp/engine/bindings.cpp:145 | 1 × frontend/engine/core/CanvasController.ts:78 |
| getCapabilities | function | core | cpp/engine/bindings.cpp:92 | — |
| getCommitResultCount | function | core | cpp/engine/bindings.cpp:179 | — |
| getCommitResultIdsPtr | function | core | cpp/engine/bindings.cpp:180 | — |
| getCommitResultOpCodesPtr | function | core | cpp/engine/bindings.cpp:181 | — |
| getCommitResultPayloadsPtr | function | core | cpp/engine/bindings.cpp:182 | — |
| getDocumentDigest | function | core | cpp/engine/bindings.cpp:96 | — |
| getDrawOrderSnapshot | function | snap | cpp/engine/bindings.cpp:124 | — |
| getEntityAabb | function | core | cpp/engine/bindings.cpp:107 | — |
| getEntityFlags | function | core | cpp/engine/bindings.cpp:112 | — |
| getEntityLayer | function | layers | cpp/engine/bindings.cpp:115 | — |
| getFullSnapshotMeta | function | snap | cpp/engine/bindings.cpp:91 | — |
| getHistoryMeta | function | history | cpp/engine/bindings.cpp:97 | — |
| getLayerName | function | layers | cpp/engine/bindings.cpp:109 | 2 × frontend/engine/core/useEngineLayers.ts:20, frontend/engine/core/useEngineLayers.ts:30 |
| getLayersSnapshot | function | layers | cpp/engine/bindings.cpp:108 | 10 × frontend/engine/core/engineEventResync.ts:20, frontend/engine/core/engineEventResync.ts:21, frontend/engine/core/useEngineEvents.ts:11 |
| getLineBufferMeta | function | render | cpp/engine/bindings.cpp:88 | — |
| getLineDownIndex | function | core | cpp/engine/bindings.cpp:162 | — |
| getLineEndIndex | function | core | cpp/engine/bindings.cpp:160 | — |
| getLineStartIndex | function | core | cpp/engine/bindings.cpp:159 | — |
| getLineUpIndex | function | core | cpp/engine/bindings.cpp:161 | — |
| getPositionBufferMeta | function | render | cpp/engine/bindings.cpp:87 | 1 × frontend/engine/core/CanvasController.ts:70 |
| getProtocolInfo | function | core | cpp/engine/bindings.cpp:93 | — |
| getSelectionGeneration | function | selection | cpp/engine/bindings.cpp:117 | — |
| getSelectionHandleMeta | function | selection | cpp/engine/bindings.cpp:106 | — |
| getSelectionIds | function | selection | cpp/engine/bindings.cpp:116 | — |
| getSelectionOutlineMeta | function | selection | cpp/engine/bindings.cpp:105 | — |
| getSnappedPoint | function | snap | cpp/engine/bindings.cpp:134 | — |
| getSnapshotBufferMeta | function | snap | cpp/engine/bindings.cpp:90 | — |
| getStats | function | core | cpp/engine/bindings.cpp:132 | 7 × frontend/components/dev/PerformanceMonitor.tsx:91, frontend/components/dev/PerformanceMonitor.tsx:92, frontend/hooks/usePickThrottle.ts:179 |
| getTextBounds | function | text | cpp/engine/bindings.cpp:163 | — |
| getTextCaretPosition | function | text | cpp/engine/bindings.cpp:142 | — |
| getTextContentMeta | function | text | cpp/engine/bindings.cpp:149 | — |
| getTextQuadBufferMeta | function | text | cpp/engine/bindings.cpp:144 | 1 × frontend/engine/core/CanvasController.ts:77 |
| getTextSelectionRects | function | text | cpp/engine/bindings.cpp:150 | — |
| getTextStyleSnapshot | function | text | cpp/engine/bindings.cpp:152 | — |
| getVertexCount | function | core | cpp/engine/bindings.cpp:85 | — |
| getVertexDataPtr | function | core | cpp/engine/bindings.cpp:86 | — |
| getVisualNextCharIndex | function | core | cpp/engine/bindings.cpp:156 | — |
| getVisualPrevCharIndex | function | core | cpp/engine/bindings.cpp:155 | — |
| getWordLeftIndex | function | core | cpp/engine/bindings.cpp:157 | — |
| getWordRightIndex | function | core | cpp/engine/bindings.cpp:158 | — |
| hasPendingEvents | function | events | cpp/engine/bindings.cpp:104 | — |
| hitTestText | function | text | cpp/engine/bindings.cpp:141 | — |
| initializeTextSystem | function | text | cpp/engine/bindings.cpp:139 | — |
| isAtlasDirty | function | render | cpp/engine/bindings.cpp:146 | — |
| isInteractionActive | function | core | cpp/engine/bindings.cpp:178 | — |
| isTextQuadsDirty | function | text | cpp/engine/bindings.cpp:148 | 1 × frontend/engine/core/CanvasController.ts:73 |
| loadFont | function | core | cpp/engine/bindings.cpp:140 | — |
| loadSnapshotFromPtr | function | snap | cpp/engine/bindings.cpp:84 | — |
| marqueeSelect | function | interaction | cpp/engine/bindings.cpp:123 | — |
| pick | function | interaction | cpp/engine/bindings.cpp:128 | — |
| pickEx | function | interaction | cpp/engine/bindings.cpp:129 | — |
| pollEvents | function | events | cpp/engine/bindings.cpp:102 | — |
| queryArea | function | core | cpp/engine/bindings.cpp:130 | — |
| queryMarquee | function | interaction | cpp/engine/bindings.cpp:131 | 2 × frontend/features/editor/interactions/handlers/SelectionHandler.tsx:143, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:145 |
| rebuildTextQuadBuffer | function | text | cpp/engine/bindings.cpp:143 | 1 × frontend/engine/core/CanvasController.ts:74 |
| redo | function | core | cpp/engine/bindings.cpp:101 | — |
| reorderEntities | function | core | cpp/engine/bindings.cpp:125 | — |
| reserveWorld | function | core | cpp/engine/bindings.cpp:83 | — |
| saveSnapshot | function | snap | cpp/engine/bindings.cpp:89 | — |
| selectByPick | function | interaction | cpp/engine/bindings.cpp:122 | — |
| setEntityFlags | function | core | cpp/engine/bindings.cpp:113 | — |
| setEntityLayer | function | layers | cpp/engine/bindings.cpp:114 | — |
| setLayerProps | function | layers | cpp/engine/bindings.cpp:110 | 4 × frontend/features/editor/components/EditorSidebar.tsx:33, frontend/features/editor/components/EditorSidebar.tsx:41, frontend/features/editor/components/LayerManagerModal.tsx:34 |
| setSelection | function | selection | cpp/engine/bindings.cpp:119 | — |
| setSnapOptions | function | snap | cpp/engine/bindings.cpp:133 | — |
| setTextConstraintWidth | function | text | cpp/engine/bindings.cpp:153 | — |
| setTextPosition | function | text | cpp/engine/bindings.cpp:154 | — |
| undo | function | core | cpp/engine/bindings.cpp:100 | — |
| updateTransform | function | interaction | cpp/engine/bindings.cpp:175 | — |