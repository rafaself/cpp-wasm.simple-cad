import { describe, it, expect } from 'vitest';
import {
  EXPECTED_PROTOCOL_INFO,
  EngineFeatureFlags,
  validateProtocolOrThrow,
} from '@/engine/core/protocol';

describe('validateProtocolOrThrow', () => {
  it('throws on protocol version mismatch', () => {
    const info = { ...EXPECTED_PROTOCOL_INFO, protocolVersion: EXPECTED_PROTOCOL_INFO.protocolVersion + 1 };
    expect(() => validateProtocolOrThrow(info)).toThrow(/protocolVersion/);
  });

  it('throws on abiHash mismatch', () => {
    const info = { ...EXPECTED_PROTOCOL_INFO, abiHash: EXPECTED_PROTOCOL_INFO.abiHash + 1 };
    expect(() => validateProtocolOrThrow(info)).toThrow(/abiHash/);
  });

  it('throws on command version mismatch', () => {
    const info = { ...EXPECTED_PROTOCOL_INFO, commandVersion: EXPECTED_PROTOCOL_INFO.commandVersion + 1 };
    expect(() => validateProtocolOrThrow(info)).toThrow(/commandVersion/);
  });

  it('throws on missing required feature flags', () => {
    const info = { ...EXPECTED_PROTOCOL_INFO, featureFlags: 0 };
    expect(() => validateProtocolOrThrow(info)).toThrow(/featureFlags/);
  });

  it('throws when overlay queries flag is missing', () => {
    const info = {
      ...EXPECTED_PROTOCOL_INFO,
      featureFlags: EngineFeatureFlags.FEATURE_PROTOCOL | EngineFeatureFlags.FEATURE_INTERACTIVE_TRANSFORM,
    };
    expect(() => validateProtocolOrThrow(info)).toThrow(/featureFlags/);
  });

  it('throws when interactive transform flag is missing', () => {
    const info = {
      ...EXPECTED_PROTOCOL_INFO,
      featureFlags: EngineFeatureFlags.FEATURE_PROTOCOL | EngineFeatureFlags.FEATURE_OVERLAY_QUERIES,
    };
    expect(() => validateProtocolOrThrow(info)).toThrow(/featureFlags/);
  });

  it('throws when engine history flag is missing', () => {
    const info = {
      ...EXPECTED_PROTOCOL_INFO,
      featureFlags:
        EngineFeatureFlags.FEATURE_PROTOCOL |
        EngineFeatureFlags.FEATURE_OVERLAY_QUERIES |
        EngineFeatureFlags.FEATURE_INTERACTIVE_TRANSFORM,
    };
    expect(() => validateProtocolOrThrow(info)).toThrow(/featureFlags/);
  });

  it('accepts when only required flags are present', () => {
    const info = {
      ...EXPECTED_PROTOCOL_INFO,
      featureFlags:
        EngineFeatureFlags.FEATURE_PROTOCOL |
        EngineFeatureFlags.FEATURE_OVERLAY_QUERIES |
        EngineFeatureFlags.FEATURE_INTERACTIVE_TRANSFORM |
        EngineFeatureFlags.FEATURE_ENGINE_HISTORY,
    };
    expect(() => validateProtocolOrThrow(info)).not.toThrow();
  });

  it('accepts matching protocol info', () => {
    expect(() => validateProtocolOrThrow(EXPECTED_PROTOCOL_INFO)).not.toThrow();
  });
});
