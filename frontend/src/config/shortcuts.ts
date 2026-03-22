export type ShortcutCategory = 'A' | 'B' | 'C' | 'D';

export interface ShortcutDef {
    key: string;
    modifiers?: Array<'cmd' | 'alt' | 'shift'>;
    description: string;
    category: ShortcutCategory;
}

export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
    A: 'Ultra-Granular (single key)',
    B: 'Beat-Aware (⌘⌥)',
    C: 'Absolute Jumps (⌘⌥⇧)',
    D: 'File / Export (⌘)',
};

export const SHORTCUTS: ShortcutDef[] = [
    // ── A: Single keys ──────────────────────────────────────────────────────
    { key: 'i',         description: 'Mark Loop IN',                   category: 'A' },
    { key: 'o',         description: 'Mark Loop OUT',                  category: 'A' },
    { key: ' ',         description: 'Play / Pause',                   category: 'A' },
    { key: 'Escape',    description: 'Stop (hold position)',            category: 'A' },
    { key: 'ArrowLeft', description: 'Scrub Left 100ms',               category: 'A' },
    { key: 'ArrowRight',description: 'Scrub Right 100ms',              category: 'A' },
    { key: '[',         description: 'Snap IN to nearest phrase edge',  category: 'A' },
    { key: ']',         description: 'Snap OUT to nearest phrase edge', category: 'A' },

    // ── B: Cmd+Option ────────────────────────────────────────────────────────
    { key: 'ArrowLeft',  modifiers: ['cmd', 'alt'], description: 'Jump Left by loop size',  category: 'B' },
    { key: 'ArrowRight', modifiers: ['cmd', 'alt'], description: 'Jump Right by loop size', category: 'B' },
    { key: 'ArrowUp',    modifiers: ['cmd', 'alt'], description: 'Expand loop by 1 beat',   category: 'B' },
    { key: 'ArrowDown',  modifiers: ['cmd', 'alt'], description: 'Shrink loop by 1 beat',   category: 'B' },

    // ── C: Cmd+Option+Shift ──────────────────────────────────────────────────
    { key: 'ArrowLeft',  modifiers: ['cmd', 'alt', 'shift'], description: 'Jump to track start (0:00)',   category: 'C' },
    { key: 'ArrowRight', modifiers: ['cmd', 'alt', 'shift'], description: 'Jump to track end',            category: 'C' },
    { key: 'ArrowUp',    modifiers: ['cmd', 'alt', 'shift'], description: 'Jump to loop IN point',        category: 'C' },
    { key: 'ArrowDown',  modifiers: ['cmd', 'alt', 'shift'], description: 'Jump to loop OUT point',       category: 'C' },

    // ── D: Cmd+Key ───────────────────────────────────────────────────────────
    { key: 'l', modifiers: ['cmd'], description: 'Save loop to library', category: 'D' },
    { key: 'e', modifiers: ['cmd'], description: 'Export to Ableton',    category: 'D' },
];
