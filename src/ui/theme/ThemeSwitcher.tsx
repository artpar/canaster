import {Check, Palette} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {CanasterTheme, CanasterThemeId} from './CanasterTheme';

export type ThemeSwitcherProps = {
    currentThemeId: CanasterThemeId;
    themes: CanasterTheme[];
    onSelect: (themeId: CanasterThemeId) => void;
};

export function ThemeSwitcher({currentThemeId, themes, onSelect}: ThemeSwitcherProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const currentTheme = themes.find((theme) => theme.id === currentThemeId) ?? themes[0];

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (rootRef.current?.contains(target)) return;
            close();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [close, open]);

    return <div className="theme-switcher" ref={rootRef}>
        <button
            className="icon-button theme-switcher-button"
            type="button"
            aria-label={`Theme: ${currentTheme.name}`}
            aria-haspopup="menu"
            aria-expanded={open}
            title={`Theme: ${currentTheme.name}`}
            onClick={() => setOpen((value) => !value)}
        >
            <Palette size={17}/>
        </button>
        {open ? <div className="theme-menu" role="menu" aria-label="Workspace theme">
            {themes.map((theme) => {
                const selected = theme.id === currentThemeId;
                return <button
                    key={theme.id}
                    className="theme-menu-item"
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                        onSelect(theme.id);
                        close();
                    }}
                >
                    <span className="theme-menu-swatch" aria-hidden="true">
                        <span style={{background: theme.colors.canvas.background}}/>
                        <span style={{background: theme.colors.panel.surfaceRaised}}/>
                        <span style={{background: theme.colors.action.primary}}/>
                    </span>
                    <span className="theme-menu-copy">
                        <strong>{theme.name}</strong>
                        <small>{theme.description}</small>
                    </span>
                    {selected ? <Check className="theme-menu-check" size={15}/> : null}
                </button>;
            })}
        </div> : null}
    </div>;
}
