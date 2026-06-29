import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef
} from 'react';

export type KeyboardShortcut = {
    key: string;
    metaOrCtrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    handler: (event: KeyboardEvent) => boolean | void;
};

type KeyboardShortcutsContextValue = {
    registerShortcut: (shortcut: () => KeyboardShortcut) => () => void;
};

type ShortcutModifierEvent = {
    ctrlKey: boolean;
    metaKey: boolean;
};

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function KeyboardShortcutsProvider({children}: { children: ReactNode }) {
    const shortcutsRef = useRef(new Map<number, () => KeyboardShortcut>());
    const nextShortcutIdRef = useRef(1);

    const registerShortcut = useCallback((shortcut: () => KeyboardShortcut) => {
        const id = nextShortcutIdRef.current++;
        shortcutsRef.current.set(id, shortcut);
        return () => {
            shortcutsRef.current.delete(id);
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
            const shortcuts = [...shortcutsRef.current.values()].reverse();
            for (const getShortcut of shortcuts) {
                const shortcut = getShortcut();
                if (!matchesShortcut(event, shortcut)) continue;
                if (shortcut.handler(event)) {
                    event.preventDefault();
                    return;
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    const value = useMemo(() => ({registerShortcut}), [registerShortcut]);

    return <KeyboardShortcutsContext.Provider value={value}>{children}</KeyboardShortcutsContext.Provider>;
}

export function useKeyboardShortcut(shortcut: KeyboardShortcut) {
    const context = useContext(KeyboardShortcutsContext);
    if (!context) throw new Error('useKeyboardShortcut must be used inside KeyboardShortcutsProvider');

    const shortcutRef = useRef(shortcut);
    shortcutRef.current = shortcut;

    useEffect(() => {
        return context.registerShortcut(() => shortcutRef.current);
    }, [context]);
}

export function hasMetaOrCtrlShortcutModifier(event: ShortcutModifierEvent): boolean {
    return event.metaKey || event.ctrlKey;
}

function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut) {
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
    if (hasMetaOrCtrlShortcutModifier(event) !== Boolean(shortcut.metaOrCtrl)) return false;
    if (Boolean(event.shiftKey) !== Boolean(shortcut.shift)) return false;
    if (Boolean(event.altKey) !== Boolean(shortcut.alt)) return false;
    return true;
}

function isEditableShortcutTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    if (target instanceof HTMLElement && target.isContentEditable) return true;
    return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}
