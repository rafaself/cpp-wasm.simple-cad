# Engine API Manifest

Source hash: `0313b47a73a6de5c2bbee11887d2df908e8b78f9c3dcb7c771eca723761ab4fa`
Generated at: 2026-01-21T20:16:54.754Z

Bindings:
- packages/engine/engine/bindings.cpp

| Name | Kind | Owner | Source | TS call sites |
| --- | --- | --- | --- | --- |
| BufferMeta | value_object | render | packages/engine/engine/bindings.cpp:281 | 17 × apps/web/engine/core/CanvasController.ts:7, apps/web/engine/core/CanvasController.ts:157, apps/web/engine/core/EngineRuntime.ts:27 |
| ByteBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:288 | — |
| CadEngine | class | core | packages/engine/engine/bindings.cpp:78 | 5 × apps/web/engine/core/EngineRuntime.ts:84, apps/web/engine/core/wasm-types.ts:279, apps/web/tests/engine/runtimePublicSurface.test.ts:87 |
| DocumentDigest | value_object | core | packages/engine/engine/bindings.cpp:306 | 8 × apps/web/engine/core/EngineRuntime.ts:15, apps/web/engine/core/EngineRuntime.ts:223, apps/web/engine/core/EngineRuntime.ts:639 |
| DraftDimensions | value_object | core | packages/engine/engine/bindings.cpp:400 | 6 × apps/web/engine/core/runtime/DraftSystem.ts:3, apps/web/engine/core/runtime/DraftSystem.ts:62, apps/web/engine/core/runtime/DraftSystem.ts:66 |
| EngineCapability | enum | core | packages/engine/engine/bindings.cpp:73 | 6 × apps/web/engine/core/EngineRuntime.ts:7, apps/web/engine/core/EngineRuntime.ts:164, apps/web/engine/core/capabilities.ts:1 |
| EngineEvent | value_object | events | packages/engine/engine/bindings.cpp:293 | 9 × apps/web/engine/core/EngineRuntime.ts:16, apps/web/engine/core/EngineRuntime.ts:198, apps/web/engine/core/EngineRuntime.ts:640 |
| EngineStats | value_object | core | packages/engine/engine/bindings.cpp:340 | 5 × apps/web/engine/core/protocol.ts:148, apps/web/engine/core/runtime/StatsSystem.ts:1, apps/web/engine/core/runtime/StatsSystem.ts:7 |
| EntityAabb | value_object | core | packages/engine/engine/bindings.cpp:384 | 11 × apps/web/engine/core/EngineRuntime.ts:19, apps/web/engine/core/EngineRuntime.ts:297, apps/web/engine/core/EngineRuntime.ts:355 |
| EntityTransform | value_object | interaction | packages/engine/engine/bindings.cpp:391 | 14 × apps/web/engine/core/EngineRuntime.ts:20, apps/web/engine/core/EngineRuntime.ts:463, apps/web/engine/core/EngineRuntime.ts:638 |
| EventBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:301 | 3 × apps/web/engine/core/protocol.ts:212, apps/web/engine/core/wasm-types.ts:7, apps/web/engine/core/wasm-types.ts:96 |
| HistoryMeta | value_object | history | packages/engine/engine/bindings.cpp:310 | 11 × apps/web/engine/core/EngineRuntime.ts:21, apps/web/engine/core/EngineRuntime.ts:228, apps/web/engine/core/engineStateSync.ts:4 |
| LayerRecord | value_object | layers | packages/engine/engine/bindings.cpp:276 | 7 × apps/web/engine/core/EngineRuntime.ts:535, apps/web/engine/core/protocol.ts:100, apps/web/engine/core/runtime/LayerSystem.ts:1 |
| LayerStyleSnapshot | value_object | layers | packages/engine/engine/bindings.cpp:330 | 8 × apps/web/engine/core/protocol.ts:123, apps/web/engine/core/runtime/StyleSystem.ts:1, apps/web/engine/core/runtime/StyleSystem.ts:11 |
| MarqueeMode | enum | interaction | packages/engine/engine/bindings.cpp:63 | 5 × apps/web/engine/core/EngineRuntime.ts:622, apps/web/engine/core/protocol.ts:65, apps/web/engine/core/protocol.ts:419 |
| OrientedHandleMeta | value_object | core | packages/engine/engine/bindings.cpp:364 | 7 × apps/web/engine/core/EngineRuntime.ts:18, apps/web/engine/core/EngineRuntime.ts:351, apps/web/engine/core/protocol.ts:250 |
| OverlayBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:356 | 17 × apps/web/engine/core/EngineRuntime.ts:17, apps/web/engine/core/EngineRuntime.ts:343, apps/web/engine/core/EngineRuntime.ts:347 |
| PickEntityKind | enum | interaction | packages/engine/engine/bindings.cpp:28 | 21 × apps/web/engine/core/runtime/PickSystem.ts:1, apps/web/engine/core/runtime/PickSystem.ts:33, apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:21 |
| PickResult | value_object | interaction | packages/engine/engine/bindings.cpp:252 | 36 × apps/web/engine/core/EngineRuntime.ts:51, apps/web/engine/core/EngineRuntime.ts:273, apps/web/engine/core/EngineRuntime.ts:277 |
| PickSubTarget | enum | interaction | packages/engine/engine/bindings.cpp:18 | 23 × apps/web/engine/core/runtime/PickSystem.ts:1, apps/web/engine/core/runtime/PickSystem.ts:24, apps/web/engine/core/runtime/PickSystem.ts:34 |
| ProtocolInfo | value_object | core | packages/engine/engine/bindings.cpp:268 | 6 × apps/web/engine/core/EngineRuntime.ts:11, apps/web/engine/core/protocol.ts:134, apps/web/engine/core/protocol.ts:576 |
| ReorderAction | enum | core | packages/engine/engine/bindings.cpp:67 | 13 × apps/web/engine/core/EngineRuntime.ts:14, apps/web/engine/core/EngineRuntime.ts:588, apps/web/engine/core/protocol.ts:70 |
| SelectionMode | enum | selection | packages/engine/engine/bindings.cpp:51 | 43 × apps/web/engine/core/EngineRuntime.ts:13, apps/web/engine/core/EngineRuntime.ts:314, apps/web/engine/core/EngineRuntime.ts:327 |
| SelectionModifier | enum | selection | packages/engine/engine/bindings.cpp:57 | 16 × apps/web/engine/core/EngineRuntime.ts:625, apps/web/engine/core/protocol.ts:58, apps/web/engine/core/protocol.ts:413 |
| SelectionStyleSummary | value_object | selection | packages/engine/engine/bindings.cpp:323 | 11 × apps/web/engine/core/protocol.ts:115, apps/web/engine/core/runtime/StyleSystem.ts:1, apps/web/engine/core/runtime/StyleSystem.ts:16 |
| StyleTargetSummary | value_object | core | packages/engine/engine/bindings.cpp:315 | 11 × apps/web/engine/core/protocol.ts:106, apps/web/engine/core/protocol.ts:117, apps/web/engine/core/protocol.ts:118 |
| TextBoundsResult | value_object | text | packages/engine/engine/bindings.cpp:456 | 5 × apps/web/engine/bridge/textBridge.ts:25, apps/web/engine/bridge/textBridge.ts:444, apps/web/engine/core/wasm-types.ts:24 |
| TextBoxMode | enum | text | packages/engine/engine/bindings.cpp:13 | 44 × apps/web/engine/bridge/textBridge.ts:27, apps/web/engine/bridge/textBridge.ts:503, apps/web/engine/tools/TextTool.ts:11 |
| TextCaretPosition | value_object | text | packages/engine/engine/bindings.cpp:418 | 5 × apps/web/engine/bridge/textBridge.ts:21, apps/web/engine/bridge/textBridge.ts:372, apps/web/engine/core/wasm-types.ts:19 |
| TextContentMeta | value_object | text | packages/engine/engine/bindings.cpp:431 | 4 × apps/web/engine/bridge/textBridge.ts:24, apps/web/engine/core/wasm-types.ts:23, apps/web/engine/core/wasm-types.ts:83 |
| TextEntityMeta | value_object | text | packages/engine/engine/bindings.cpp:470 | 11 × apps/web/engine/core/EngineRuntime.ts:28, apps/web/engine/core/EngineRuntime.ts:50, apps/web/engine/core/EngineRuntime.ts:522 |
| TextHitResult | value_object | text | packages/engine/engine/bindings.cpp:413 | 5 × apps/web/engine/bridge/textBridge.ts:20, apps/web/engine/bridge/textBridge.ts:361, apps/web/engine/core/wasm-types.ts:20 |
| TextSelectionRect | value_object | text | packages/engine/engine/bindings.cpp:463 | 15 × apps/web/components/TextCaretOverlay.tsx:17, apps/web/components/TextCaretOverlay.tsx:38, apps/web/components/TextCaretOverlay.tsx:232 |
| TextStyleSnapshot | value_object | text | packages/engine/engine/bindings.cpp:436 | 14 × apps/web/engine/bridge/textBridge.ts:28, apps/web/engine/bridge/textBridge.ts:52, apps/web/engine/core/wasm-types.ts:26 |
| TextureBufferMeta | value_object | text | packages/engine/engine/bindings.cpp:424 | 9 × apps/web/engine/bridge/textBridge.ts:23, apps/web/engine/bridge/textBridge.ts:532, apps/web/engine/core/wasm-types.ts:22 |
| TransformMode | enum | interaction | packages/engine/engine/bindings.cpp:38 | 27 × apps/web/engine/core/EngineRuntime.ts:632, apps/web/engine/core/interactionSession.ts:5, apps/web/engine/core/interactionSession.ts:36 |
| TransformOpCode | enum | interaction | packages/engine/engine/bindings.cpp:45 | 15 × apps/web/engine/core/interactionSession.ts:14, apps/web/engine/core/interactionSession.ts:15, apps/web/engine/core/interactionSession.ts:120 |
| TransformState | value_object | interaction | packages/engine/engine/bindings.cpp:261 | 10 × apps/web/engine/core/EngineRuntime.ts:23, apps/web/engine/core/EngineRuntime.ts:432, apps/web/engine/core/interactionSession.ts:33 |
| VectorLayerRecord | vector | layers | packages/engine/engine/bindings.cpp:479 | — |
| VectorTextEntityMeta | vector | text | packages/engine/engine/bindings.cpp:478 | — |
| VectorTextSelectionRect | vector | text | packages/engine/engine/bindings.cpp:477 | — |
| VectorUInt32 | vector | core | packages/engine/engine/bindings.cpp:476 | 2 × apps/web/engine/core/wasm-types.ts:49, apps/web/engine/core/wasm-types.ts:125 |
| ackResync | function | core | packages/engine/engine/bindings.cpp:108 | — |
| allocBytes | function | core | packages/engine/engine/bindings.cpp:81 | — |
| allocateEntityId | function | core | packages/engine/engine/bindings.cpp:95 | — |
| allocateLayerId | function | layers | packages/engine/engine/bindings.cpp:96 | — |
| applyCommandBuffer | function | render | packages/engine/engine/bindings.cpp:83 | — |
| beginHistoryEntry | function | history | packages/engine/engine/bindings.cpp:99 | — |
| beginTransform | function | interaction | packages/engine/engine/bindings.cpp:200 | — |
| canRedo | function | core | packages/engine/engine/bindings.cpp:104 | — |
| canUndo | function | core | packages/engine/engine/bindings.cpp:103 | — |
| cancelTransform | function | interaction | packages/engine/engine/bindings.cpp:232 | — |
| clear | function | core | packages/engine/engine/bindings.cpp:80 | — |
| clearAtlasDirty | function | render | packages/engine/engine/bindings.cpp:174 | — |
| clearSelection | function | selection | packages/engine/engine/bindings.cpp:144 | — |
| clearTransformLog | function | interaction | packages/engine/engine/bindings.cpp:240 | — |
| commitHistoryEntry | function | history | packages/engine/engine/bindings.cpp:100 | — |
| commitTransform | function | interaction | packages/engine/engine/bindings.cpp:231 | — |
| deleteLayer | function | layers | packages/engine/engine/bindings.cpp:126 | — |
| discardHistoryEntry | function | history | packages/engine/engine/bindings.cpp:101 | — |
| freeBytes | function | core | packages/engine/engine/bindings.cpp:82 | — |
| getAllTextMetas | function | text | packages/engine/engine/bindings.cpp:178 | — |
| getAtlasTextureMeta | function | text | packages/engine/engine/bindings.cpp:172 | — |
| getCapabilities | function | core | packages/engine/engine/bindings.cpp:93 | — |
| getCommitResultCount | function | core | packages/engine/engine/bindings.cpp:235 | — |
| getCommitResultIdsPtr | function | core | packages/engine/engine/bindings.cpp:236 | — |
| getCommitResultOpCodesPtr | function | core | packages/engine/engine/bindings.cpp:237 | — |
| getCommitResultPayloadsPtr | function | core | packages/engine/engine/bindings.cpp:238 | — |
| getDocumentDigest | function | core | packages/engine/engine/bindings.cpp:97 | — |
| getDraftDimensions | function | core | packages/engine/engine/bindings.cpp:248 | — |
| getDrawOrderSnapshot | function | snap | packages/engine/engine/bindings.cpp:150 | — |
| getEntityAabb | function | core | packages/engine/engine/bindings.cpp:114 | — |
| getEntityFlags | function | core | packages/engine/engine/bindings.cpp:127 | — |
| getEntityKind | function | core | packages/engine/engine/bindings.cpp:131 | — |
| getEntityLayer | function | layers | packages/engine/engine/bindings.cpp:130 | — |
| getEntityTransform | function | interaction | packages/engine/engine/bindings.cpp:116 | — |
| getFullSnapshotMeta | function | snap | packages/engine/engine/bindings.cpp:92 | — |
| getHistoryMeta | function | history | packages/engine/engine/bindings.cpp:98 | — |
| getLayerName | function | layers | packages/engine/engine/bindings.cpp:123 | — |
| getLayerStyle | function | layers | packages/engine/engine/bindings.cpp:124 | — |
| getLayersSnapshot | function | layers | packages/engine/engine/bindings.cpp:122 | — |
| getLineBufferMeta | function | render | packages/engine/engine/bindings.cpp:89 | — |
| getLineDownIndex | function | core | packages/engine/engine/bindings.cpp:190 | — |
| getLineEndIndex | function | core | packages/engine/engine/bindings.cpp:188 | — |
| getLineStartIndex | function | core | packages/engine/engine/bindings.cpp:187 | — |
| getLineUpIndex | function | core | packages/engine/engine/bindings.cpp:189 | — |
| getOrientedHandleMeta | function | core | packages/engine/engine/bindings.cpp:112 | — |
| getPositionBufferMeta | function | render | packages/engine/engine/bindings.cpp:88 | — |
| getProtocolInfo | function | core | packages/engine/engine/bindings.cpp:94 | — |
| getSelectionBounds | function | selection | packages/engine/engine/bindings.cpp:115 | — |
| getSelectionGeneration | function | selection | packages/engine/engine/bindings.cpp:142 | — |
| getSelectionHandleMeta | function | selection | packages/engine/engine/bindings.cpp:111 | — |
| getSelectionIds | function | selection | packages/engine/engine/bindings.cpp:141 | — |
| getSelectionOutlineMeta | function | selection | packages/engine/engine/bindings.cpp:110 | — |
| getSelectionStyleSummary | function | selection | packages/engine/engine/bindings.cpp:143 | — |
| getSnapOverlayMeta | function | snap | packages/engine/engine/bindings.cpp:113 | — |
| getSnappedPoint | function | snap | packages/engine/engine/bindings.cpp:160 | — |
| getSnapshotBufferMeta | function | snap | packages/engine/engine/bindings.cpp:91 | — |
| getStats | function | core | packages/engine/engine/bindings.cpp:158 | — |
| getTextBounds | function | text | packages/engine/engine/bindings.cpp:191 | — |
| getTextCaretPosition | function | text | packages/engine/engine/bindings.cpp:169 | — |
| getTextContentMeta | function | text | packages/engine/engine/bindings.cpp:176 | — |
| getTextQuadBufferMeta | function | text | packages/engine/engine/bindings.cpp:171 | — |
| getTextSelectionRects | function | text | packages/engine/engine/bindings.cpp:177 | — |
| getTextStyleSnapshot | function | text | packages/engine/engine/bindings.cpp:179 | — |
| getTextStyleSummary | function | text | packages/engine/engine/bindings.cpp:180 | — |
| getTransformLogCount | function | interaction | packages/engine/engine/bindings.cpp:243 | — |
| getTransformLogIdCount | function | interaction | packages/engine/engine/bindings.cpp:245 | — |
| getTransformLogIdsPtr | function | interaction | packages/engine/engine/bindings.cpp:246 | — |
| getTransformLogPtr | function | interaction | packages/engine/engine/bindings.cpp:244 | — |
| getTransformState | function | interaction | packages/engine/engine/bindings.cpp:234 | — |
| getVertexCount | function | core | packages/engine/engine/bindings.cpp:86 | — |
| getVertexDataPtr | function | core | packages/engine/engine/bindings.cpp:87 | — |
| getVisualNextCharIndex | function | core | packages/engine/engine/bindings.cpp:184 | — |
| getVisualPrevCharIndex | function | core | packages/engine/engine/bindings.cpp:183 | — |
| getWordLeftIndex | function | core | packages/engine/engine/bindings.cpp:185 | — |
| getWordRightIndex | function | core | packages/engine/engine/bindings.cpp:186 | — |
| hasPendingEvents | function | events | packages/engine/engine/bindings.cpp:109 | — |
| hitTestText | function | text | packages/engine/engine/bindings.cpp:168 | — |
| initializeTextSystem | function | text | packages/engine/engine/bindings.cpp:165 | — |
| isAtlasDirty | function | render | packages/engine/engine/bindings.cpp:173 | — |
| isInteractionActive | function | core | packages/engine/engine/bindings.cpp:233 | — |
| isTextQuadsDirty | function | text | packages/engine/engine/bindings.cpp:175 | — |
| isTransformLogOverflowed | function | interaction | packages/engine/engine/bindings.cpp:242 | — |
| loadFont | function | core | packages/engine/engine/bindings.cpp:166 | — |
| loadFontEx | function | core | packages/engine/engine/bindings.cpp:167 | — |
| loadSnapshotFromPtr | function | snap | packages/engine/engine/bindings.cpp:85 | — |
| marqueeSelect | function | interaction | packages/engine/engine/bindings.cpp:149 | — |
| pick | function | interaction | packages/engine/engine/bindings.cpp:154 | — |
| pickEx | function | interaction | packages/engine/engine/bindings.cpp:155 | — |
| pollEvents | function | events | packages/engine/engine/bindings.cpp:107 | — |
| queryArea | function | core | packages/engine/engine/bindings.cpp:156 | — |
| queryMarquee | function | interaction | packages/engine/engine/bindings.cpp:157 | — |
| rebuildTextQuadBuffer | function | text | packages/engine/engine/bindings.cpp:170 | — |
| redo | function | core | packages/engine/engine/bindings.cpp:106 | — |
| reorderEntities | function | core | packages/engine/engine/bindings.cpp:151 | — |
| replayTransformLog | function | interaction | packages/engine/engine/bindings.cpp:241 | — |
| reserveWorld | function | core | packages/engine/engine/bindings.cpp:84 | — |
| rollbackHistoryEntry | function | history | packages/engine/engine/bindings.cpp:102 | — |
| saveSnapshot | function | snap | packages/engine/engine/bindings.cpp:90 | — |
| selectByPick | function | interaction | packages/engine/engine/bindings.cpp:148 | — |
| setEntityFlags | function | core | packages/engine/engine/bindings.cpp:128 | — |
| setEntityGeomZ | function | core | packages/engine/engine/bindings.cpp:140 | — |
| setEntityLayer | function | layers | packages/engine/engine/bindings.cpp:129 | — |
| setEntityLength | function | core | packages/engine/engine/bindings.cpp:120 | — |
| setEntityPosition | function | core | packages/engine/engine/bindings.cpp:117 | — |
| setEntityRotation | function | core | packages/engine/engine/bindings.cpp:119 | — |
| setEntityScale | function | core | packages/engine/engine/bindings.cpp:121 | — |
| setEntitySize | function | core | packages/engine/engine/bindings.cpp:118 | — |
| setLayerProps | function | layers | packages/engine/engine/bindings.cpp:125 | — |
| setSelection | function | selection | packages/engine/engine/bindings.cpp:145 | — |
| setSnapOptions | function | snap | packages/engine/engine/bindings.cpp:159 | — |
| setTextConstraintWidth | function | text | packages/engine/engine/bindings.cpp:181 | — |
| setTextPosition | function | text | packages/engine/engine/bindings.cpp:182 | — |
| setTransformLogEnabled | function | interaction | packages/engine/engine/bindings.cpp:239 | — |
| tryGetEntityGeomZ | function | core | packages/engine/engine/bindings.cpp:132 | — |
| undo | function | core | packages/engine/engine/bindings.cpp:105 | — |
| updateTransform | function | interaction | packages/engine/engine/bindings.cpp:230 | — |