"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var EngineRuntime_1 = require("@/engine/core/EngineRuntime");
var singleton_1 = require("@/engine/core/singleton");
var usePanZoom_1 = require("@/features/editor/hooks/interaction/usePanZoom");
var useInteractionManager_1 = require("@/features/editor/interactions/useInteractionManager");
var useSettingsStore_1 = require("@/stores/useSettingsStore");
var useUIStore_1 = require("@/stores/useUIStore");
var cadDebug_1 = require("@/utils/dev/cadDebug");
var viewportMath_1 = require("@/utils/viewportMath");
var CenterOriginIcon_1 = require("./CenterOriginIcon");
var RotationTooltip_1 = require("./RotationTooltip");
var ShapeOverlay_1 = require("./ShapeOverlay");
var EngineInteractionLayer = function () {
    // Store Hooks
    var viewTransform = (0, useUIStore_1.useUIStore)(function (s) { return s.viewTransform; });
    var setMousePos = (0, useUIStore_1.useUIStore)(function (s) { return s.setMousePos; });
    var setIsMouseOverCanvas = (0, useUIStore_1.useUIStore)(function (s) { return s.setIsMouseOverCanvas; });
    var canvasSize = (0, useUIStore_1.useUIStore)(function (s) { return s.canvasSize; });
    var snapOptions = (0, useSettingsStore_1.useSettingsStore)(function (s) { return s.snap; });
    var gridSize = (0, useSettingsStore_1.useSettingsStore)(function (s) { return s.grid.size; });
    var centerIconSettings = (0, useSettingsStore_1.useSettingsStore)(function (s) { return s.display.centerIcon; });
    // Interaction Manager (The Brain)
    var _a = (0, useInteractionManager_1.useInteractionManager)(), handlers = _a.handlers, overlay = _a.overlay, activeHandlerName = _a.activeHandlerName, handlerCursor = _a.cursor;
    // PanZoom Hook (Can coexist or be merged, currently keeping simple)
    var _b = (0, usePanZoom_1.usePanZoom)(), isPanning = _b.isPanning, isPanningRef = _b.isPanningRef, beginPan = _b.beginPan, updatePan = _b.updatePan, endPan = _b.endPan, handleWheel = _b.handleWheel;
    // Mouse Pos Throttling
    var mousePosRef = react_1.default.useRef(null);
    var rafRef = react_1.default.useRef(null);
    var flushMousePos = react_1.default.useCallback(function () {
        if (mousePosRef.current) {
            setMousePos(mousePosRef.current);
            mousePosRef.current = null;
        }
        rafRef.current = null;
    }, [setMousePos]);
    (0, react_1.useEffect)(function () {
        return function () {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);
    // Cursor Logic
    var DEFAULT_CANVAS_CURSOR = 'url(/assets/cursor-canva-default.svg) 3 3, auto';
    var cursor = isPanning ? 'grabbing' : handlerCursor || DEFAULT_CANVAS_CURSOR;
    var logPointer = function (label, e, extra) {
        (0, cadDebug_1.cadDebugLog)('pointer', label, function () {
            var payload = {
                type: e.type,
                pointerId: e.pointerId,
                button: e.button,
                buttons: e.buttons,
                clientX: e.clientX,
                clientY: e.clientY,
                altKey: e.altKey,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                metaKey: e.metaKey,
            };
            var extraPayload = extra === null || extra === void 0 ? void 0 : extra();
            if (extraPayload) {
                Object.assign(payload, extraPayload);
            }
            return payload;
        });
    };
    // Engine Sync Effects (View/Grid)
    (0, react_1.useEffect)(function () {
        (0, singleton_1.getEngineRuntime)().then(function (rt) {
            var _a;
            (_a = rt.setSnapOptions) === null || _a === void 0 ? void 0 : _a.call(rt, snapOptions.enabled, snapOptions.grid, gridSize, snapOptions.tolerancePx, snapOptions.endpoint, snapOptions.midpoint, snapOptions.center, snapOptions.nearest);
        });
    }, [
        snapOptions.enabled,
        snapOptions.grid,
        snapOptions.tolerancePx,
        snapOptions.endpoint,
        snapOptions.midpoint,
        snapOptions.center,
        snapOptions.nearest,
        gridSize,
    ]);
    (0, react_1.useEffect)(function () {
        (0, singleton_1.getEngineRuntime)().then(function (rt) {
            rt.apply([
                {
                    op: EngineRuntime_1.CommandOp.SetViewScale,
                    view: {
                        x: viewTransform.x,
                        y: viewTransform.y,
                        scale: viewTransform.scale,
                        width: canvasSize.width,
                        height: canvasSize.height,
                    },
                },
            ]);
        });
    }, [viewTransform, canvasSize]);
    // Pointer Events Wrapper
    var handlePointerDown = function (e) {
        logPointer('pointerdown', e, function () { return ({
            handler: activeHandlerName,
            isPanning: isPanningRef.current,
        }); });
        e.currentTarget.setPointerCapture(e.pointerId);
        (0, cadDebug_1.cadDebugLog)('pointer', 'setPointerCapture', function () { return ({ pointerId: e.pointerId }); });
        if (e.button === 1 || e.button === 2 || e.altKey || activeHandlerName === 'pan') {
            // Or check active tool
            // Quick Pan Override or Explicit Pan Tool
            if (e.button === 1 || e.altKey || (activeHandlerName === 'pan' && e.button === 0)) {
                beginPan(e);
                return;
            }
        }
        handlers.onPointerDown(e);
    };
    var handlePointerMove = function (e) {
        logPointer('pointermove', e, function () { return ({
            handler: activeHandlerName,
            isPanning: isPanningRef.current,
        }); });
        // Update Global Mouse Pos (Throttled)
        var rect = e.currentTarget.getBoundingClientRect();
        var world = (0, viewportMath_1.screenToWorld)({ x: e.clientX - rect.left, y: e.clientY - rect.top }, viewTransform);
        mousePosRef.current = world;
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flushMousePos);
        }
        if (isPanningRef.current) {
            updatePan(e);
            return;
        }
        handlers.onPointerMove(e);
    };
    var handlePointerUp = function (e) {
        logPointer('pointerup', e, function () { return ({
            handler: activeHandlerName,
            isPanning: isPanningRef.current,
        }); });
        if (isPanningRef.current) {
            endPan();
            return;
        }
        handlers.onPointerUp(e);
    };
    var handlePointerCancel = function (e) {
        var _a;
        logPointer('pointercancel', e, function () { return ({
            handler: activeHandlerName,
            isPanning: isPanningRef.current,
        }); });
        if (isPanningRef.current) {
            endPan();
            return;
        }
        (_a = handlers.onCancel) === null || _a === void 0 ? void 0 : _a.call(handlers);
    };
    // Center Icon Calculation
    var centerScreen = (0, viewportMath_1.worldToScreen)({ x: 0, y: 0 }, viewTransform);
    return (<div style={{ position: 'absolute', inset: 0, zIndex: 'var(--z-canvas-hud)', touchAction: 'none', cursor: cursor }} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onDoubleClick={function (e) {
            logPointer('doubleclick', e);
            handlers.onDoubleClick(e);
        }} onContextMenu={function (e) { return e.preventDefault(); }} onPointerCancel={handlePointerCancel} onLostPointerCapture={function (e) {
            logPointer('lostpointercapture', e);
        }} onPointerEnter={function () { return setIsMouseOverCanvas(true); }} onPointerLeave={function () { return setIsMouseOverCanvas(false); }}>
      <ShapeOverlay_1.default />
      <RotationTooltip_1.default />

      {/* Center Icon */}
      {centerIconSettings.show && (<div style={{
                position: 'absolute',
                left: centerScreen.x,
                top: centerScreen.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                color: centerIconSettings.color,
            }}>
          <CenterOriginIcon_1.default />
        </div>)}

      {/* Dynamic Overlay from Active Handler */}
      {overlay}
    </div>);
};
exports.default = EngineInteractionLayer;
