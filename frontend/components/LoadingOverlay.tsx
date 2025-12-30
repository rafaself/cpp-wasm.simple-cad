import React, { useEffect, useState } from 'react';

import { useLoadingStore } from '../stores/useLoadingStore';

const LoadingOverlay: React.FC = () => {
  const { isLoading, message } = useLoadingStore();
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ease-in-out ${
        isVisible ? 'bg-slate-900/60 backdrop-blur-sm opacity-100' : 'bg-transparent opacity-0'
      }`}
      aria-busy="true"
      role="alert"
      aria-live="assertive"
    >
      <div
        className={`flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-800/80 border border-slate-700/50 shadow-2xl backdrop-blur-xl transform transition-all duration-300 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
      >
        {/* Spinner */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-blue-500/30 border-l-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 border-4 border-t-transparent border-r-blue-400/50 border-b-transparent border-l-blue-400/50 rounded-full animate-spin-reverse delay-150"></div>
        </div>

        {/* Text */}
        <span className="text-lg font-medium text-slate-100 tracking-wide animate-pulse-slow">
          {message}
        </span>
      </div>
    </div>
  );
};

export default LoadingOverlay;
