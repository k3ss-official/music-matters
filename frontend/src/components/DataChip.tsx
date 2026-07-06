import React from 'react';
import { LucideIcon } from 'lucide-react';

export type ChipVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'default';

interface DataChipProps {
    icon?: LucideIcon;
    label: string;
    value: React.ReactNode;
    variant?: ChipVariant;
}

const variantStyles: Record<ChipVariant, string> = {
    primary: 'border-[#7F77DD]/30 text-[#7F77DD] bg-[#7F77DD]/10',
    secondary: 'border-[#7F77DD]/30 text-[#7F77DD] bg-[#7F77DD]/10',
    success: 'border-[#1D9E75]/30 text-[#1D9E75] bg-[#1D9E75]/10',
    danger: 'border-[#ff3b5c]/30 text-[#ff3b5c] bg-[#ff3b5c]/10',
    default: 'border-white/10 text-gray-300 bg-white/5',
};

export function DataChip({ icon: Icon, label, value, variant = 'default' }: DataChipProps) {
    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded border ${variantStyles[variant]}`}>
            {Icon && <Icon size={14} className="opacity-70" />}
            <span className="text-xs font-medium uppercase tracking-wider opacity-70 font-sans">
                {label}
            </span>
            <span className="text-sm font-bold tracking-tight font-mono">
                {value}
            </span>
        </div>
    );
}
