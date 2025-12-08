import React from 'react';
import { Info, X } from 'lucide-react';

interface UserHintProps {
  message: string;
  visible: boolean;
  type?: 'info' | 'warning';
  label?: string;
  onClose?: () => void;
}

const UserHint: React.FC<UserHintProps> = ({ message, visible, type = 'info', label = 'Hint', onClose }) => {
  if (!visible) return null;

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[60]">
      <div className={`
        flex items-center gap-2 px-4 py-2 rounded-full shadow-lg backdrop-blur-md border pointer-events-auto menu-transition
        ${type === 'info' 
          ? 'bg-blue-500/90 border-blue-400/50 text-white' 
          : 'bg-yellow-500/90 border-yellow-400/50 text-white'}
      `}>
        <Info size={16} className="animate-pulse" />
        <span className="text-sm font-medium tracking-wide shadow-black drop-shadow-sm whitespace-nowrap">
          {message}
        </span>
        <span className="ml-2 text-[10px] bg-white/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider opacity-80">
          {label}
        </span>
        {onClose && (
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            className="ml-2 p-0.5 hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default UserHint;