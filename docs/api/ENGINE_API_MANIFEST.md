# Engine API Manifest

Source hash: `8df4170a4533d8bfbd623af688ac6821d38314a9e6689ca9e0709d1c4cd509a5`
Generated at: 2026-01-04T15:40:08.948Z

Bindings:
- cpp/engine/bindings.cpp

| Name | Kind | Owner | Source | TS call sites |
| --- | --- | --- | --- | --- |
| BufferMeta | value_object | render | cpp/engine/bindings.cpp:249 | 17 × frontend/engine/core/CanvasController.ts:7, frontend/engine/core/CanvasController.ts:157, frontend/engine/core/EngineRuntime.ts:23 |
| ByteBufferMeta | value_object | render | cpp/engine/bindings.cpp:256 | — |
| CadEngine | class | core | cpp/engine/bindings.cpp:77 | 6 × frontend/engine/core/EngineRuntime.ts:82, frontend/engine/core/interactionSession.ts:12, frontend/engine/core/wasm-types.ts:253 |
| DocumentDigest | value_object | core | cpp/engine/bindings.cpp:274 | 7 × frontend/engine/core/EngineRuntime.ts:14, frontend/engine/core/EngineRuntime.ts:216, frontend/engine/core/protocol.ts:95 |
| DraftDimensions | value_object | core | cpp/engine/bindings.cpp:313 | 6 × frontend/engine/core/runtime/DraftSystem.ts:3, frontend/engine/core/runtime/DraftSystem.ts:62, frontend/engine/core/runtime/DraftSystem.ts:66 |
| EngineCapability | enum | core | cpp/engine/bindings.cpp:72 | 6 × frontend/engine/core/EngineRuntime.ts:6, frontend/engine/core/EngineRuntime.ts:159, frontend/engine/core/capabilities.ts:1 |
| EngineEvent | value_object | events | cpp/engine/bindings.cpp:261 | 8 × frontend/engine/core/EngineRuntime.ts:15, frontend/engine/core/EngineRuntime.ts:191, frontend/engine/core/engineEventDecoder.ts:1 |
| EngineStats | value_object | core | cpp/engine/bindings.cpp:283 | 5 × frontend/engine/core/protocol.ts:100, frontend/engine/core/runtime/StatsSystem.ts:1, frontend/engine/core/runtime/StatsSystem.ts:7 |
| EntityAabb | value_object | core | cpp/engine/bindings.cpp:306 | 11 × frontend/engine/core/EngineRuntime.ts:17, frontend/engine/core/EngineRuntime.ts:266, frontend/engine/core/EngineRuntime.ts:320 |
| EventBufferMeta | value_object | render | cpp/engine/bindings.cpp:269 | 3 × frontend/engine/core/protocol.ts:164, frontend/engine/core/wasm-types.ts:6, frontend/engine/core/wasm-types.ts:85 |
| HistoryMeta | value_object | history | cpp/engine/bindings.cpp:278 | 11 × frontend/engine/core/EngineRuntime.ts:18, frontend/engine/core/EngineRuntime.ts:221, frontend/engine/core/engineStateSync.ts:4 |
| LayerRecord | value_object | layers | cpp/engine/bindings.cpp:244 | 7 × frontend/engine/core/EngineRuntime.ts:471, frontend/engine/core/protocol.ts:80, frontend/engine/core/runtime/LayerSystem.ts:1 |
| MarqueeMode | enum | interaction | cpp/engine/bindings.cpp:62 | 4 × frontend/engine/core/protocol.ts:45, frontend/engine/core/protocol.ts:305, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:3 |
| OverlayBufferMeta | value_object | render | cpp/engine/bindings.cpp:299 | 17 × frontend/engine/core/EngineRuntime.ts:16, frontend/engine/core/EngineRuntime.ts:312, frontend/engine/core/EngineRuntime.ts:316 |
| PickEntityKind | enum | interaction | cpp/engine/bindings.cpp:28 | 13 × frontend/engine/core/runtime/PickSystem.ts:1, frontend/engine/core/runtime/PickSystem.ts:33, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:9 |
| PickResult | value_object | interaction | cpp/engine/bindings.cpp:227 | 37 × frontend/engine/core/EngineRuntime.ts:46, frontend/engine/core/EngineRuntime.ts:242, frontend/engine/core/EngineRuntime.ts:246 |
| PickSubTarget | enum | interaction | cpp/engine/bindings.cpp:18 | 13 × frontend/engine/core/runtime/PickSystem.ts:1, frontend/engine/core/runtime/PickSystem.ts:24, frontend/engine/core/runtime/PickSystem.ts:34 |
| ProtocolInfo | value_object | core | cpp/engine/bindings.cpp:236 | 6 × frontend/engine/core/EngineRuntime.ts:10, frontend/engine/core/protocol.ts:86, frontend/engine/core/protocol.ts:454 |
| ReorderAction | enum | core | cpp/engine/bindings.cpp:66 | 13 × frontend/engine/core/EngineRuntime.ts:13, frontend/engine/core/EngineRuntime.ts:512, frontend/engine/core/protocol.ts:50 |
| SelectionMode | enum | selection | cpp/engine/bindings.cpp:50 | 41 × frontend/engine/core/EngineRuntime.ts:12, frontend/engine/core/EngineRuntime.ts:283, frontend/engine/core/EngineRuntime.ts:296 |
| SelectionModifier | enum | selection | cpp/engine/bindings.cpp:56 | 15 × frontend/engine/core/protocol.ts:38, frontend/engine/core/protocol.ts:299, frontend/engine/core/protocol.ts:300 |
| TextBoundsResult | value_object | text | cpp/engine/bindings.cpp:369 | 5 × frontend/engine/bridge/textBridge.ts:25, frontend/engine/bridge/textBridge.ts:443, frontend/engine/core/wasm-types.ts:19 |
| TextBoxMode | enum | text | cpp/engine/bindings.cpp:13 | 44 × frontend/engine/bridge/textBridge.ts:27, frontend/engine/bridge/textBridge.ts:502, frontend/engine/tools/TextTool.ts:11 |
| TextCaretPosition | value_object | text | cpp/engine/bindings.cpp:331 | 6 × frontend/engine/bridge/textBridge.ts:21, frontend/engine/bridge/textBridge.ts:371, frontend/engine/core/EngineRuntime.ts:49 |
| TextContentMeta | value_object | text | cpp/engine/bindings.cpp:344 | 4 × frontend/engine/bridge/textBridge.ts:24, frontend/engine/core/wasm-types.ts:18, frontend/engine/core/wasm-types.ts:76 |
| TextEntityMeta | value_object | text | cpp/engine/bindings.cpp:383 | 11 × frontend/engine/core/EngineRuntime.ts:24, frontend/engine/core/EngineRuntime.ts:45, frontend/engine/core/EngineRuntime.ts:458 |
| TextHitResult | value_object | text | cpp/engine/bindings.cpp:326 | 6 × frontend/engine/bridge/textBridge.ts:20, frontend/engine/bridge/textBridge.ts:360, frontend/engine/core/EngineRuntime.ts:48 |
| TextSelectionRect | value_object | text | cpp/engine/bindings.cpp:376 | 15 × frontend/components/TextCaretOverlay.tsx:17, frontend/components/TextCaretOverlay.tsx:38, frontend/components/TextCaretOverlay.tsx:232 |
| TextStyleSnapshot | value_object | text | cpp/engine/bindings.cpp:349 | 14 × frontend/engine/bridge/textBridge.ts:28, frontend/engine/bridge/textBridge.ts:52, frontend/engine/core/wasm-types.ts:21 |
| TextureBufferMeta | value_object | text | cpp/engine/bindings.cpp:337 | 10 × frontend/engine/bridge/textBridge.ts:23, frontend/engine/bridge/textBridge.ts:531, frontend/engine/core/EngineRuntime.ts:51 |
| TransformMode | enum | interaction | cpp/engine/bindings.cpp:39 | 15 × frontend/engine/core/interactionSession.ts:5, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:2, frontend/features/editor/interactions/handlers/SelectionHandler.tsx:41 |
| TransformOpCode | enum | interaction | cpp/engine/bindings.cpp:45 | 14 × frontend/engine/core/interactionSession.ts:12, frontend/engine/core/interactionSession.ts:13, frontend/engine/core/interactionSession.ts:87 |
| VectorLayerRecord | vector | layers | cpp/engine/bindings.cpp:392 | — |
| VectorTextEntityMeta | vector | text | cpp/engine/bindings.cpp:391 | — |
| VectorTextSelectionRect | vector | text | cpp/engine/bindings.cpp:390 | — |
| VectorUInt32 | vector | core | cpp/engine/bindings.cpp:389 | — |
| ackResync | function | core | cpp/engine/bindings.cpp:103 | — |
| allocBytes | function | core | cpp/engine/bindings.cpp:80 | — |
| allocateEntityId | function | core | cpp/engine/bindings.cpp:94 | — |
| allocateLayerId | function | layers | cpp/engine/bindings.cpp:95 | — |
| applyCommandBuffer | function | render | cpp/engine/bindings.cpp:82 | — |
| beginTransform | function | interaction | cpp/engine/bindings.cpp:176 | — |
| canRedo | function | core | cpp/engine/bindings.cpp:99 | — |
| canUndo | function | core | cpp/engine/bindings.cpp:98 | — |
| cancelTransform | function | interaction | cpp/engine/bindings.cpp:208 | — |
| clear | function | core | cpp/engine/bindings.cpp:79 | — |
| clearAtlasDirty | function | render | cpp/engine/bindings.cpp:150 | — |
| clearSelection | function | selection | cpp/engine/bindings.cpp:120 | — |
| clearTransformLog | function | interaction | cpp/engine/bindings.cpp:215 | — |
| commitTransform | function | interaction | cpp/engine/bindings.cpp:207 | — |
| deleteLayer | function | layers | cpp/engine/bindings.cpp:113 | — |
| freeBytes | function | core | cpp/engine/bindings.cpp:81 | — |
| getAllTextMetas | function | text | cpp/engine/bindings.cpp:154 | — |
| getAtlasTextureMeta | function | text | cpp/engine/bindings.cpp:148 | — |
| getCapabilities | function | core | cpp/engine/bindings.cpp:92 | — |
| getCommitResultCount | function | core | cpp/engine/bindings.cpp:210 | — |
| getCommitResultIdsPtr | function | core | cpp/engine/bindings.cpp:211 | — |
| getCommitResultOpCodesPtr | function | core | cpp/engine/bindings.cpp:212 | — |
| getCommitResultPayloadsPtr | function | core | cpp/engine/bindings.cpp:213 | — |
| getDocumentDigest | function | core | cpp/engine/bindings.cpp:96 | — |
| getDraftDimensions | function | core | cpp/engine/bindings.cpp:223 | — |
| getDrawOrderSnapshot | function | snap | cpp/engine/bindings.cpp:126 | — |
| getEntityAabb | function | core | cpp/engine/bindings.cpp:108 | — |
| getEntityFlags | function | core | cpp/engine/bindings.cpp:114 | — |
| getEntityLayer | function | layers | cpp/engine/bindings.cpp:117 | — |
| getFullSnapshotMeta | function | snap | cpp/engine/bindings.cpp:91 | — |
| getHistoryMeta | function | history | cpp/engine/bindings.cpp:97 | — |
| getLayerName | function | layers | cpp/engine/bindings.cpp:111 | — |
| getLayersSnapshot | function | layers | cpp/engine/bindings.cpp:110 | — |
| getLineBufferMeta | function | render | cpp/engine/bindings.cpp:88 | — |
| getLineDownIndex | function | core | cpp/engine/bindings.cpp:166 | — |
| getLineEndIndex | function | core | cpp/engine/bindings.cpp:164 | — |
| getLineStartIndex | function | core | cpp/engine/bindings.cpp:163 | — |
| getLineUpIndex | function | core | cpp/engine/bindings.cpp:165 | — |
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
| getTextBounds | function | text | cpp/engine/bindings.cpp:167 | — |
| getTextCaretPosition | function | text | cpp/engine/bindings.cpp:145 | — |
| getTextContentMeta | function | text | cpp/engine/bindings.cpp:152 | — |
| getTextQuadBufferMeta | function | text | cpp/engine/bindings.cpp:147 | — |
| getTextSelectionRects | function | text | cpp/engine/bindings.cpp:153 | — |
| getTextStyleSnapshot | function | text | cpp/engine/bindings.cpp:155 | — |
| getTextStyleSummary | function | text | cpp/engine/bindings.cpp:156 | — |
| getTransformLogCount | function | interaction | cpp/engine/bindings.cpp:218 | — |
| getTransformLogIdCount | function | interaction | cpp/engine/bindings.cpp:220 | — |
| getTransformLogIdsPtr | function | interaction | cpp/engine/bindings.cpp:221 | — |
| getTransformLogPtr | function | interaction | cpp/engine/bindings.cpp:219 | — |
| getVertexCount | function | core | cpp/engine/bindings.cpp:85 | — |
| getVertexDataPtr | function | core | cpp/engine/bindings.cpp:86 | — |
| getVisualNextCharIndex | function | core | cpp/engine/bindings.cpp:160 | — |
| getVisualPrevCharIndex | function | core | cpp/engine/bindings.cpp:159 | — |
| getWordLeftIndex | function | core | cpp/engine/bindings.cpp:161 | — |
| getWordRightIndex | function | core | cpp/engine/bindings.cpp:162 | — |
| hasPendingEvents | function | events | cpp/engine/bindings.cpp:104 | — |
| hitTestText | function | text | cpp/engine/bindings.cpp:144 | — |
| initializeTextSystem | function | text | cpp/engine/bindings.cpp:141 | — |
| isAtlasDirty | function | render | cpp/engine/bindings.cpp:149 | — |
| isInteractionActive | function | core | cpp/engine/bindings.cpp:209 | — |
| isTextQuadsDirty | function | text | cpp/engine/bindings.cpp:151 | — |
| isTransformLogOverflowed | function | interaction | cpp/engine/bindings.cpp:217 | — |
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
| replayTransformLog | function | interaction | cpp/engine/bindings.cpp:216 | — |
| reserveWorld | function | core | cpp/engine/bindings.cpp:83 | — |
| saveSnapshot | function | snap | cpp/engine/bindings.cpp:89 | — |
| selectByPick | function | interaction | cpp/engine/bindings.cpp:124 | — |
| setEntityFlags | function | core | cpp/engine/bindings.cpp:115 | — |
| setEntityLayer | function | layers | cpp/engine/bindings.cpp:116 | — |
| setLayerProps | function | layers | cpp/engine/bindings.cpp:112 | — |
| setSelection | function | selection | cpp/engine/bindings.cpp:121 | — |
| setSnapOptions | function | snap | cpp/engine/bindings.cpp:135 | — |
| setTextConstraintWidth | function | text | cpp/engine/bindings.cpp:157 | — |
| setTextPosition | function | text | cpp/engine/bindings.cpp:158 | — |
| setTransformLogEnabled | function | interaction | cpp/engine/bindings.cpp:214 | — |
| undo | function | core | cpp/engine/bindings.cpp:100 | — |
| updateTransform | function | interaction | cpp/engine/bindings.cpp:206 | — |