import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    className?: string;
    placeholder?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ 
    value, 
    onChange, 
    options, 
    className = "",
    placeholder = "Select..."
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const updateDropdownPosition = () => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updateDropdownPosition();
            // Optional: Handle resize or scroll to update position
            window.addEventListener('scroll', updateDropdownPosition, true);
            window.addEventListener('resize', updateDropdownPosition);
            return () => {
                window.removeEventListener('scroll', updateDropdownPosition, true);
                window.removeEventListener('resize', updateDropdownPosition);
            };
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!isOpen) return;
            const target = event.target as Node | null;
            if (!target) return;
            if (buttonRef.current?.contains(target)) return;
            if (dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
    };

    const selectedLabel = options.find(o => o.value === value)?.label || value || placeholder;

    return (
        <div className="relative w-full">
            <button
                ref={buttonRef}
                onClick={() => {
                    if (!isOpen) updateDropdownPosition();
                    setIsOpen(!isOpen);
                }}
                className={`flex items-center justify-between px-2 cursor-pointer w-full text-left ${className}`}
            >
                <span className="truncate">{selectedLabel}</span>
                <ChevronDown 
                    size={12} 
                    className={`text-slate-500 transition-transform duration-300 ease-in-out ${isOpen ? 'rotate-180' : 'rotate-0'}`} 
                />
            </button>
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed bg-slate-800 border border-slate-600 shadow-xl rounded-lg z-[9999] max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 ease-out py-1 custom-scrollbar"
                    style={{ top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 140) }}
                >
                    {options.map((option) => (
                        <div 
                            key={option.value} 
                            className={`px-3 py-2 text-xs text-slate-200 hover:bg-slate-700/50 cursor-pointer transition-colors ${option.value === value ? 'bg-slate-700 text-blue-400' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSelect(option.value);
                            }}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

export default CustomSelect;
