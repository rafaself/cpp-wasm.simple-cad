import React, { useRef, useState } from 'react';

import { TextField } from '@/components/ui';

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

  const parsed = parseFloat(value);
  const isValid = !isNaN(parsed) && parsed > 0;

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
        className="fixed z-modal bg-surface-2 border border-border shadow-xl rounded-md p-3 flex flex-col gap-3 w-56 text-text"
        style={{ left: position.x, top: position.y }}
      >
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span id="radius-modal-title" className="text-xs font-bold text-text-muted uppercase">
            Definir Raio
          </span>
        </div>
        <TextField
          ref={inputRef}
          inputMode="decimal"
          type="number"
          min="0.1"
          step="any"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={!isValid}
          label="R (px)"
          errorText={isValid ? undefined : 'Informe um valor maior que zero'}
        />
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs text-text-muted hover:bg-surface-2 rounded transition-colors focus-outline"
            aria-label="Cancelar"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className={`px-2 py-1 text-xs text-white rounded transition-colors ${
              isValid
                ? 'bg-primary hover:bg-primary/90'
                : 'bg-surface-2 opacity-50 cursor-not-allowed'
            }`}
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
