/**
 * DrawingInspectorPanel - Inspector panel for entity transform properties
 *
 * Shows position, dimensions, and rotation for a single selected entity.
 * Only renders when exactly one entity is selected.
 *
 * Features:
 * - Real-time updates during drag/resize/rotate
 * - Draft/commit pattern (no feedback loops)
 * - Disabled state for locked entities
 * - Rotation field disabled for unsupported entity types
 * - All labels in Portuguese (pt-BR)
 */

import React from 'react';

import { Section } from '@/components/ui/Section';
import { useEntityTransform } from '@/engine/core/useEntityTransform';
import { useSetEntityTransform } from '@/engine/core/useEntityTransform';
import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { EngineEntityFlags } from '@/engine/core/protocol';

import { TransformField } from './TransformField';

export const DrawingInspectorPanel: React.FC = () => {
  const selectedIds = useEngineSelectionIds();
  const runtime = useEngineRuntime();

  // Get entityId (or null if not exactly 1 selected)
  const entityId = selectedIds.length === 1 ? selectedIds[0] : null;

  // Always call hooks (even if entityId is null)
  const transform = useEntityTransform(entityId);
  const { setPosition, setSize, setRotation, setLength } = useSetEntityTransform();

  // Only show when exactly 1 entity is selected
  if (!entityId || !transform) {
    return null;
  }

  // Check if entity is locked
  const flags = runtime?.getEntityFlags(entityId) ?? 0;
  const isLocked = (flags & EngineEntityFlags.Locked) !== 0;

  const supportsRotation = transform.hasRotation === 1;
  // Line and Arrow have height=0 and use width as length
  const isLineOrArrow = transform.height === 0;

  return (
    <div className="flex flex-col">
      {/* Posição Section */}
      <Section title="POSIÇÃO">
        <div className="grid grid-cols-2 gap-2">
          <TransformField
            label="X"
            value={transform.posX}
            onCommit={(x) => setPosition(entityId, x, transform.posY)}
            suffix="px"
            disabled={isLocked}
            title={isLocked ? 'Objeto bloqueado' : undefined}
            decimals={2}
          />
          <TransformField
            label="Y"
            value={transform.posY}
            onCommit={(y) => setPosition(entityId, transform.posX, y)}
            suffix="px"
            disabled={isLocked}
            title={isLocked ? 'Objeto bloqueado' : undefined}
            decimals={2}
          />
        </div>
      </Section>

      {/* Dimensões Section */}
      <Section title="DIMENSÕES">
        {isLineOrArrow ? (
          <TransformField
            label="Comprimento"
            value={transform.width}
            onCommit={(length) => setLength(entityId, length)}
            suffix="px"
            disabled={isLocked}
            title={isLocked ? 'Objeto bloqueado' : undefined}
            decimals={2}
            min={1}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <TransformField
              label="Largura"
              value={transform.width}
              onCommit={(width) => setSize(entityId, width, transform.height)}
              suffix="px"
              disabled={isLocked}
              title={isLocked ? 'Objeto bloqueado' : undefined}
              decimals={2}
              min={1}
            />
            <TransformField
              label="Altura"
              value={transform.height}
              onCommit={(height) => setSize(entityId, transform.width, height)}
              suffix="px"
              disabled={isLocked}
              title={isLocked ? 'Objeto bloqueado' : undefined}
              decimals={2}
              min={1}
            />
          </div>
        )}
      </Section>

      {/* Transformação Section */}
      <Section title="TRANSFORMAÇÃO">
        <TransformField
          label="Rotação"
          value={transform.rotationDeg}
          onCommit={(rotation) => setRotation(entityId, rotation)}
          suffix="°"
          disabled={isLocked || !supportsRotation}
          title={
            isLocked
              ? 'Objeto bloqueado'
              : !supportsRotation
                ? 'Rotação ainda não disponível para este tipo de objeto'
                : undefined
          }
          decimals={2}
        />
      </Section>
    </div>
  );
};
