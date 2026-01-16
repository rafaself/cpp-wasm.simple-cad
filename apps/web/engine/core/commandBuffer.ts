/**
 * Command Buffer Encoding
 *
 * Binary encoding logic for engine commands.
 * Serializes EngineCommand objects into a compact binary protocol buffer.
 */

// Re-export all types for backward compatibility
export {
  COMMAND_BUFFER_MAGIC,
  CommandOp,
  type RectPayload,
  type LinePayload,
  type PolylinePayload,
  type SetViewScalePayload,
  type SetDrawOrderPayload,
  type CirclePayload,
  type PolygonPayload,
  type ArrowPayload,
  type LayerStylePayload,
  type LayerStyleEnabledPayload,
  type EntityStylePayload,
  type EntityStyleClearPayload,
  type EntityStyleEnabledPayload,
  type TextRunPayload,
  type TextPayload,
  type TextCaretPayload,
  type TextSelectionPayload,
  type TextInsertPayload,
  type TextDeletePayload,
  type TextReplacePayload,
  type TextAlignmentPayload,
  type BeginDraftPayload,
  type UpdateDraftPayload,
  type ApplyTextStylePayload,
  type EngineCommand,
} from './commandTypes';

import { COMMAND_BUFFER_MAGIC, CommandOp, type EngineCommand } from './commandTypes';

// UTF-8 encoder for text content
const textEncoder = new TextEncoder();

const writeU32 = (view: DataView, offset: number, value: number): number => {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
};

const writeF32 = (view: DataView, offset: number, value: number): number => {
  view.setFloat32(offset, value, true);
  return offset + 4;
};

const payloadByteLength = (cmd: EngineCommand): number => {
  switch (cmd.op) {
    case CommandOp.ClearAll:
    case CommandOp.DeleteEntity:
    case CommandOp.DeleteText:
      return 0;
    case CommandOp.SetViewScale:
      return 20; // 5 floats (x, y, scale, width, height)
    case CommandOp.SetDrawOrder:
      return 8 + cmd.order.ids.length * 4; // u32 count + u32 reserved + u32 ids[]
    case CommandOp.UpsertRect:
      return 56; // 14 floats * 4 bytes/float
    case CommandOp.UpsertLine:
      return 40; // 10 floats * 4 bytes/float (includes strokeWidthPx)
    case CommandOp.UpsertPolyline:
      return 32 + cmd.polyline.points.length * 8; // header (6 floats + u32 count + u32 reserved) + points
    case CommandOp.UpsertCircle:
      return 68; // 17 floats
    case CommandOp.UpsertPolygon:
      return 72; // 17 floats + u32 sides
    case CommandOp.UpsertArrow:
      return 44; // 11 floats
    // Text commands
    case CommandOp.UpsertText: {
      // TextPayloadHeader (28 bytes) + TextRunPayload * runCount (24 bytes each) + UTF-8 content
      const contentBytes = textEncoder.encode(cmd.text.content).length;
      return 28 + cmd.text.runs.length * 24 + contentBytes;
    }
    case CommandOp.SetTextCaret:
      return 8; // textId (u32) + caretIndex (u32)
    case CommandOp.SetTextSelection:
      return 12; // textId (u32) + selectionStart (u32) + selectionEnd (u32)
    case CommandOp.InsertTextContent: {
      // TextInsertPayloadHeader (16 bytes) + UTF-8 content
      const insertBytes = textEncoder.encode(cmd.insert.content).length;
      return 16 + insertBytes;
    }
    case CommandOp.DeleteTextContent:
      return 16; // textId (u32) + startIndex (u32) + endIndex (u32) + reserved (u32)
    case CommandOp.ReplaceTextContent: {
      const replaceBytes = textEncoder.encode(cmd.replace.content).length;
      return 16 + replaceBytes; // textId (u32) + startIndex (u32) + endIndex (u32) + byteLength (u32) + UTF-8
    }
    case CommandOp.ApplyTextStyle: {
      const paramsLen = cmd.style.styleParams.byteLength;
      return 18 + paramsLen; // header (18 bytes) + TLV params
    }
    case CommandOp.SetTextAlign:
      return 8; // textId (u32) + align (u8) + reserved (3 bytes)
    case CommandOp.SetLayerStyle:
      return 8; // target (u8) + reserved (3) + colorRGBA (u32)
    case CommandOp.SetLayerStyleEnabled:
      return 4; // target (u8) + enabled (u8) + reserved (2)
    case CommandOp.SetEntityStyleOverride:
      return 16 + cmd.style.ids.length * 4; // header (16 bytes) + ids
    case CommandOp.ClearEntityStyleOverride:
      return 12 + cmd.clear.ids.length * 4; // header (12 bytes) + ids
    case CommandOp.SetEntityStyleEnabled:
      return 12 + cmd.enabled.ids.length * 4; // header (12 bytes) + ids
    case CommandOp.BeginDraft:
      return 64; // 16 floats/u32 * 4
    case CommandOp.UpdateDraft:
    case CommandOp.AppendDraftPoint:
      return 12; // x, y, modifiers
    case CommandOp.CommitDraft:
    case CommandOp.CancelDraft:
      return 0;
  }
};

export const encodeCommandBuffer = (commands: readonly EngineCommand[]): Uint8Array => {
  // Header: magic (u32) + version (u32) + commandCount (u32) + reserved (u32)
  const headerBytes = 16;
  // Per command: op (u32) + id (u32) + payloadByteCount (u32) + reserved (u32) + payload...
  const commandHeadersBytes = commands.length * 16;
  const payloadBytes = commands.reduce((sum, c) => sum + payloadByteLength(c), 0);

  const totalBytes = headerBytes + commandHeadersBytes + payloadBytes;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  let o = 0;

  o = writeU32(view, o, COMMAND_BUFFER_MAGIC);
  o = writeU32(view, o, 3); // version
  o = writeU32(view, o, commands.length);
  o = writeU32(view, o, 0);

  for (const cmd of commands) {
    o = writeU32(view, o, cmd.op);
    o = writeU32(view, o, 'id' in cmd ? cmd.id : 0);
    const bytes = payloadByteLength(cmd);
    o = writeU32(view, o, bytes);
    o = writeU32(view, o, 0);

    switch (cmd.op) {
      case CommandOp.ClearAll:
      case CommandOp.DeleteEntity:
      case CommandOp.DeleteText:
      case CommandOp.CommitDraft:
      case CommandOp.CancelDraft:
        break;
      case CommandOp.SetViewScale:
        o = writeF32(view, o, cmd.view.x);
        o = writeF32(view, o, cmd.view.y);
        o = writeF32(view, o, cmd.view.scale);
        o = writeF32(view, o, cmd.view.width);
        o = writeF32(view, o, cmd.view.height);
        break;
      case CommandOp.SetDrawOrder:
        o = writeU32(view, o, cmd.order.ids.length);
        o = writeU32(view, o, 0);
        for (const id of cmd.order.ids) o = writeU32(view, o, id);
        break;
      case CommandOp.UpsertRect:
        o = writeF32(view, o, cmd.rect.x);
        o = writeF32(view, o, cmd.rect.y);
        o = writeF32(view, o, cmd.rect.w);
        o = writeF32(view, o, cmd.rect.h);
        o = writeF32(view, o, cmd.rect.fillR);
        o = writeF32(view, o, cmd.rect.fillG);
        o = writeF32(view, o, cmd.rect.fillB);
        o = writeF32(view, o, cmd.rect.fillA);
        o = writeF32(view, o, cmd.rect.strokeR);
        o = writeF32(view, o, cmd.rect.strokeG);
        o = writeF32(view, o, cmd.rect.strokeB);
        o = writeF32(view, o, cmd.rect.strokeA);
        o = writeF32(view, o, cmd.rect.strokeEnabled);
        o = writeF32(view, o, cmd.rect.strokeWidthPx);
        break;
      case CommandOp.UpsertLine:
        o = writeF32(view, o, cmd.line.x0);
        o = writeF32(view, o, cmd.line.y0);
        o = writeF32(view, o, cmd.line.x1);
        o = writeF32(view, o, cmd.line.y1);
        o = writeF32(view, o, cmd.line.r);
        o = writeF32(view, o, cmd.line.g);
        o = writeF32(view, o, cmd.line.b);
        o = writeF32(view, o, cmd.line.a);
        o = writeF32(view, o, cmd.line.enabled);
        o = writeF32(view, o, cmd.line.strokeWidthPx);
        break;
      case CommandOp.UpsertPolyline:
        o = writeF32(view, o, cmd.polyline.r);
        o = writeF32(view, o, cmd.polyline.g);
        o = writeF32(view, o, cmd.polyline.b);
        o = writeF32(view, o, cmd.polyline.a);
        o = writeF32(view, o, cmd.polyline.enabled);
        o = writeF32(view, o, cmd.polyline.strokeWidthPx);
        o = writeU32(view, o, cmd.polyline.points.length);
        o = writeU32(view, o, 0);
        for (const p of cmd.polyline.points) {
          o = writeF32(view, o, p.x);
          o = writeF32(view, o, p.y);
        }
        break;
      case CommandOp.UpsertCircle:
        o = writeF32(view, o, cmd.circle.cx);
        o = writeF32(view, o, cmd.circle.cy);
        o = writeF32(view, o, cmd.circle.rx);
        o = writeF32(view, o, cmd.circle.ry);
        o = writeF32(view, o, cmd.circle.rot);
        o = writeF32(view, o, cmd.circle.sx);
        o = writeF32(view, o, cmd.circle.sy);
        o = writeF32(view, o, cmd.circle.fillR);
        o = writeF32(view, o, cmd.circle.fillG);
        o = writeF32(view, o, cmd.circle.fillB);
        o = writeF32(view, o, cmd.circle.fillA);
        o = writeF32(view, o, cmd.circle.strokeR);
        o = writeF32(view, o, cmd.circle.strokeG);
        o = writeF32(view, o, cmd.circle.strokeB);
        o = writeF32(view, o, cmd.circle.strokeA);
        o = writeF32(view, o, cmd.circle.strokeEnabled);
        o = writeF32(view, o, cmd.circle.strokeWidthPx);
        break;
      case CommandOp.UpsertPolygon:
        o = writeF32(view, o, cmd.polygon.cx);
        o = writeF32(view, o, cmd.polygon.cy);
        o = writeF32(view, o, cmd.polygon.rx);
        o = writeF32(view, o, cmd.polygon.ry);
        o = writeF32(view, o, cmd.polygon.rot);
        o = writeF32(view, o, cmd.polygon.sx);
        o = writeF32(view, o, cmd.polygon.sy);
        o = writeF32(view, o, cmd.polygon.fillR);
        o = writeF32(view, o, cmd.polygon.fillG);
        o = writeF32(view, o, cmd.polygon.fillB);
        o = writeF32(view, o, cmd.polygon.fillA);
        o = writeF32(view, o, cmd.polygon.strokeR);
        o = writeF32(view, o, cmd.polygon.strokeG);
        o = writeF32(view, o, cmd.polygon.strokeB);
        o = writeF32(view, o, cmd.polygon.strokeA);
        o = writeF32(view, o, cmd.polygon.strokeEnabled);
        o = writeF32(view, o, cmd.polygon.strokeWidthPx);
        o = writeU32(view, o, cmd.polygon.sides >>> 0);
        break;
      case CommandOp.UpsertArrow:
        o = writeF32(view, o, cmd.arrow.ax);
        o = writeF32(view, o, cmd.arrow.ay);
        o = writeF32(view, o, cmd.arrow.bx);
        o = writeF32(view, o, cmd.arrow.by);
        o = writeF32(view, o, cmd.arrow.head);
        o = writeF32(view, o, cmd.arrow.strokeR);
        o = writeF32(view, o, cmd.arrow.strokeG);
        o = writeF32(view, o, cmd.arrow.strokeB);
        o = writeF32(view, o, cmd.arrow.strokeA);
        o = writeF32(view, o, cmd.arrow.strokeEnabled);
        o = writeF32(view, o, cmd.arrow.strokeWidthPx);
        break;
      // ========== Text Commands ==========
      case CommandOp.UpsertText: {
        const contentBytes = textEncoder.encode(cmd.text.content);
        // TextPayloadHeader (28 bytes)
        o = writeF32(view, o, cmd.text.x);
        o = writeF32(view, o, cmd.text.y);
        o = writeF32(view, o, cmd.text.rotation);
        view.setUint8(o, cmd.text.boxMode & 0xff);
        view.setUint8(o + 1, cmd.text.align & 0xff);
        view.setUint8(o + 2, 0); // reserved
        view.setUint8(o + 3, 0); // reserved
        o += 4;
        o = writeF32(view, o, cmd.text.constraintWidth);
        o = writeU32(view, o, cmd.text.runs.length);
        o = writeU32(view, o, contentBytes.length);
        // TextRunPayload * runCount (20 bytes each)
        for (const run of cmd.text.runs) {
          o = writeU32(view, o, run.startIndex);
          o = writeU32(view, o, run.length);
          o = writeU32(view, o, run.fontId);
          o = writeF32(view, o, run.fontSize);
          o = writeU32(view, o, run.colorRGBA >>> 0);
          view.setUint8(o, run.flags & 0xff);
          view.setUint8(o + 1, 0); // reserved
          view.setUint8(o + 2, 0); // reserved
          view.setUint8(o + 3, 0); // reserved
          o += 4;
        }
        // UTF-8 content
        new Uint8Array(buf, o, contentBytes.length).set(contentBytes);
        o += contentBytes.length;
        break;
      }
      case CommandOp.SetTextCaret:
        o = writeU32(view, o, cmd.caret.textId);
        o = writeU32(view, o, cmd.caret.caretIndex);
        break;
      case CommandOp.SetTextSelection:
        o = writeU32(view, o, cmd.selection.textId);
        o = writeU32(view, o, cmd.selection.selectionStart);
        o = writeU32(view, o, cmd.selection.selectionEnd);
        break;
      case CommandOp.InsertTextContent: {
        const insertBytes = textEncoder.encode(cmd.insert.content);
        // TextInsertPayloadHeader (16 bytes)
        o = writeU32(view, o, cmd.insert.textId);
        o = writeU32(view, o, cmd.insert.insertIndex);
        o = writeU32(view, o, insertBytes.length);
        o = writeU32(view, o, 0); // reserved
        // UTF-8 content
        new Uint8Array(buf, o, insertBytes.length).set(insertBytes);
        o += insertBytes.length;
        break;
      }
      case CommandOp.DeleteTextContent:
        o = writeU32(view, o, cmd.del.textId);
        o = writeU32(view, o, cmd.del.startIndex);
        o = writeU32(view, o, cmd.del.endIndex);
        o = writeU32(view, o, 0); // reserved
        break;
      case CommandOp.ReplaceTextContent: {
        const replaceBytes = textEncoder.encode(cmd.replace.content);
        o = writeU32(view, o, cmd.replace.textId);
        o = writeU32(view, o, cmd.replace.startIndex);
        o = writeU32(view, o, cmd.replace.endIndex);
        o = writeU32(view, o, replaceBytes.length);
        new Uint8Array(buf, o, replaceBytes.length).set(replaceBytes);
        o += replaceBytes.length;
        break;
      }
      case CommandOp.ApplyTextStyle: {
        o = writeU32(view, o, cmd.style.textId);
        o = writeU32(view, o, cmd.style.rangeStartLogical);
        o = writeU32(view, o, cmd.style.rangeEndLogical);
        view.setUint8(o++, cmd.style.flagsMask & 0xff);
        view.setUint8(o++, cmd.style.flagsValue & 0xff);
        view.setUint8(o++, cmd.style.mode & 0xff);
        view.setUint8(o++, cmd.style.styleParamsVersion & 0xff);
        view.setUint16(o, cmd.style.styleParams.byteLength, true);
        o += 2;
        new Uint8Array(buf, o, cmd.style.styleParams.byteLength).set(cmd.style.styleParams);
        o += cmd.style.styleParams.byteLength;
        break;
      }
      case CommandOp.SetTextAlign:
        o = writeU32(view, o, cmd.align.textId);
        view.setUint8(o++, cmd.align.align & 0xff);
        view.setUint8(o++, 0); // reserved
        view.setUint8(o++, 0); // reserved
        view.setUint8(o++, 0); // reserved
        break;
      case CommandOp.SetLayerStyle:
        view.setUint8(o++, cmd.style.target & 0xff);
        view.setUint8(o++, 0);
        view.setUint16(o, 0, true);
        o += 2;
        o = writeU32(view, o, cmd.style.colorRGBA);
        break;
      case CommandOp.SetLayerStyleEnabled:
        view.setUint8(o++, cmd.style.target & 0xff);
        view.setUint8(o++, cmd.style.enabled ? 1 : 0);
        view.setUint16(o, 0, true);
        o += 2;
        break;
      case CommandOp.SetEntityStyleOverride:
        view.setUint8(o++, cmd.style.target & 0xff);
        view.setUint8(o++, 0);
        view.setUint16(o, 0, true);
        o += 2;
        o = writeU32(view, o, cmd.style.colorRGBA);
        o = writeU32(view, o, cmd.style.ids.length);
        o = writeU32(view, o, 0);
        for (const id of cmd.style.ids) o = writeU32(view, o, id);
        break;
      case CommandOp.ClearEntityStyleOverride:
        view.setUint8(o++, cmd.clear.target & 0xff);
        view.setUint8(o++, 0);
        view.setUint16(o, 0, true);
        o += 2;
        o = writeU32(view, o, cmd.clear.ids.length);
        o = writeU32(view, o, 0);
        for (const id of cmd.clear.ids) o = writeU32(view, o, id);
        break;
      case CommandOp.SetEntityStyleEnabled:
        view.setUint8(o++, cmd.enabled.target & 0xff);
        view.setUint8(o++, cmd.enabled.enabled ? 1 : 0);
        view.setUint16(o, 0, true);
        o += 2;
        o = writeU32(view, o, cmd.enabled.ids.length);
        o = writeU32(view, o, 0);
        for (const id of cmd.enabled.ids) o = writeU32(view, o, id);
        break;
      case CommandOp.BeginDraft:
        o = writeU32(view, o, cmd.draft.kind);
        o = writeF32(view, o, cmd.draft.x);
        o = writeF32(view, o, cmd.draft.y);
        o = writeF32(view, o, cmd.draft.fillR);
        o = writeF32(view, o, cmd.draft.fillG);
        o = writeF32(view, o, cmd.draft.fillB);
        o = writeF32(view, o, cmd.draft.fillA);
        o = writeF32(view, o, cmd.draft.strokeR);
        o = writeF32(view, o, cmd.draft.strokeG);
        o = writeF32(view, o, cmd.draft.strokeB);
        o = writeF32(view, o, cmd.draft.strokeA);
        o = writeF32(view, o, cmd.draft.strokeEnabled);
        o = writeF32(view, o, cmd.draft.strokeWidthPx);
        o = writeF32(view, o, cmd.draft.sides);
        o = writeF32(view, o, cmd.draft.head);
        o = writeU32(view, o, cmd.draft.flags);
        break;
      case CommandOp.UpdateDraft:
      case CommandOp.AppendDraftPoint:
        o = writeF32(view, o, cmd.pos.x);
        o = writeF32(view, o, cmd.pos.y);
        o = writeU32(view, o, cmd.pos.modifiers >>> 0);
        break;
    }
  }

  return new Uint8Array(buf);
};
