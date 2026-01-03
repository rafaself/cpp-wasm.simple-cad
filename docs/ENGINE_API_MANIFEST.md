# Engine API Manifest

Source hash: `04b30000945da25c5184bc8dc93fcd1822448d7073d6fea2d5f6bb9ce5359c9e`
Generated at: 2026-01-02T21:32:45.147Z

Bindings:
- cpp/engine/bindings.cpp

| Name | Kind | Owner | Source | TS call sites |
| --- | --- | --- | --- | --- |
| BufferMeta | value_object | render | cpp/engine/bindings.cpp:248 | 17 × frontend/engine/core/CanvasController.ts:9, frontend/engine/core/CanvasController.ts:158, frontend/engine/core/EngineRuntime.ts:23 |
| ByteBufferMeta | value_object | render | cpp/engine/bindings.cpp:255 | — |
| CadEngine | class | core | cpp/engine/bindings.cpp:77 | 6 × frontend/engine/core/EngineRuntime.ts:82, frontend/engine/core/interactionSession.ts:12, frontend/engine/core/wasm-types.ts:245 |
| DocumentDigest | value_object | core | cpp/engine/bindings.cpp:273 | 7 × frontend/engine/core/EngineRuntime.ts:14, frontend/engine/core/EngineRuntime.ts:216, frontend/engine/core/protocol.ts:95 |
| DraftDimensions | value_object | core | cpp/engine/bindings.cpp:312 | 6 × frontend/engine/core/runtime/DraftSystem.ts:3, frontend/engine/core/runtime/DraftSystem.ts:62, frontend/engine/core/runtime/DraftSystem.ts:66 |
| EngineCapability | enum | core | cpp/engine/bindings.cpp:72 | 6 × frontend/engine/core/EngineRuntime.ts:6, frontend/engine/core/EngineRuntime.ts:159, frontend/engine/core/capabilities.ts:1 |
| EngineEvent | value_object | events | cpp/engine/bindings.cpp:260 | 8 × frontend/engine/core/EngineRuntime.ts:15, frontend/engine/core/EngineRuntime.ts:191, frontend/engine/core/engineEventDecoder.ts:1 |
| EngineStats | value_object | core | cpp/engine/bindings.cpp:282 | 5 × frontend/engine/core/protocol.ts:100, frontend/engine/core/runtime/StatsSystem.ts:1, frontend/engine/core/runtime/StatsSystem.ts:7 |
| EntityAabb | value_object | core | cpp/engine/bindings.cpp:305 | 11 × frontend/engine/core/EngineRuntime.ts:17, frontend/engine/core/EngineRuntime.ts:266, frontend/engine/core/EngineRuntime.ts:320 |
| EventBufferMeta | value_object | render | cpp/engine/bindings.cpp:268 | 3 × frontend/engine/core/protocol.ts:164, frontend/engine/core/wasm-types.ts:6, frontend/engine/core/wasm-types.ts:84 |
| HistoryMeta | value_object | history | cpp/engine/bindings.cpp:277 | 11 × frontend/engine/core/EngineRuntime.ts:18, frontend/engine/core/EngineRuntime.ts:221, frontend/engine/core/engineStateSync.ts:4 |
| LayerRecord | value_object | layers | cpp/engine/bindings.cpp:243 | 7 × frontend/engine/core/EngineRuntime.ts:471, frontend/engine/core/protocol.ts:80, frontend/engine/core/runtime/LayerSystem.ts:1 |
| MarqueeMode | enum | interaction | cpp/engine/bindings.cpp:62 | 4 × frontend/engine/core/protocol.ts:45, frontend/engine/core/protocol.ts:301, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:3 |
| OverlayBufferMeta | value_object | render | cpp/engine/bindings.cpp:298 | 17 × frontend/engine/core/EngineRuntime.ts:16, frontend/engine/core/EngineRuntime.ts:312, frontend/engine/core/EngineRuntime.ts:316 |
| PickEntityKind | enum | interaction | cpp/engine/bindings.cpp:28 | 13 × frontend/engine/core/runtime/PickSystem.ts:1, frontend/engine/core/runtime/PickSystem.ts:33, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:9 |
| PickResult | value_object | interaction | cpp/engine/bindings.cpp:226 | 37 × frontend/engine/core/EngineRuntime.ts:46, frontend/engine/core/EngineRuntime.ts:242, frontend/engine/core/EngineRuntime.ts:246 |
| PickSubTarget | enum | interaction | cpp/engine/bindings.cpp:18 | 13 × frontend/engine/core/runtime/PickSystem.ts:1, frontend/engine/core/runtime/PickSystem.ts:24, frontend/engine/core/runtime/PickSystem.ts:34 |
| ProtocolInfo | value_object | core | cpp/engine/bindings.cpp:235 | 6 × frontend/engine/core/EngineRuntime.ts:10, frontend/engine/core/protocol.ts:86, frontend/engine/core/protocol.ts:476 |
| ReorderAction | enum | core | cpp/engine/bindings.cpp:66 | 13 × frontend/engine/core/EngineRuntime.ts:13, frontend/engine/core/EngineRuntime.ts:512, frontend/engine/core/protocol.ts:50 |
| SelectionMode | enum | selection | cpp/engine/bindings.cpp:50 | 41 × frontend/engine/core/EngineRuntime.ts:12, frontend/engine/core/EngineRuntime.ts:283, frontend/engine/core/EngineRuntime.ts:296 |
| SelectionModifier | enum | selection | cpp/engine/bindings.cpp:56 | 15 × frontend/engine/core/protocol.ts:38, frontend/engine/core/protocol.ts:295, frontend/engine/core/protocol.ts:296 |
| TextBoundsResult | value_object | text | cpp/engine/bindings.cpp:364 | 5 × frontend/engine/bridge/textBridge.ts:24, frontend/engine/bridge/textBridge.ts:366, frontend/engine/core/wasm-types.ts:19 |
| TextBoxMode | enum | text | cpp/engine/bindings.cpp:13 | 44 × frontend/engine/bridge/textBridge.ts:26, frontend/engine/bridge/textBridge.ts:425, frontend/engine/tools/TextTool.ts:11 |
| TextCaretPosition | value_object | text | cpp/engine/bindings.cpp:330 | 6 × frontend/engine/bridge/textBridge.ts:20, frontend/engine/bridge/textBridge.ts:329, frontend/engine/core/EngineRuntime.ts:49 |
| TextContentMeta | value_object | text | cpp/engine/bindings.cpp:343 | 4 × frontend/engine/bridge/textBridge.ts:23, frontend/engine/core/wasm-types.ts:18, frontend/engine/core/wasm-types.ts:75 |
| TextEntityMeta | value_object | text | cpp/engine/bindings.cpp:378 | 11 × frontend/engine/core/EngineRuntime.ts:24, frontend/engine/core/EngineRuntime.ts:45, frontend/engine/core/EngineRuntime.ts:458 |
| TextHitResult | value_object | text | cpp/engine/bindings.cpp:325 | 6 × frontend/engine/bridge/textBridge.ts:19, frontend/engine/bridge/textBridge.ts:318, frontend/engine/core/EngineRuntime.ts:48 |
| TextSelectionRect | value_object | text | cpp/engine/bindings.cpp:371 | 15 × frontend/components/TextCaretOverlay.tsx:15, frontend/components/TextCaretOverlay.tsx:37, frontend/components/TextCaretOverlay.tsx:231 |
| TextStyleSnapshot | value_object | text | cpp/engine/bindings.cpp:348 | 15 × frontend/engine/bridge/textBridge.ts:27, frontend/engine/bridge/textBridge.ts:45, frontend/engine/core/wasm-types.ts:21 |
| TextureBufferMeta | value_object | text | cpp/engine/bindings.cpp:336 | 10 × frontend/engine/bridge/textBridge.ts:22, frontend/engine/bridge/textBridge.ts:453, frontend/engine/core/EngineRuntime.ts:51 |
| TransformMode | enum | interaction | cpp/engine/bindings.cpp:39 | 15 × frontend/engine/core/interactionSession.ts:5, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:2, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:41 |
| TransformOpCode | enum | interaction | cpp/engine/bindings.cpp:45 | 14 × frontend/engine/core/interactionSession.ts:12, frontend/engine/core/interactionSession.ts:13, frontend/engine/core/interactionSession.ts:87 |
| VectorLayerRecord | vector | layers | cpp/engine/bindings.cpp:386 | — |
| VectorTextEntityMeta | vector | text | cpp/engine/bindings.cpp:385 | — |
| VectorTextSelectionRect | vector | text | cpp/engine/bindings.cpp:384 | — |
| VectorUInt32 | vector | core | cpp/engine/bindings.cpp:383 | — |
| ackResync | function | core | cpp/engine/bindings.cpp:103 | — |
| allocBytes | function | core | cpp/engine/bindings.cpp:80 | — |
| allocateEntityId | function | core | cpp/engine/bindings.cpp:94 | — |
| allocateLayerId | function | layers | cpp/engine/bindings.cpp:95 | — |
| applyCommandBuffer | function | render | cpp/engine/bindings.cpp:82 | — |
| beginTransform | function | interaction | cpp/engine/bindings.cpp:175 | — |
| canRedo | function | core | cpp/engine/bindings.cpp:99 | — |
| canUndo | function | core | cpp/engine/bindings.cpp:98 | — |
| cancelTransform | function | interaction | cpp/engine/bindings.cpp:207 | — |
| clear | function | core | cpp/engine/bindings.cpp:79 | — |
| clearAtlasDirty | function | render | cpp/engine/bindings.cpp:150 | — |
| clearSelection | function | selection | cpp/engine/bindings.cpp:120 | — |
| clearTransformLog | function | interaction | cpp/engine/bindings.cpp:214 | — |
| commitTransform | function | interaction | cpp/engine/bindings.cpp:206 | — |
| deleteLayer | function | layers | cpp/engine/bindings.cpp:113 | — |
| freeBytes | function | core | cpp/engine/bindings.cpp:81 | — |
| getAllTextMetas | function | text | cpp/engine/bindings.cpp:154 | — |
| getAtlasTextureMeta | function | text | cpp/engine/bindings.cpp:148 | — |
| getCapabilities | function | core | cpp/engine/bindings.cpp:92 | — |
| getCommitResultCount | function | core | cpp/engine/bindings.cpp:209 | — |
| getCommitResultIdsPtr | function | core | cpp/engine/bindings.cpp:210 | — |
| getCommitResultOpCodesPtr | function | core | cpp/engine/bindings.cpp:211 | — |
| getCommitResultPayloadsPtr | function | core | cpp/engine/bindings.cpp:212 | — |
| getDocumentDigest | function | core | cpp/engine/bindings.cpp:96 | — |
| getDraftDimensions | function | core | cpp/engine/bindings.cpp:222 | — |
| getDrawOrderSnapshot | function | snap | cpp/engine/bindings.cpp:126 | — |
| getEntityAabb | function | core | cpp/engine/bindings.cpp:108 | — |
| getEntityFlags | function | core | cpp/engine/bindings.cpp:114 | — |
| getEntityLayer | function | layers | cpp/engine/bindings.cpp:117 | — |
| getFullSnapshotMeta | function | snap | cpp/engine/bindings.cpp:91 | — |
| getHistoryMeta | function | history | cpp/engine/bindings.cpp:97 | — |
| getLayerName | function | layers | cpp/engine/bindings.cpp:111 | — |
| getLayersSnapshot | function | layers | cpp/engine/bindings.cpp:110 | — |
| getLineBufferMeta | function | render | cpp/engine/bindings.cpp:88 | — |
| getLineDownIndex | function | core | cpp/engine/bindings.cpp:165 | — |
| getLineEndIndex | function | core | cpp/engine/bindings.cpp:163 | — |
| getLineStartIndex | function | core | cpp/engine/bindings.cpp:162 | — |
| getLineUpIndex | function | core | cpp/engine/bindings.cpp:164 | — |
| getPositionBufferMeta | function | render | cpp/engine/bindings.cpp:87 | — |
| getProtocolInfo | function | core | cpp/engine/bindings.cpp:93 | — |
| getSelectionBounds | function | selection | cpp/engine/bindings.cpp:109 | — |
| getSelectionGeneration | function | selection | cpp/engine/bindings.cpp:119 | — |
| getSelectionHandleMeta | function | selection | cpp/engine/bindings.cpp:106 | — |
| getSelectionIds | function | selection | cpp/engine/bindings.cpp:118 | — |
| getSelectionOutlineMeta | function | selection | cpp/engine/bindings.cpp:105 | — |
| getSnapOverlayMeta | function | snap | cpp/engine/bindings.cpp:107 | — |
| getSnappedPoint | function | snap | cpp/engine/bindings.cpp:136 | — |
| getSnapshotBufferMeta | function | snap | cpp/engine/bindings.cpp:90 | — |
| getStats | function | core | cpp/engine/bindings.cpp:134 | — |
| getTextBounds | function | text | cpp/engine/bindings.cpp:166 | — |
| getTextCaretPosition | function | text | cpp/engine/bindings.cpp:145 | — |
| getTextContentMeta | function | text | cpp/engine/bindings.cpp:152 | — |
| getTextQuadBufferMeta | function | text | cpp/engine/bindings.cpp:147 | — |
| getTextSelectionRects | function | text | cpp/engine/bindings.cpp:153 | — |
| getTextStyleSnapshot | function | text | cpp/engine/bindings.cpp:155 | — |
| getTransformLogCount | function | interaction | cpp/engine/bindings.cpp:217 | — |
| getTransformLogIdCount | function | interaction | cpp/engine/bindings.cpp:219 | — |
| getTransformLogIdsPtr | function | interaction | cpp/engine/bindings.cpp:220 | — |
| getTransformLogPtr | function | interaction | cpp/engine/bindings.cpp:218 | — |
| getVertexCount | function | core | cpp/engine/bindings.cpp:85 | — |
| getVertexDataPtr | function | core | cpp/engine/bindings.cpp:86 | — |
| getVisualNextCharIndex | function | core | cpp/engine/bindings.cpp:159 | — |
| getVisualPrevCharIndex | function | core | cpp/engine/bindings.cpp:158 | — |
| getWordLeftIndex | function | core | cpp/engine/bindings.cpp:160 | — |
| getWordRightIndex | function | core | cpp/engine/bindings.cpp:161 | — |
| hasPendingEvents | function | events | cpp/engine/bindings.cpp:104 | — |
| hitTestText | function | text | cpp/engine/bindings.cpp:144 | — |
| initializeTextSystem | function | text | cpp/engine/bindings.cpp:141 | — |
| isAtlasDirty | function | render | cpp/engine/bindings.cpp:149 | — |
| isInteractionActive | function | core | cpp/engine/bindings.cpp:208 | — |
| isTextQuadsDirty | function | text | cpp/engine/bindings.cpp:151 | — |
| isTransformLogOverflowed | function | interaction | cpp/engine/bindings.cpp:216 | — |
| loadFont | function | core | cpp/engine/bindings.cpp:142 | — |
| loadFontEx | function | core | cpp/engine/bindings.cpp:143 | — |
| loadSnapshotFromPtr | function | snap | cpp/engine/bindings.cpp:84 | — |
| marqueeSelect | function | interaction | cpp/engine/bindings.cpp:125 | — |
| pick | function | interaction | cpp/engine/bindings.cpp:130 | — |
| pickEx | function | interaction | cpp/engine/bindings.cpp:131 | — |
| pollEvents | function | events | cpp/engine/bindings.cpp:102 | — |
| queryArea | function | core | cpp/engine/bindings.cpp:132 | — |
| queryMarquee | function | interaction | cpp/engine/bindings.cpp:133 | — |
| rebuildTextQuadBuffer | function | text | cpp/engine/bindings.cpp:146 | — |
| redo | function | core | cpp/engine/bindings.cpp:101 | — |
| reorderEntities | function | core | cpp/engine/bindings.cpp:127 | — |
| replayTransformLog | function | interaction | cpp/engine/bindings.cpp:215 | — |
| reserveWorld | function | core | cpp/engine/bindings.cpp:83 | — |
| saveSnapshot | function | snap | cpp/engine/bindings.cpp:89 | — |
| selectByPick | function | interaction | cpp/engine/bindings.cpp:124 | — |
| setEntityFlags | function | core | cpp/engine/bindings.cpp:115 | — |
| setEntityLayer | function | layers | cpp/engine/bindings.cpp:116 | — |
| setLayerProps | function | layers | cpp/engine/bindings.cpp:112 | — |
| setSelection | function | selection | cpp/engine/bindings.cpp:121 | — |
| setSnapOptions | function | snap | cpp/engine/bindings.cpp:135 | — |
| setTextConstraintWidth | function | text | cpp/engine/bindings.cpp:156 | — |
| setTextPosition | function | text | cpp/engine/bindings.cpp:157 | — |
| setTransformLogEnabled | function | interaction | cpp/engine/bindings.cpp:213 | — |
| undo | function | core | cpp/engine/bindings.cpp:100 | — |
| updateTransform | function | interaction | cpp/engine/bindings.cpp:205 | — |