import type { VectorDocumentV1, VectorSidecar, VectorSidecarV1 } from '@/types';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isVectorDocumentV1 = (value: unknown): value is VectorDocumentV1 => {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  return Array.isArray(value.paths) && Array.isArray(value.draws);
};

const isVectorSidecarV1 = (value: unknown): value is VectorSidecarV1 => {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!isVectorDocumentV1(value.document)) return false;
  if (!isRecord(value.bindings)) return false;
  return true;
};

export const migrateVectorSidecar = (value: unknown): VectorSidecar | null => {
  if (!value) return null;
  if (isVectorSidecarV1(value)) return value;
  return null;
};
