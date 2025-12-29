import { useEffect } from 'react';

export interface KeyboardEffectsDeps {
  activeTool: string;
  engineTextEditActive: boolean;
  polygonSidesModal: { center: { x: number; y: number } } | null;
  draft: { kind: string; points?: { x: number; y: number }[]; current?: { x: number; y: number } | null };
  setPolygonSidesModal: (modal: null) => void;
  setDraft: (draft: { kind: 'none' }) => void;
  commitPolyline: (points: { x: number; y: number }[]) => void;
  cancelActiveEngineSession: (reason: string) => boolean;
}

/**
 * Consolidates all keyboard event effects for EngineInteractionLayer.
 * Handles:
 * - Polyline tool: Escape to cancel, Enter to commit
 * - Polygon modal: Escape to close
 * - Escape to cancel active engine session
 * - Blur/visibility change to cancel sessions
 */
export function useKeyboardEffects(deps: KeyboardEffectsDeps): void {
  const {
    activeTool,
    engineTextEditActive,
    polygonSidesModal,
    draft,
    setPolygonSidesModal,
    setDraft,
    commitPolyline,
    cancelActiveEngineSession,
  } = deps;

  // Polyline/Polygon tool keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      // Polygon modal escape
      if (polygonSidesModal && e.key === 'Escape') {
        e.preventDefault();
        setPolygonSidesModal(null);
        return;
      }

      if (activeTool !== 'polyline') return;

      // Polyline escape
      if (e.key === 'Escape') {
        if (draft.kind === 'polyline') {
          e.preventDefault();
          setDraft({ kind: 'none' });
        }
        return;
      }

      // Polyline enter to commit
      if (e.key === 'Enter') {
        if (draft.kind === 'polyline' && draft.points) {
          e.preventDefault();
          const points = draft.current ? [...draft.points, draft.current] : draft.points;
          commitPolyline(points);
          setDraft({ kind: 'none' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, polygonSidesModal, draft, commitPolyline, setDraft, setPolygonSidesModal]);

  // Escape to cancel engine session
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (engineTextEditActive) return;
      const canceled = cancelActiveEngineSession('escape');
      if (canceled) e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelActiveEngineSession, engineTextEditActive]);

  // Blur/visibility change
  useEffect(() => {
    const handleBlur = () => {
      if (engineTextEditActive) return;
      cancelActiveEngineSession('blur');
    };

    const handleVisibilityChange = () => {
      if (engineTextEditActive) return;
      if (document.visibilityState === 'hidden') {
        cancelActiveEngineSession('visibilitychange:hidden');
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cancelActiveEngineSession, engineTextEditActive]);
}
