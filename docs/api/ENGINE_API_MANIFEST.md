# Engine API Manifest

Source hash: `fba530dec837037d7714b47bd2c1b497b3edec0363f79baed87e759618c6539a`
Generated at: 2026-01-27T02:43:55.644Z

Bindings:
- packages/engine/engine/bindings.cpp

| Name | Kind | Owner | Source | TS call sites |
| --- | --- | --- | --- | --- |
| BufferMeta | value_object | render | packages/engine/engine/bindings.cpp:284 | 17 × apps/web/engine/core/CanvasController.ts:7, apps/web/engine/core/CanvasController.ts:157, apps/web/engine/core/EngineRuntime.ts:27 |
| ByteBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:291 | — |
| CadEngine | class | core | packages/engine/engine/bindings.cpp:78 | 5 × apps/web/engine/core/EngineRuntime.ts:87, apps/web/engine/core/wasm-types.ts:298, apps/web/tests/engine/runtimePublicSurface.test.ts:87 |
| DocumentDigest | value_object | core | packages/engine/engine/bindings.cpp:309 | 8 × apps/web/engine/core/EngineRuntime.ts:15, apps/web/engine/core/EngineRuntime.ts:229, apps/web/engine/core/EngineRuntime.ts:662 |
| DraftDimensions | value_object | core | packages/engine/engine/bindings.cpp:414 | 6 × apps/web/engine/core/runtime/DraftSystem.ts:3, apps/web/engine/core/runtime/DraftSystem.ts:62, apps/web/engine/core/runtime/DraftSystem.ts:66 |
| EngineCapability | enum | core | packages/engine/engine/bindings.cpp:73 | 6 × apps/web/engine/core/EngineRuntime.ts:7, apps/web/engine/core/EngineRuntime.ts:170, apps/web/engine/core/capabilities.ts:1 |
| EngineEvent | value_object | events | packages/engine/engine/bindings.cpp:296 | 9 × apps/web/engine/core/EngineRuntime.ts:16, apps/web/engine/core/EngineRuntime.ts:204, apps/web/engine/core/EngineRuntime.ts:663 |
| EngineStats | value_object | core | packages/engine/engine/bindings.cpp:343 | 5 × apps/web/engine/core/protocol.ts:148, apps/web/engine/core/runtime/StatsSystem.ts:1, apps/web/engine/core/runtime/StatsSystem.ts:7 |
| EntityAabb | value_object | core | packages/engine/engine/bindings.cpp:398 | 11 × apps/web/engine/core/EngineRuntime.ts:19, apps/web/engine/core/EngineRuntime.ts:316, apps/web/engine/core/EngineRuntime.ts:374 |
| EntityTransform | value_object | interaction | packages/engine/engine/bindings.cpp:405 | 14 × apps/web/engine/core/EngineRuntime.ts:20, apps/web/engine/core/EngineRuntime.ts:486, apps/web/engine/core/EngineRuntime.ts:661 |
| EventBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:304 | 3 × apps/web/engine/core/protocol.ts:214, apps/web/engine/core/wasm-types.ts:7, apps/web/engine/core/wasm-types.ts:102 |
| HistoryMeta | value_object | history | packages/engine/engine/bindings.cpp:313 | 11 × apps/web/engine/core/EngineRuntime.ts:21, apps/web/engine/core/EngineRuntime.ts:234, apps/web/engine/core/engineStateSync.ts:4 |
| LayerRecord | value_object | layers | packages/engine/engine/bindings.cpp:279 | 7 × apps/web/engine/core/EngineRuntime.ts:558, apps/web/engine/core/protocol.ts:100, apps/web/engine/core/runtime/LayerSystem.ts:1 |
| LayerStyleSnapshot | value_object | layers | packages/engine/engine/bindings.cpp:333 | 8 × apps/web/engine/core/protocol.ts:123, apps/web/engine/core/runtime/StyleSystem.ts:1, apps/web/engine/core/runtime/StyleSystem.ts:11 |
| MarqueeMode | enum | interaction | packages/engine/engine/bindings.cpp:63 | 5 × apps/web/engine/core/EngineRuntime.ts:645, apps/web/engine/core/protocol.ts:65, apps/web/engine/core/protocol.ts:459 |
| OrientedHandleMeta | value_object | core | packages/engine/engine/bindings.cpp:367 | 7 × apps/web/engine/core/EngineRuntime.ts:18, apps/web/engine/core/EngineRuntime.ts:370, apps/web/engine/core/protocol.ts:260 |
| OverlayBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:359 | 19 × apps/web/engine/core/EngineRuntime.ts:17, apps/web/engine/core/EngineRuntime.ts:362, apps/web/engine/core/EngineRuntime.ts:366 |
| PickEntityKind | enum | interaction | packages/engine/engine/bindings.cpp:28 | 30 × apps/web/engine/core/runtime/PickSystem.ts:1, apps/web/engine/core/runtime/PickSystem.ts:33, apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:3 |
| PickResult | value_object | interaction | packages/engine/engine/bindings.cpp:255 | 51 × apps/web/engine/core/EngineRuntime.ts:52, apps/web/engine/core/EngineRuntime.ts:279, apps/web/engine/core/EngineRuntime.ts:288 |
| PickSubTarget | enum | interaction | packages/engine/engine/bindings.cpp:18 | 32 × apps/web/engine/core/runtime/PickSystem.ts:1, apps/web/engine/core/runtime/PickSystem.ts:24, apps/web/engine/core/runtime/PickSystem.ts:34 |
| ProtocolInfo | value_object | core | packages/engine/engine/bindings.cpp:271 | 6 × apps/web/engine/core/EngineRuntime.ts:11, apps/web/engine/core/protocol.ts:134, apps/web/engine/core/protocol.ts:619 |
| ReorderAction | enum | core | packages/engine/engine/bindings.cpp:67 | 13 × apps/web/engine/core/EngineRuntime.ts:14, apps/web/engine/core/EngineRuntime.ts:611, apps/web/engine/core/protocol.ts:70 |
| SelectionMode | enum | selection | packages/engine/engine/bindings.cpp:51 | 47 × apps/web/engine/core/EngineRuntime.ts:13, apps/web/engine/core/EngineRuntime.ts:333, apps/web/engine/core/EngineRuntime.ts:346 |
| SelectionModifier | enum | selection | packages/engine/engine/bindings.cpp:57 | 11 × apps/web/engine/core/EngineRuntime.ts:648, apps/web/engine/core/protocol.ts:58, apps/web/engine/core/protocol.ts:453 |
| SelectionStyleSummary | value_object | selection | packages/engine/engine/bindings.cpp:326 | 11 × apps/web/engine/core/protocol.ts:115, apps/web/engine/core/runtime/StyleSystem.ts:1, apps/web/engine/core/runtime/StyleSystem.ts:16 |
| StyleTargetSummary | value_object | core | packages/engine/engine/bindings.cpp:318 | 11 × apps/web/engine/core/protocol.ts:106, apps/web/engine/core/protocol.ts:117, apps/web/engine/core/protocol.ts:118 |
| TextBoundsResult | value_object | text | packages/engine/engine/bindings.cpp:475 | 5 × apps/web/engine/bridge/textBridge.ts:25, apps/web/engine/bridge/textBridge.ts:444, apps/web/engine/core/wasm-types.ts:24 |
| TextBoxMode | enum | text | packages/engine/engine/bindings.cpp:13 | 44 × apps/web/engine/bridge/textBridge.ts:27, apps/web/engine/bridge/textBridge.ts:503, apps/web/engine/tools/TextTool.ts:11 |
| TextCaretPosition | value_object | text | packages/engine/engine/bindings.cpp:437 | 5 × apps/web/engine/bridge/textBridge.ts:21, apps/web/engine/bridge/textBridge.ts:372, apps/web/engine/core/wasm-types.ts:19 |
| TextContentMeta | value_object | text | packages/engine/engine/bindings.cpp:450 | 4 × apps/web/engine/bridge/textBridge.ts:24, apps/web/engine/core/wasm-types.ts:23, apps/web/engine/core/wasm-types.ts:89 |
| TextEntityMeta | value_object | text | packages/engine/engine/bindings.cpp:489 | 11 × apps/web/engine/core/EngineRuntime.ts:28, apps/web/engine/core/EngineRuntime.ts:51, apps/web/engine/core/EngineRuntime.ts:545 |
| TextHitResult | value_object | text | packages/engine/engine/bindings.cpp:432 | 5 × apps/web/engine/bridge/textBridge.ts:20, apps/web/engine/bridge/textBridge.ts:361, apps/web/engine/core/wasm-types.ts:20 |
| TextSelectionRect | value_object | text | packages/engine/engine/bindings.cpp:482 | 15 × apps/web/components/TextCaretOverlay.tsx:17, apps/web/components/TextCaretOverlay.tsx:38, apps/web/components/TextCaretOverlay.tsx:232 |
| TextStyleSnapshot | value_object | text | packages/engine/engine/bindings.cpp:455 | 14 × apps/web/engine/bridge/textBridge.ts:28, apps/web/engine/bridge/textBridge.ts:52, apps/web/engine/core/wasm-types.ts:26 |
| TextureBufferMeta | value_object | text | packages/engine/engine/bindings.cpp:443 | 9 × apps/web/engine/bridge/textBridge.ts:23, apps/web/engine/bridge/textBridge.ts:532, apps/web/engine/core/wasm-types.ts:22 |
| TransformMode | enum | interaction | packages/engine/engine/bindings.cpp:38 | 34 × apps/web/engine/core/EngineRuntime.ts:655, apps/web/engine/core/interactionSession.ts:5, apps/web/engine/core/interactionSession.ts:36 |
| TransformOpCode | enum | interaction | packages/engine/engine/bindings.cpp:45 | 15 × apps/web/engine/core/interactionSession.ts:14, apps/web/engine/core/interactionSession.ts:15, apps/web/engine/core/interactionSession.ts:120 |
| TransformState | value_object | interaction | packages/engine/engine/bindings.cpp:264 | 10 × apps/web/engine/core/EngineRuntime.ts:23, apps/web/engine/core/EngineRuntime.ts:451, apps/web/engine/core/interactionSession.ts:33 |
| VectorLayerRecord | vector | layers | packages/engine/engine/bindings.cpp:499 | — |
| VectorPickResult | vector | interaction | packages/engine/engine/bindings.cpp:495 | — |
| VectorTextEntityMeta | vector | text | packages/engine/engine/bindings.cpp:498 | — |
| VectorTextSelectionRect | vector | text | packages/engine/engine/bindings.cpp:497 | — |
| VectorUInt32 | vector | core | packages/engine/engine/bindings.cpp:496 | 2 × apps/web/engine/core/wasm-types.ts:49, apps/web/engine/core/wasm-types.ts:131 |
| ackResync | function | core | packages/engine/engine/bindings.cpp:108 | — |
| allocBytes | function | core | packages/engine/engine/bindings.cpp:81 | — |
| allocateEntityId | function | core | packages/engine/engine/bindings.cpp:95 | — |
| allocateLayerId | function | layers | packages/engine/engine/bindings.cpp:96 | — |
| applyCommandBuffer | function | render | packages/engine/engine/bindings.cpp:83 | — |
| beginHistoryEntry | function | history | packages/engine/engine/bindings.cpp:99 | — |
| beginTransform | function | interaction | packages/engine/engine/bindings.cpp:203 | — |
| canRedo | function | core | packages/engine/engine/bindings.cpp:104 | — |
| canUndo | function | core | packages/engine/engine/bindings.cpp:103 | — |
| cancelTransform | function | interaction | packages/engine/engine/bindings.cpp:235 | — |
| clear | function | core | packages/engine/engine/bindings.cpp:80 | — |
| clearAtlasDirty | function | render | packages/engine/engine/bindings.cpp:177 | — |
| clearSelection | function | selection | packages/engine/engine/bindings.cpp:144 | — |
| clearTransformLog | function | interaction | packages/engine/engine/bindings.cpp:243 | — |
| commitHistoryEntry | function | history | packages/engine/engine/bindings.cpp:100 | — |
| commitTransform | function | interaction | packages/engine/engine/bindings.cpp:234 | — |
| deleteLayer | function | layers | packages/engine/engine/bindings.cpp:126 | — |
| discardHistoryEntry | function | history | packages/engine/engine/bindings.cpp:101 | — |
| freeBytes | function | core | packages/engine/engine/bindings.cpp:82 | — |
| getAllTextMetas | function | text | packages/engine/engine/bindings.cpp:181 | — |
| getAtlasTextureMeta | function | text | packages/engine/engine/bindings.cpp:175 | — |
| getCapabilities | function | core | packages/engine/engine/bindings.cpp:93 | — |
| getCommitResultCount | function | core | packages/engine/engine/bindings.cpp:238 | — |
| getCommitResultIdsPtr | function | core | packages/engine/engine/bindings.cpp:239 | — |
| getCommitResultOpCodesPtr | function | core | packages/engine/engine/bindings.cpp:240 | — |
| getCommitResultPayloadsPtr | function | core | packages/engine/engine/bindings.cpp:241 | — |
| getDocumentDigest | function | core | packages/engine/engine/bindings.cpp:97 | — |
| getDraftDimensions | function | core | packages/engine/engine/bindings.cpp:251 | — |
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
| getLineDownIndex | function | core | packages/engine/engine/bindings.cpp:193 | — |
| getLineEndIndex | function | core | packages/engine/engine/bindings.cpp:191 | — |
| getLineStartIndex | function | core | packages/engine/engine/bindings.cpp:190 | — |
| getLineUpIndex | function | core | packages/engine/engine/bindings.cpp:192 | — |
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
| getSnappedPoint | function | snap | packages/engine/engine/bindings.cpp:163 | — |
| getSnapshotBufferMeta | function | snap | packages/engine/engine/bindings.cpp:91 | — |
| getStats | function | core | packages/engine/engine/bindings.cpp:160 | — |
| getTextBounds | function | text | packages/engine/engine/bindings.cpp:194 | — |
| getTextCaretPosition | function | text | packages/engine/engine/bindings.cpp:172 | — |
| getTextContentMeta | function | text | packages/engine/engine/bindings.cpp:179 | — |
| getTextQuadBufferMeta | function | text | packages/engine/engine/bindings.cpp:174 | — |
| getTextSelectionRects | function | text | packages/engine/engine/bindings.cpp:180 | — |
| getTextStyleSnapshot | function | text | packages/engine/engine/bindings.cpp:182 | — |
| getTextStyleSummary | function | text | packages/engine/engine/bindings.cpp:183 | — |
| getTransformLogCount | function | interaction | packages/engine/engine/bindings.cpp:246 | — |
| getTransformLogIdCount | function | interaction | packages/engine/engine/bindings.cpp:248 | — |
| getTransformLogIdsPtr | function | interaction | packages/engine/engine/bindings.cpp:249 | — |
| getTransformLogPtr | function | interaction | packages/engine/engine/bindings.cpp:247 | — |
| getTransformState | function | interaction | packages/engine/engine/bindings.cpp:237 | — |
| getVertexCount | function | core | packages/engine/engine/bindings.cpp:86 | — |
| getVertexDataPtr | function | core | packages/engine/engine/bindings.cpp:87 | — |
| getVisualNextCharIndex | function | core | packages/engine/engine/bindings.cpp:187 | — |
| getVisualPrevCharIndex | function | core | packages/engine/engine/bindings.cpp:186 | — |
| getWordLeftIndex | function | core | packages/engine/engine/bindings.cpp:188 | — |
| getWordRightIndex | function | core | packages/engine/engine/bindings.cpp:189 | — |
| hasPendingEvents | function | events | packages/engine/engine/bindings.cpp:109 | — |
| hitTestText | function | text | packages/engine/engine/bindings.cpp:171 | — |
| initializeTextSystem | function | text | packages/engine/engine/bindings.cpp:168 | — |
| isAtlasDirty | function | render | packages/engine/engine/bindings.cpp:176 | — |
| isInteractionActive | function | core | packages/engine/engine/bindings.cpp:236 | — |
| isTextQuadsDirty | function | text | packages/engine/engine/bindings.cpp:178 | — |
| isTransformLogOverflowed | function | interaction | packages/engine/engine/bindings.cpp:245 | — |
| loadFont | function | core | packages/engine/engine/bindings.cpp:169 | — |
| loadFontEx | function | core | packages/engine/engine/bindings.cpp:170 | — |
| loadSnapshotFromPtr | function | snap | packages/engine/engine/bindings.cpp:85 | — |
| marqueeSelect | function | interaction | packages/engine/engine/bindings.cpp:149 | — |
| pick | function | interaction | packages/engine/engine/bindings.cpp:154 | — |
| pickCandidates | function | interaction | packages/engine/engine/bindings.cpp:156 | — |
| pickEx | function | interaction | packages/engine/engine/bindings.cpp:155 | — |
| pickSideHandle | function | interaction | packages/engine/engine/bindings.cpp:157 | — |
| pollEvents | function | events | packages/engine/engine/bindings.cpp:107 | — |
| queryArea | function | core | packages/engine/engine/bindings.cpp:158 | — |
| queryMarquee | function | interaction | packages/engine/engine/bindings.cpp:159 | — |
| rebuildTextQuadBuffer | function | text | packages/engine/engine/bindings.cpp:173 | — |
| redo | function | core | packages/engine/engine/bindings.cpp:106 | — |
| reorderEntities | function | core | packages/engine/engine/bindings.cpp:151 | — |
| replayTransformLog | function | interaction | packages/engine/engine/bindings.cpp:244 | — |
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
| setOrthoOptions | function | core | packages/engine/engine/bindings.cpp:162 | — |
| setSelection | function | selection | packages/engine/engine/bindings.cpp:145 | — |
| setSnapOptions | function | snap | packages/engine/engine/bindings.cpp:161 | — |
| setTextConstraintWidth | function | text | packages/engine/engine/bindings.cpp:184 | — |
| setTextPosition | function | text | packages/engine/engine/bindings.cpp:185 | — |
| setTransformLogEnabled | function | interaction | packages/engine/engine/bindings.cpp:242 | — |
| tryGetEntityGeomZ | function | core | packages/engine/engine/bindings.cpp:132 | — |
| undo | function | core | packages/engine/engine/bindings.cpp:105 | — |
| updateTransform | function | interaction | packages/engine/engine/bindings.cpp:233 | — |