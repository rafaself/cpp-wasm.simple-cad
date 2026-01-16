import React, { useState, useRef } from 'react';

interface RadiusInputModalProps {
  initialRadius: number;
  position: { x: number; y: number };
  onConfirm: (radius: number) => void;
  onCancel: () => void;
}

const RadiusInputModal: React.FC<RadiusInputModalProps> = ({
  initialRadius,
  position,
  onConfirm,
  onCancel,
}) => {
  // Use string for internal state to allow clearing input
  const [value, setValue] = useState(Math.round(initialRadius).toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const mountTime = useRef(Date.now());

  const handleBackdropClick = () => {
    // Prevent immediate dismissal if the click that opened the modal propagates to the backdrop
    if (Date.now() - mountTime.current < 500) return;
    onCancel();
  };

  const handleConfirm = () => {
    const val = parseFloat(value);
    if (!isNaN(val) && val > 0) {
      onConfirm(val);
    } else {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const isValid = !isNaN(parseFloat(value)) && parseFloat(value) > 0;

  return (
    <>
      {/* Backdrop for click-outside */}
      <div
        className="fixed inset-0 z-modal bg-transparent"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="radius-modal-title"
        className="fixed z-modal bg-surface-2 border border-border shadow-xl rounded-md p-2 flex flex-col gap-2 w-48 text-text"
        style={{ left: position.x, top: position.y }}
      >
        <div className="flex items-center justify-between border-b border-border pb-1 mb-1">
          <span id="radius-modal-title" className="text-xs font-bold text-text-muted uppercase">
            Definir Raio
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">R:</span>
          <input
            ref={inputRef}
            type="number"
            min="0.1"
            step="any"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`flex-grow bg-surface-2 border rounded px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary ${isValid ? 'border-border' : 'border-red-500 text-red-400'}`}
            aria-invalid={!isValid}
          />
          <span className="text-xs text-text-muted">px</span>
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs text-text-muted hover:bg-surface-2 rounded transition-colors"
            aria-label="Cancelar"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className={`px-2 py-1 text-xs text-white rounded transition-colors ${isValid ? 'bg-primary hover:bg-primary/90' : 'bg-surface-2 opacity-50 cursor-not-allowed'}`}
            aria-label="Confirmar"
          >
            OK
          </button>
        </div>
      </div>
    </>
  );
};

export default RadiusInputModal;
