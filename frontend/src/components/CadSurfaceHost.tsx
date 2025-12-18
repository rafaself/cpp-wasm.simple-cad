import React, { useEffect, useMemo, useState } from 'react';
import type { EngineBackend } from '../engineBackend';
import { getInitialEngineBackend, persistEngineBackend } from '../engineBackend';
import LegacySurface from './LegacySurface';
import CadViewer from './CadViewer';

const DevBadge: React.FC<{ backend: EngineBackend; onSwitch: (b: EngineBackend) => void }> = ({ backend, onSwitch }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 8,
      right: 8,
      zIndex: 9999,
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      padding: '6px 10px',
      borderRadius: 6,
      fontSize: 12,
      fontFamily: 'monospace',
    }}>
      Engine: <strong>{backend}</strong>{' '}
      <button
        style={{ marginLeft: 6, padding: '2px 6px', fontSize: 12 }}
        onClick={() => onSwitch(backend === 'legacy' ? 'next' : 'legacy')}
      >
        switch
      </button>
    </div>
  );
};

const CadSurfaceNext: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100vh', background: '#0b1021' }}>
      <CadViewer />
    </div>
  );
};

const CadSurfaceHost: React.FC = () => {
  const [backend, setBackend] = useState<EngineBackend>(() => getInitialEngineBackend());
  const [failedOnce, setFailedOnce] = useState(false);

  useEffect(() => {
    persistEngineBackend(backend);
  }, [backend]);

  const content = useMemo(() => {
    if (backend === 'next') {
      return (
        <ErrorBoundary
          onError={() => {
            setFailedOnce(true);
            setBackend('legacy');
          }}
        >
          <CadSurfaceNext />
        </ErrorBoundary>
      );
    }
    return <LegacySurface />;
  }, [backend]);

  return (
    <>
      {content}
      <DevBadge backend={backend} onSwitch={setBackend} />
      {failedOnce && backend === 'legacy' ? (
        <div style={{
          position: 'fixed',
          bottom: 8,
          right: 8,
          background: 'rgba(239,68,68,0.9)',
          color: '#fff',
          padding: '6px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'monospace',
          zIndex: 9999,
        }}>
          Next engine failed — fallback to legacy.
        </div>
      ) : null}
    </>
  );
};

class ErrorBoundary extends React.Component<{ onError: () => void }, { hasError: boolean }> {
  constructor(props: { onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export default CadSurfaceHost;
