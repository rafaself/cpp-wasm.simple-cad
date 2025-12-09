import React, { useState, useEffect } from 'react';
import NumberSpinner from './NumberSpinner';

interface EditableNumberProps {
    value: number;
    onChange: (val: number) => void;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
    className?: string; // Container className
    spinnerClassName?: string;
    displayClassName?: string;
}

const EditableNumber: React.FC<EditableNumberProps> = ({
    value,
    onChange,
    min,
    max,
    step = 1,
    suffix = '',
    className = "",
    spinnerClassName = "",
    displayClassName = ""
}) => {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <div className={`${className} flex items-center justify-center`}>
            {isEditing ? (
                <NumberSpinner
                    value={value}
                    onChange={onChange}
                    min={min}
                    max={max}
                    step={step}
                    suffix={suffix}
                    className={`w-full ${spinnerClassName}`}
                    autoFocus
                    onBlur={() => setIsEditing(false)}
                />
            ) : (
                <div 
                    onClick={() => setIsEditing(true)}
                    className={`cursor-pointer hover:bg-slate-700 px-1 rounded hover:text-white transition-colors flex items-center justify-center w-full h-full select-none ${displayClassName}`}
                    title="Clique para editar"
                >
                    {Math.round(value)}{suffix}
                </div>
            )}
        </div>
    );
};

export default EditableNumber;
