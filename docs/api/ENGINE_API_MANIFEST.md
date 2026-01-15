# Engine API Manifest

Source hash: `20ec0e6e585b7d215fe2e7662abadda2e1dbd3716eac1dbbfdbc5e9d84c4549b`
Generated at: 2026-01-15T20:33:05.542Z

Bindings:
- packages/engine/engine/bindings.cpp

| Name | Kind | Owner | Source | TS call sites |
| --- | --- | --- | --- | --- |
| BufferMeta | value_object | render | packages/engine/engine/bindings.cpp:268 | 17 × apps/web/engine/core/CanvasController.ts:7, apps/web/engine/core/CanvasController.ts:157, apps/web/engine/core/EngineRuntime.ts:27 |
| ByteBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:275 | — |
| CadEngine | class | core | packages/engine/engine/bindings.cpp:78 | 5 × apps/web/engine/core/EngineRuntime.ts:89, apps/web/engine/core/wasm-types.ts:273, apps/web/tests/engine/runtimePublicSurface.test.ts:87 |
| DocumentDigest | value_object | core | packages/engine/engine/bindings.cpp:293 | 7 × apps/web/engine/core/EngineRuntime.ts:15, apps/web/engine/core/EngineRuntime.ts:228, apps/web/engine/core/protocol.ts:143 |
| DraftDimensions | value_object | core | packages/engine/engine/bindings.cpp:387 | 6 × apps/web/engine/core/runtime/DraftSystem.ts:3, apps/web/engine/core/runtime/DraftSystem.ts:62, apps/web/engine/core/runtime/DraftSystem.ts:66 |
| EngineCapability | enum | core | packages/engine/engine/bindings.cpp:73 | 6 × apps/web/engine/core/EngineRuntime.ts:7, apps/web/engine/core/EngineRuntime.ts:169, apps/web/engine/core/capabilities.ts:1 |
| EngineEvent | value_object | events | packages/engine/engine/bindings.cpp:280 | 8 × apps/web/engine/core/EngineRuntime.ts:16, apps/web/engine/core/EngineRuntime.ts:203, apps/web/engine/core/engineEventDecoder.ts:1 |
| EngineStats | value_object | core | packages/engine/engine/bindings.cpp:327 | 5 × apps/web/engine/core/protocol.ts:148, apps/web/engine/core/runtime/StatsSystem.ts:1, apps/web/engine/core/runtime/StatsSystem.ts:7 |
| EntityAabb | value_object | core | packages/engine/engine/bindings.cpp:371 | 11 × apps/web/engine/core/EngineRuntime.ts:19, apps/web/engine/core/EngineRuntime.ts:282, apps/web/engine/core/EngineRuntime.ts:340 |
| EntityTransform | value_object | interaction | packages/engine/engine/bindings.cpp:378 | 13 × apps/web/engine/core/EngineRuntime.ts:20, apps/web/engine/core/EngineRuntime.ts:448, apps/web/engine/core/protocol.ts:285 |
| EventBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:288 | 3 × apps/web/engine/core/protocol.ts:212, apps/web/engine/core/wasm-types.ts:6, apps/web/engine/core/wasm-types.ts:92 |
| HistoryMeta | value_object | history | packages/engine/engine/bindings.cpp:297 | 11 × apps/web/engine/core/EngineRuntime.ts:21, apps/web/engine/core/EngineRuntime.ts:233, apps/web/engine/core/engineStateSync.ts:4 |
| LayerRecord | value_object | layers | packages/engine/engine/bindings.cpp:263 | 7 × apps/web/engine/core/EngineRuntime.ts:520, apps/web/engine/core/protocol.ts:100, apps/web/engine/core/runtime/LayerSystem.ts:1 |
| LayerStyleSnapshot | value_object | layers | packages/engine/engine/bindings.cpp:317 | 5 × apps/web/engine/core/protocol.ts:123, apps/web/engine/core/runtime/StyleSystem.ts:1, apps/web/engine/core/runtime/StyleSystem.ts:11 |
| MarqueeMode | enum | interaction | packages/engine/engine/bindings.cpp:63 | 4 × apps/web/engine/core/protocol.ts:65, apps/web/engine/core/protocol.ts:415, apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:3 |
| OrientedHandleMeta | value_object | core | packages/engine/engine/bindings.cpp:351 | 7 × apps/web/engine/core/EngineRuntime.ts:18, apps/web/engine/core/EngineRuntime.ts:336, apps/web/engine/core/protocol.ts:250 |
| OverlayBufferMeta | value_object | render | packages/engine/engine/bindings.cpp:343 | 17 × apps/web/engine/core/EngineRuntime.ts:17, apps/web/engine/core/EngineRuntime.ts:328, apps/web/engine/core/EngineRuntime.ts:332 |
| PickEntityKind | enum | interaction | packages/engine/engine/bindings.cpp:28 | 21 × apps/web/engine/core/runtime/PickSystem.ts:1, apps/web/engine/core/runtime/PickSystem.ts:33, apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:17 |
| PickResult | value_object | interaction | packages/engine/engine/bindings.cpp:239 | 37 × apps/web/engine/core/EngineRuntime.ts:51, apps/web/engine/core/EngineRuntime.ts:258, apps/web/engine/core/EngineRuntime.ts:262 |
| PickSubTarget | enum | interaction | packages/engine/engine/bindings.cpp:18 | 23 × apps/web/engine/core/runtime/PickSystem.ts:1, apps/web/engine/core/runtime/PickSystem.ts:24, apps/web/engine/core/runtime/PickSystem.ts:34 |
| ProtocolInfo | value_object | core | packages/engine/engine/bindings.cpp:255 | 6 × apps/web/engine/core/EngineRuntime.ts:11, apps/web/engine/core/protocol.ts:134, apps/web/engine/core/protocol.ts:572 |
| ReorderAction | enum | core | packages/engine/engine/bindings.cpp:67 | 13 × apps/web/engine/core/EngineRuntime.ts:14, apps/web/engine/core/EngineRuntime.ts:565, apps/web/engine/core/protocol.ts:70 |
| SelectionMode | enum | selection | packages/engine/engine/bindings.cpp:51 | 42 × apps/web/engine/core/EngineRuntime.ts:13, apps/web/engine/core/EngineRuntime.ts:299, apps/web/engine/core/EngineRuntime.ts:312 |
| SelectionModifier | enum | selection | packages/engine/engine/bindings.cpp:57 | 15 × apps/web/engine/core/protocol.ts:58, apps/web/engine/core/protocol.ts:409, apps/web/engine/core/protocol.ts:410 |
| SelectionStyleSummary | value_object | selection | packages/engine/engine/bindings.cpp:310 | 10 × apps/web/engine/core/protocol.ts:115, apps/web/engine/core/runtime/StyleSystem.ts:1, apps/web/engine/core/runtime/StyleSystem.ts:16 |
| StyleTargetSummary | value_object | core | packages/engine/engine/bindings.cpp:302 | 9 × apps/web/engine/core/protocol.ts:106, apps/web/engine/core/protocol.ts:117, apps/web/engine/core/protocol.ts:118 |
| TextBoundsResult | value_object | text | packages/engine/engine/bindings.cpp:443 | 5 × apps/web/engine/bridge/textBridge.ts:25, apps/web/engine/bridge/textBridge.ts:443, apps/web/engine/core/wasm-types.ts:24 |
| TextBoxMode | enum | text | packages/engine/engine/bindings.cpp:13 | 44 × apps/web/engine/bridge/textBridge.ts:27, apps/web/engine/bridge/textBridge.ts:502, apps/web/engine/tools/TextTool.ts:11 |
| TextCaretPosition | value_object | text | packages/engine/engine/bindings.cpp:405 | 6 × apps/web/engine/bridge/textBridge.ts:21, apps/web/engine/bridge/textBridge.ts:371, apps/web/engine/core/EngineRuntime.ts:54 |
| TextContentMeta | value_object | text | packages/engine/engine/bindings.cpp:418 | 4 × apps/web/engine/bridge/textBridge.ts:24, apps/web/engine/core/wasm-types.ts:23, apps/web/engine/core/wasm-types.ts:83 |
| TextEntityMeta | value_object | text | packages/engine/engine/bindings.cpp:457 | 11 × apps/web/engine/core/EngineRuntime.ts:28, apps/web/engine/core/EngineRuntime.ts:50, apps/web/engine/core/EngineRuntime.ts:507 |
| TextHitResult | value_object | text | packages/engine/engine/bindings.cpp:400 | 6 × apps/web/engine/bridge/textBridge.ts:20, apps/web/engine/bridge/textBridge.ts:360, apps/web/engine/core/EngineRuntime.ts:53 |
| TextSelectionRect | value_object | text | packages/engine/engine/bindings.cpp:450 | 15 × apps/web/components/TextCaretOverlay.tsx:17, apps/web/components/TextCaretOverlay.tsx:38, apps/web/components/TextCaretOverlay.tsx:232 |
| TextStyleSnapshot | value_object | text | packages/engine/engine/bindings.cpp:423 | 14 × apps/web/engine/bridge/textBridge.ts:28, apps/web/engine/bridge/textBridge.ts:52, apps/web/engine/core/wasm-types.ts:26 |
| TextureBufferMeta | value_object | text | packages/engine/engine/bindings.cpp:411 | 10 × apps/web/engine/bridge/textBridge.ts:23, apps/web/engine/bridge/textBridge.ts:531, apps/web/engine/core/EngineRuntime.ts:56 |
| TransformMode | enum | interaction | packages/engine/engine/bindings.cpp:38 | 25 × apps/web/engine/core/interactionSession.ts:5, apps/web/engine/core/interactionSession.ts:36, apps/web/features/editor/components/RotationTooltip.tsx:10 |
| TransformOpCode | enum | interaction | packages/engine/engine/bindings.cpp:45 | 15 × apps/web/engine/core/interactionSession.ts:14, apps/web/engine/core/interactionSession.ts:15, apps/web/engine/core/interactionSession.ts:120 |
| TransformState | value_object | interaction | packages/engine/engine/bindings.cpp:248 | 10 × apps/web/engine/core/EngineRuntime.ts:23, apps/web/engine/core/EngineRuntime.ts:417, apps/web/engine/core/interactionSession.ts:33 |
| VectorLayerRecord | vector | layers | packages/engine/engine/bindings.cpp:466 | — |
| VectorTextEntityMeta | vector | text | packages/engine/engine/bindings.cpp:465 | — |
| VectorTextSelectionRect | vector | text | packages/engine/engine/bindings.cpp:464 | — |
| VectorUInt32 | vector | core | packages/engine/engine/bindings.cpp:463 | 2 × apps/web/engine/core/wasm-types.ts:49, apps/web/engine/core/wasm-types.ts:119 |
| ackResync | function | core | packages/engine/engine/bindings.cpp:104 | — |
| allocBytes | function | core | packages/engine/engine/bindings.cpp:81 | — |
| allocateEntityId | function | core | packages/engine/engine/bindings.cpp:95 | — |
| allocateLayerId | function | layers | packages/engine/engine/bindings.cpp:96 | — |
| applyCommandBuffer | function | render | packages/engine/engine/bindings.cpp:83 | — |
| beginTransform | function | interaction | packages/engine/engine/bindings.cpp:187 | — |
| canRedo | function | core | packages/engine/engine/bindings.cpp:100 | — |
| canUndo | function | core | packages/engine/engine/bindings.cpp:99 | — |
| cancelTransform | function | interaction | packages/engine/engine/bindings.cpp:219 | — |
| clear | function | core | packages/engine/engine/bindings.cpp:80 | — |
| clearAtlasDirty | function | render | packages/engine/engine/bindings.cpp:161 | — |
| clearSelection | function | selection | packages/engine/engine/bindings.cpp:131 | — |
| clearTransformLog | function | interaction | packages/engine/engine/bindings.cpp:227 | — |
| commitTransform | function | interaction | packages/engine/engine/bindings.cpp:218 | — |
| deleteLayer | function | layers | packages/engine/engine/bindings.cpp:122 | — |
| freeBytes | function | core | packages/engine/engine/bindings.cpp:82 | — |
| getAllTextMetas | function | text | packages/engine/engine/bindings.cpp:165 | — |
| getAtlasTextureMeta | function | text | packages/engine/engine/bindings.cpp:159 | — |
| getCapabilities | function | core | packages/engine/engine/bindings.cpp:93 | — |
| getCommitResultCount | function | core | packages/engine/engine/bindings.cpp:222 | — |
| getCommitResultIdsPtr | function | core | packages/engine/engine/bindings.cpp:223 | — |
| getCommitResultOpCodesPtr | function | core | packages/engine/engine/bindings.cpp:224 | — |
| getCommitResultPayloadsPtr | function | core | packages/engine/engine/bindings.cpp:225 | — |
| getDocumentDigest | function | core | packages/engine/engine/bindings.cpp:97 | — |
| getDraftDimensions | function | core | packages/engine/engine/bindings.cpp:235 | — |
| getDrawOrderSnapshot | function | snap | packages/engine/engine/bindings.cpp:137 | — |
| getEntityAabb | function | core | packages/engine/engine/bindings.cpp:110 | — |
| getEntityFlags | function | core | packages/engine/engine/bindings.cpp:123 | — |
| getEntityKind | function | core | packages/engine/engine/bindings.cpp:127 | — |
| getEntityLayer | function | layers | packages/engine/engine/bindings.cpp:126 | — |
| getEntityTransform | function | interaction | packages/engine/engine/bindings.cpp:112 | — |
| getFullSnapshotMeta | function | snap | packages/engine/engine/bindings.cpp:92 | — |
| getHistoryMeta | function | history | packages/engine/engine/bindings.cpp:98 | — |
| getLayerName | function | layers | packages/engine/engine/bindings.cpp:119 | — |
| getLayerStyle | function | layers | packages/engine/engine/bindings.cpp:120 | — |
| getLayersSnapshot | function | layers | packages/engine/engine/bindings.cpp:118 | — |
| getLineBufferMeta | function | render | packages/engine/engine/bindings.cpp:89 | — |
| getLineDownIndex | function | core | packages/engine/engine/bindings.cpp:177 | — |
| getLineEndIndex | function | core | packages/engine/engine/bindings.cpp:175 | — |
| getLineStartIndex | function | core | packages/engine/engine/bindings.cpp:174 | — |
| getLineUpIndex | function | core | packages/engine/engine/bindings.cpp:176 | — |
| getOrientedHandleMeta | function | core | packages/engine/engine/bindings.cpp:108 | — |
| getPositionBufferMeta | function | render | packages/engine/engine/bindings.cpp:88 | — |
| getProtocolInfo | function | core | packages/engine/engine/bindings.cpp:94 | — |
| getSelectionBounds | function | selection | packages/engine/engine/bindings.cpp:111 | — |
| getSelectionGeneration | function | selection | packages/engine/engine/bindings.cpp:129 | — |
| getSelectionHandleMeta | function | selection | packages/engine/engine/bindings.cpp:107 | — |
| getSelectionIds | function | selection | packages/engine/engine/bindings.cpp:128 | — |
| getSelectionOutlineMeta | function | selection | packages/engine/engine/bindings.cpp:106 | — |
| getSelectionStyleSummary | function | selection | packages/engine/engine/bindings.cpp:130 | — |
| getSnapOverlayMeta | function | snap | packages/engine/engine/bindings.cpp:109 | — |
| getSnappedPoint | function | snap | packages/engine/engine/bindings.cpp:147 | — |
| getSnapshotBufferMeta | function | snap | packages/engine/engine/bindings.cpp:91 | — |
| getStats | function | core | packages/engine/engine/bindings.cpp:145 | — |
| getTextBounds | function | text | packages/engine/engine/bindings.cpp:178 | — |
| getTextCaretPosition | function | text | packages/engine/engine/bindings.cpp:156 | — |
| getTextContentMeta | function | text | packages/engine/engine/bindings.cpp:163 | — |
| getTextQuadBufferMeta | function | text | packages/engine/engine/bindings.cpp:158 | — |
| getTextSelectionRects | function | text | packages/engine/engine/bindings.cpp:164 | — |
| getTextStyleSnapshot | function | text | packages/engine/engine/bindings.cpp:166 | — |
| getTextStyleSummary | function | text | packages/engine/engine/bindings.cpp:167 | — |
| getTransformLogCount | function | interaction | packages/engine/engine/bindings.cpp:230 | — |
| getTransformLogIdCount | function | interaction | packages/engine/engine/bindings.cpp:232 | — |
| getTransformLogIdsPtr | function | interaction | packages/engine/engine/bindings.cpp:233 | — |
| getTransformLogPtr | function | interaction | packages/engine/engine/bindings.cpp:231 | — |
| getTransformState | function | interaction | packages/engine/engine/bindings.cpp:221 | — |
| getVertexCount | function | core | packages/engine/engine/bindings.cpp:86 | — |
| getVertexDataPtr | function | core | packages/engine/engine/bindings.cpp:87 | — |
| getVisualNextCharIndex | function | core | packages/engine/engine/bindings.cpp:171 | — |
| getVisualPrevCharIndex | function | core | packages/engine/engine/bindings.cpp:170 | — |
| getWordLeftIndex | function | core | packages/engine/engine/bindings.cpp:172 | — |
| getWordRightIndex | function | core | packages/engine/engine/bindings.cpp:173 | — |
| hasPendingEvents | function | events | packages/engine/engine/bindings.cpp:105 | — |
| hitTestText | function | text | packages/engine/engine/bindings.cpp:155 | — |
| initializeTextSystem | function | text | packages/engine/engine/bindings.cpp:152 | — |
| isAtlasDirty | function | render | packages/engine/engine/bindings.cpp:160 | — |
| isInteractionActive | function | core | packages/engine/engine/bindings.cpp:220 | — |
| isTextQuadsDirty | function | text | packages/engine/engine/bindings.cpp:162 | — |
| isTransformLogOverflowed | function | interaction | packages/engine/engine/bindings.cpp:229 | — |
| loadFont | function | core | packages/engine/engine/bindings.cpp:153 | — |
| loadFontEx | function | core | packages/engine/engine/bindings.cpp:154 | — |
| loadSnapshotFromPtr | function | snap | packages/engine/engine/bindings.cpp:85 | — |
| marqueeSelect | function | interaction | packages/engine/engine/bindings.cpp:136 | — |
| pick | function | interaction | packages/engine/engine/bindings.cpp:141 | — |
| pickEx | function | interaction | packages/engine/engine/bindings.cpp:142 | — |
| pollEvents | function | events | packages/engine/engine/bindings.cpp:103 | — |
| queryArea | function | core | packages/engine/engine/bindings.cpp:143 | — |
| queryMarquee | function | interaction | packages/engine/engine/bindings.cpp:144 | — |
| rebuildTextQuadBuffer | function | text | packages/engine/engine/bindings.cpp:157 | — |
| redo | function | core | packages/engine/engine/bindings.cpp:102 | — |
| reorderEntities | function | core | packages/engine/engine/bindings.cpp:138 | — |
| replayTransformLog | function | interaction | packages/engine/engine/bindings.cpp:228 | — |
| reserveWorld | function | core | packages/engine/engine/bindings.cpp:84 | — |
| saveSnapshot | function | snap | packages/engine/engine/bindings.cpp:90 | — |
| selectByPick | function | interaction | packages/engine/engine/bindings.cpp:135 | — |
| setEntityFlags | function | core | packages/engine/engine/bindings.cpp:124 | — |
| setEntityLayer | function | layers | packages/engine/engine/bindings.cpp:125 | — |
| setEntityLength | function | core | packages/engine/engine/bindings.cpp:116 | — |
| setEntityPosition | function | core | packages/engine/engine/bindings.cpp:113 | — |
| setEntityRotation | function | core | packages/engine/engine/bindings.cpp:115 | — |
| setEntityScale | function | core | packages/engine/engine/bindings.cpp:117 | — |
| setEntitySize | function | core | packages/engine/engine/bindings.cpp:114 | — |
| setLayerProps | function | layers | packages/engine/engine/bindings.cpp:121 | — |
| setSelection | function | selection | packages/engine/engine/bindings.cpp:132 | — |
| setSnapOptions | function | snap | packages/engine/engine/bindings.cpp:146 | — |
| setTextConstraintWidth | function | text | packages/engine/engine/bindings.cpp:168 | — |
| setTextPosition | function | text | packages/engine/engine/bindings.cpp:169 | — |
| setTransformLogEnabled | function | interaction | packages/engine/engine/bindings.cpp:226 | — |
| undo | function | core | packages/engine/engine/bindings.cpp:101 | — |
| updateTransform | function | interaction | packages/engine/engine/bindings.cpp:217 | — |