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
    primary: 'border-[#00d4ff]/30 text-[#00d4ff] bg-[#00d4ff]/10',
    secondary: 'border-[#8b5cf6]/30 text-[#8b5cf6] bg-[#8b5cf6]/10',
    success: 'border-[#00ff88]/30 text-[#00ff88] bg-[#00ff88]/10',
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
