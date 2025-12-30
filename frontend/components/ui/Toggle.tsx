import React from 'react';

interface ToggleProps {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, className = '' }) => (
  <label className={`flex items-center justify-between py-2 cursor-pointer group ${className}`}>
    {label && (
      <span className="text-sm text-slate-300 group-hover:text-white select-none">{label}</span>
    )}
    <div
      className={`w-10 h-5 rounded-full p-0.5 transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-600'}`}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </div>
  </label>
);
