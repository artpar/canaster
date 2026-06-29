import {type ReactNode, useEffect} from 'react';
import type {CanasterThemeId} from './CanasterTheme';
import {canasterThemeCssVariables} from './CanasterThemeCssVariables';
import {canasterThemeById} from './CanasterThemeRegistry';

export type CanasterThemeProviderProps = {
    children: ReactNode;
    themeId: CanasterThemeId;
};

export function CanasterThemeProvider({children, themeId}: CanasterThemeProviderProps) {
    useEffect(() => {
        const theme = canasterThemeById(themeId);
        const root = document.documentElement;
        const variables = canasterThemeCssVariables(theme);
        root.dataset.theme = theme.id;
        root.dataset.themeMode = theme.mode;
        root.dataset.panelTexture = theme.texture.panelSurfaceTreatment;
        root.dataset.nodeTexture = theme.texture.nodeSurfaceTreatment;
        root.style.colorScheme = theme.mode;
        for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    }, [themeId]);

    return <>{children}</>;
}
