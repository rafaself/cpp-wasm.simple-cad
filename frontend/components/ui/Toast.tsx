import { X, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import React from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  message: React.ReactNode;
  type?: ToastType;
  isVisible: boolean;
  onClose: () => void;
  duration?: number; // Auto-close after duration in ms. Set to 0 to disable auto-close.
  position?: 'top' | 'bottom';
}

const typeStyles: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
  info: {
    bg: 'bg-surface-strong',
    border: 'border-blue-500/50',
    icon: <Info size={18} className="text-blue-400" />,
  },
  success: {
    bg: 'bg-surface-strong',
    border: 'border-green-500/50',
    icon: <CheckCircle size={18} className="text-green-400" />,
  },
  warning: {
    bg: 'bg-surface-strong',
    border: 'border-yellow-500/50',
    icon: <AlertTriangle size={18} className="text-yellow-400" />,
  },
  error: {
    bg: 'bg-surface-strong',
    border: 'border-red-500/50',
    icon: <XCircle size={18} className="text-red-400" />,
  },
};

const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  isVisible,
  onClose,
  duration = 4000,
  position = 'bottom',
}) => {
  React.useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  const styles = typeStyles[type];
  const role = type === 'error' ? 'alert' : 'status';
  const positionClass = position === 'top' ? 'top-16' : 'bottom-8';
  const animationClass = position === 'top' ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2';

  return (
    <div
      className={`
        fixed left-1/2 -translate-x-1/2 ${positionClass}
        ${styles.bg} ${styles.border} border
        text-text px-4 py-3 rounded-lg shadow-xl
        z-[9999] flex items-center gap-3
        animate-in fade-in ${animationClass} duration-200
      `}
      role={role}
    >
      {styles.icon}
      <div className="text-sm">{message}</div>
      <button
        className="ml-2 text-text-muted hover:text-text transition-colors"
        onClick={onClose}
        aria-label="Fechar"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
