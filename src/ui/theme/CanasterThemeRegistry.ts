import type {CanasterTheme, CanasterThemeId, CanasterThemeTexture} from './CanasterTheme';

export const DEFAULT_CANASTER_THEME_ID: CanasterThemeId = 'paperWorkbench';

const systemFallback =
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const fontFamilies = {
    inter: '"Inter Variable", Inter, ' + systemFallback,
    plex: '"IBM Plex Sans Variable", "IBM Plex Sans", ' + systemFallback,
    robotoFlex: '"Roboto Flex Variable", "Roboto Flex", ' + systemFallback,
    sourceSans: '"Source Sans 3 Variable", "Source Sans 3", ' + systemFallback,
};

const spacing = {
    xxs: '4px',
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '14px',
    xl: '18px',
};

const borders = {
    width: '1px',
    focusWidth: '2px',
    selectedWidth: '3px',
};

const motion = {
    fast: '120ms',
    base: '180ms',
    slow: '240ms',
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

const semantic = {
    success: '#1f7a4d',
    warning: '#9a6700',
    error: '#b4232f',
    resize: '#b7791f',
};

type TypographyRecipe = {
    family: string;
    titleSize: string;
    bodySize: string;
    labelSize: string;
    microSize: string;
    titleWeight: number;
    strongWeight: number;
    bodyWeight: number;
    titleLineHeight: string;
    bodyLineHeight: string;
    labelLineHeight: string;
    canvasTitleSize: string;
    canvasBodySize: string;
    canvasLabelSize: string;
    canvasMicroSize: string;
    canvasTitleWeight: number;
    canvasBodyWeight: number;
    canvasTitleLineHeight: number;
    canvasBodyLineHeight: number;
    canvasLabelLineHeight: number;
};

type ComponentRecipe = {
    toolbarHeight: string;
    toolbarPadding: string;
    toolbarGap: string;
    iconSize: string;
    mobileIconSize: string;
    iconGlyphSize: number;
    panelPadding: string;
    panelGap: string;
    sidePanelRowHeight: string;
    sidePanelRowPadding: string;
    sidePanelListPadding: string;
    sidePanelRowIndent: string;
    sidePanelIconButtonSize: string;
    popoverPadding: string;
    popoverGap: string;
    nodePadding: string;
    drawerWidth: string;
    inputHeight: string;
    inputPaddingInline: string;
    menuWidth: string;
    menuPadding: string;
    menuItemMinHeight: string;
    menuItemPadding: string;
    menuItemGap: string;
    viewportControlInset: string;
    viewportControlGap: string;
    embeddedViewportControlInset: string;
    embeddedViewportControlGap: string;
    nodeLayout: {
        contentInsetX: number;
        titleY: number;
        metaY: number;
        contentY: number;
        bodyLineHeight: number;
        labelLineHeight: number;
        rowHeight: number;
        accentWidth: number;
        accentHeight: number;
        controlRadius: number;
    };
};

function typography(recipe: TypographyRecipe): CanasterTheme['typography'] {
    return {
        family: recipe.family,
        canvasFamily: recipe.family,
        titleSize: recipe.titleSize,
        bodySize: recipe.bodySize,
        labelSize: recipe.labelSize,
        microSize: recipe.microSize,
        canvasTitleSize: recipe.canvasTitleSize,
        canvasBodySize: recipe.canvasBodySize,
        canvasLabelSize: recipe.canvasLabelSize,
        canvasMicroSize: recipe.canvasMicroSize,
        titleWeight: recipe.titleWeight,
        strongWeight: recipe.strongWeight,
        bodyWeight: recipe.bodyWeight,
        canvasTitleWeight: recipe.canvasTitleWeight,
        canvasBodyWeight: recipe.canvasBodyWeight,
        titleLineHeight: recipe.titleLineHeight,
        bodyLineHeight: recipe.bodyLineHeight,
        labelLineHeight: recipe.labelLineHeight,
        canvasTitleLineHeight: recipe.canvasTitleLineHeight,
        canvasBodyLineHeight: recipe.canvasBodyLineHeight,
        canvasLabelLineHeight: recipe.canvasLabelLineHeight,
    };
}

function components(recipe: ComponentRecipe): CanasterTheme['components'] {
    return {
        toolbar: {
            height: recipe.toolbarHeight,
            padding: recipe.toolbarPadding,
            gap: recipe.toolbarGap,
        },
        iconButton: {
            size: recipe.iconSize,
            mobileSize: recipe.mobileIconSize,
            iconSize: recipe.iconGlyphSize,
        },
        panel: {
            padding: recipe.panelPadding,
            gap: recipe.panelGap,
        },
        sidePanel: {
            rowHeight: recipe.sidePanelRowHeight,
            rowPadding: recipe.sidePanelRowPadding,
            listPadding: recipe.sidePanelListPadding,
            rowIndent: recipe.sidePanelRowIndent,
            iconButtonSize: recipe.sidePanelIconButtonSize,
        },
        popover: {
            padding: recipe.popoverPadding,
            gap: recipe.popoverGap,
        },
        node: {
            padding: recipe.nodePadding,
            titleSize: recipe.nodeLayout.rowHeight >= 19 ? '15px' : '14px',
            bodySize: recipe.nodeLayout.bodyLineHeight >= 18 ? '13px' : '12px',
            badgeSize: '10px',
            contentInsetX: recipe.nodeLayout.contentInsetX,
            titleY: recipe.nodeLayout.titleY,
            metaY: recipe.nodeLayout.metaY,
            contentY: recipe.nodeLayout.contentY,
            bodyLineHeight: recipe.nodeLayout.bodyLineHeight,
            labelLineHeight: recipe.nodeLayout.labelLineHeight,
            rowHeight: recipe.nodeLayout.rowHeight,
            accentWidth: recipe.nodeLayout.accentWidth,
            accentHeight: recipe.nodeLayout.accentHeight,
            controlRadius: recipe.nodeLayout.controlRadius,
        },
        drawer: {
            width: recipe.drawerWidth,
        },
        input: {
            height: recipe.inputHeight,
            paddingInline: recipe.inputPaddingInline,
        },
        menu: {
            width: recipe.menuWidth,
            padding: recipe.menuPadding,
            itemMinHeight: recipe.menuItemMinHeight,
            itemPadding: recipe.menuItemPadding,
            itemGap: recipe.menuItemGap,
        },
        viewportControls: {
            inset: recipe.viewportControlInset,
            gap: recipe.viewportControlGap,
            embeddedInset: recipe.embeddedViewportControlInset,
            embeddedGap: recipe.embeddedViewportControlGap,
        },
    };
}

const standardType = typography({
    family: fontFamilies.inter,
    titleSize: '15px',
    bodySize: '13px',
    labelSize: '12px',
    microSize: '11px',
    titleWeight: 620,
    strongWeight: 700,
    bodyWeight: 420,
    titleLineHeight: '1.22',
    bodyLineHeight: '1.4',
    labelLineHeight: '1.22',
    canvasTitleSize: '14px',
    canvasBodySize: '13px',
    canvasLabelSize: '12px',
    canvasMicroSize: '10px',
    canvasTitleWeight: 640,
    canvasBodyWeight: 430,
    canvasTitleLineHeight: 18,
    canvasBodyLineHeight: 18,
    canvasLabelLineHeight: 15,
});

const standardComponents = components({
    toolbarHeight: '40px',
    toolbarPadding: '6px 8px',
    toolbarGap: '8px',
    iconSize: '32px',
    mobileIconSize: '28px',
    iconGlyphSize: 17,
    panelPadding: '8px',
    panelGap: '8px',
    sidePanelRowHeight: '34px',
    sidePanelRowPadding: '6px 7px 5px 10px',
    sidePanelListPadding: '4px 6px 8px',
    sidePanelRowIndent: '14px',
    sidePanelIconButtonSize: '28px',
    popoverPadding: '10px',
    popoverGap: '10px',
    nodePadding: '12px',
    drawerWidth: '320px',
    inputHeight: '30px',
    inputPaddingInline: '8px',
    menuWidth: '224px',
    menuPadding: '6px',
    menuItemMinHeight: '46px',
    menuItemPadding: '6px 8px',
    menuItemGap: '8px',
    viewportControlInset: '18px',
    viewportControlGap: '6px',
    embeddedViewportControlInset: '6px',
    embeddedViewportControlGap: '4px',
    nodeLayout: {
        contentInsetX: 5,
        titleY: 3,
        metaY: 25,
        contentY: 48,
        bodyLineHeight: 18,
        labelLineHeight: 15,
        rowHeight: 19,
        accentWidth: 28,
        accentHeight: 6,
        controlRadius: 4,
    },
});

const flatTexture: CanasterThemeTexture = {
    canvasBackgroundImage: 'none',
    canvasBackgroundBlendMode: 'normal',
    canvasWash: 'transparent',
    canvasWashOpacity: 0,
    canvasPattern: {
        kind: 'line-grid',
        opacity: 0.55,
        embeddedOpacity: 0.26,
        dotRadius: 0.9,
        hatchAngle: -24,
        hatchLength: 8,
    },
    panelBackdropFilter: 'none',
    panelSurfaceTreatment: 'solid',
    paneGutter: '16px',
    nodeSurfaceTreatment: 'solid',
    gridStep: 36,
    gridMajorEvery: 4,
    gridLineWidth: 1,
    gridDash: [],
    nodeRadius: 7,
    nodeRestBorderWidth: 1.2,
    nodeHoverBorderWidth: 1.8,
    nodeSelectedBorderWidth: 2.4,
    nodePrimaryBorderWidth: 3,
    nodeShadowBlur: 8,
    nodeSelectedShadowBlur: 12,
    nodeShadowOffsetY: 4,
};

export const CANASTER_THEMES: Record<CanasterThemeId, CanasterTheme> = {
    paperWorkbench: {
        id: 'paperWorkbench',
        name: 'Workbench Light',
        mode: 'light',
        description: 'Neutral daily workspace with a quiet dot cadence.',
        colors: {
            canvas: {
                background: '#f4f6f8',
                grid: 'rgba(32, 45, 58, 0.09)',
                gridMajor: 'rgba(32, 45, 58, 0.18)',
                paneFill: 'rgba(255, 255, 255, 0.98)',
                paneBorder: 'rgba(93, 105, 119, 0.34)',
                paneBorderInner: 'rgba(255, 255, 255, 0.96)',
                paneResizer: 'rgba(93, 105, 119, 0.26)',
                paneResizerMuted: 'rgba(93, 105, 119, 0.15)',
                paneResizerStrong: 'rgba(23, 32, 42, 0.68)',
                parentShape: 'rgba(32, 45, 58, 0.16)',
                parentShapeBorder: 'rgba(32, 45, 58, 0.32)',
                portalShape: 'rgba(31, 99, 209, 0.12)',
                portalShapeBorder: 'rgba(31, 99, 209, 0.6)',
            },
            panel: {
                surface: '#ffffff',
                surfaceMuted: 'rgba(23, 32, 42, 0.045)',
                surfaceRaised: '#ffffff',
                border: '#cfd6df',
                borderStrong: '#9aa6b4',
            },
            node: {
                surface: '#ffffff',
                border: '#c4ccd6',
                selected: '#1f63d1',
                resizeFill: semantic.resize,
                shadow: 'rgba(23, 32, 42, 0.12)',
                task: '#1f63d1',
                data: semantic.success,
                system: semantic.warning,
            },
            text: {
                high: '#17202a',
                body: '#34404d',
                muted: '#5d6977',
                inverse: '#ffffff',
                placeholder: '#596675',
            },
            action: {
                primary: '#1f63d1',
                primaryHover: '#174ea6',
                primarySoft: 'rgba(31, 99, 209, 0.12)',
                focus: '#1f63d1',
            },
            state: stateColors('light'),
            overlay: {
                scrim: 'rgba(15, 23, 42, 0.38)',
                hover: 'rgba(15, 23, 42, 0.07)',
                active: 'rgba(15, 23, 42, 0.11)',
            },
        },
        typography: standardType,
        spacing,
        radius: radius(8, 7, 6),
        borders,
        shadows: shadows('light-soft'),
        texture: {
            ...flatTexture,
            canvasPattern: {
                ...flatTexture.canvasPattern,
                kind: 'dot-grid',
                opacity: 0.68,
                embeddedOpacity: 0.32,
                dotRadius: 0.9,
            },
            gridStep: 34,
        },
        motion,
        components: standardComponents,
    },
    graphiteDesk: {
        id: 'graphiteDesk',
        name: 'Graphite Desk',
        mode: 'dark',
        description: 'Serious dark workspace with graphite layering.',
        colors: {
            canvas: {
                background: '#111418',
                grid: 'rgba(203, 213, 225, 0.075)',
                gridMajor: 'rgba(203, 213, 225, 0.14)',
                paneFill: 'rgba(25, 29, 35, 0.97)',
                paneBorder: 'rgba(148, 163, 184, 0.34)',
                paneBorderInner: 'rgba(255, 255, 255, 0.055)',
                paneResizer: 'rgba(203, 213, 225, 0.22)',
                paneResizerMuted: 'rgba(203, 213, 225, 0.13)',
                paneResizerStrong: 'rgba(241, 245, 249, 0.72)',
                parentShape: 'rgba(203, 213, 225, 0.18)',
                parentShapeBorder: 'rgba(203, 213, 225, 0.36)',
                portalShape: 'rgba(122, 167, 255, 0.16)',
                portalShapeBorder: 'rgba(122, 167, 255, 0.64)',
            },
            panel: {
                surface: '#191d23',
                surfaceMuted: 'rgba(241, 245, 249, 0.055)',
                surfaceRaised: '#20252c',
                border: '#39424f',
                borderStrong: '#64748b',
            },
            node: {
                surface: '#20252c',
                border: '#46515f',
                selected: '#7aa7ff',
                resizeFill: '#d09a2d',
                shadow: 'rgba(0, 0, 0, 0.42)',
                task: '#7aa7ff',
                data: '#57b782',
                system: '#d2a044',
            },
            text: {
                high: '#f1f5f9',
                body: '#cbd5e1',
                muted: '#a8b3c1',
                inverse: '#111418',
                placeholder: '#b6c2d1',
            },
            action: {
                primary: '#7aa7ff',
                primaryHover: '#a8c5ff',
                primarySoft: 'rgba(122, 167, 255, 0.18)',
                focus: '#bcd7ff',
            },
            state: stateColors('dark'),
            overlay: {
                scrim: 'rgba(0, 0, 0, 0.58)',
                hover: 'rgba(241, 245, 249, 0.08)',
                active: 'rgba(241, 245, 249, 0.12)',
            },
        },
        typography: typography({
            ...standardType,
            family: fontFamilies.plex,
            canvasTitleWeight: 650,
            titleWeight: 650,
        }),
        spacing,
        radius: radius(8, 7, 6),
        borders,
        shadows: shadows('dark-tonal'),
        texture: {
            ...flatTexture,
            canvasPattern: {
                ...flatTexture.canvasPattern,
                opacity: 0.5,
                embeddedOpacity: 0.24,
            },
            panelSurfaceTreatment: 'tonal-graphite',
            nodeSurfaceTreatment: 'tonal-panel',
            gridStep: 36,
        },
        motion,
        components: components({
            ...standardComponentRecipe(),
            toolbarHeight: '40px',
            toolbarPadding: '6px 8px',
            toolbarGap: '8px',
            iconSize: '32px',
            mobileIconSize: '28px',
            panelPadding: '8px',
            panelGap: '8px',
            sidePanelRowHeight: '32px',
            sidePanelRowPadding: '5px 7px 5px 9px',
            sidePanelListPadding: '4px 6px 8px',
            sidePanelIconButtonSize: '27px',
            popoverPadding: '10px',
            popoverGap: '9px',
            menuPadding: '6px',
            menuItemMinHeight: '44px',
            menuItemPadding: '6px 8px',
            menuItemGap: '8px',
            inputHeight: '30px',
            viewportControlInset: '16px',
            viewportControlGap: '6px',
            nodeLayout: {
                contentInsetX: 5,
                titleY: 3,
                metaY: 24,
                contentY: 46,
                bodyLineHeight: 18,
                labelLineHeight: 15,
                rowHeight: 18,
                accentWidth: 28,
                accentHeight: 6,
                controlRadius: 4,
            },
        }),
    },
    nightLedger: {
        id: 'nightLedger',
        name: 'Night Ledger',
        mode: 'dark',
        description: 'Compact low-glare workspace for long sessions.',
        colors: {
            canvas: {
                background: '#0b0f14',
                grid: 'rgba(186, 199, 214, 0.06)',
                gridMajor: 'rgba(186, 199, 214, 0.12)',
                paneFill: 'rgba(19, 25, 34, 0.97)',
                paneBorder: 'rgba(133, 150, 170, 0.3)',
                paneBorderInner: 'rgba(255, 255, 255, 0.045)',
                paneResizer: 'rgba(186, 199, 214, 0.2)',
                paneResizerMuted: 'rgba(186, 199, 214, 0.12)',
                paneResizerStrong: 'rgba(232, 238, 246, 0.7)',
                parentShape: 'rgba(186, 199, 214, 0.16)',
                parentShapeBorder: 'rgba(186, 199, 214, 0.32)',
                portalShape: 'rgba(139, 184, 255, 0.15)',
                portalShapeBorder: 'rgba(139, 184, 255, 0.62)',
            },
            panel: {
                surface: '#131922',
                surfaceMuted: 'rgba(232, 238, 246, 0.05)',
                surfaceRaised: '#1a222d',
                border: '#303b49',
                borderStrong: '#59697d',
            },
            node: {
                surface: '#1a222d',
                border: '#3c4a5a',
                selected: '#8bb8ff',
                resizeFill: '#c59028',
                shadow: 'rgba(0, 0, 0, 0.46)',
                task: '#8bb8ff',
                data: '#64bd8c',
                system: '#c99d3d',
            },
            text: {
                high: '#e8eef6',
                body: '#bfccd9',
                muted: '#9aa8b8',
                inverse: '#0b0f14',
                placeholder: '#aab8c8',
            },
            action: {
                primary: '#8bb8ff',
                primaryHover: '#bad4ff',
                primarySoft: 'rgba(139, 184, 255, 0.18)',
                focus: '#c8dcff',
            },
            state: stateColors('dark'),
            overlay: {
                scrim: 'rgba(0, 0, 0, 0.62)',
                hover: 'rgba(232, 238, 246, 0.075)',
                active: 'rgba(232, 238, 246, 0.11)',
            },
        },
        typography: typography({
            family: fontFamilies.robotoFlex,
            titleSize: '14px',
            bodySize: '12px',
            labelSize: '11px',
            microSize: '10px',
            titleWeight: 620,
            strongWeight: 700,
            bodyWeight: 430,
            titleLineHeight: '1.22',
            bodyLineHeight: '1.38',
            labelLineHeight: '1.2',
            canvasTitleSize: '14px',
            canvasBodySize: '12px',
            canvasLabelSize: '11px',
            canvasMicroSize: '10px',
            canvasTitleWeight: 630,
            canvasBodyWeight: 430,
            canvasTitleLineHeight: 17,
            canvasBodyLineHeight: 17,
            canvasLabelLineHeight: 14,
        }),
        spacing,
        radius: radius(7, 6, 5),
        borders,
        shadows: shadows('dark-quiet'),
        texture: {
            ...flatTexture,
            paneGutter: '14px',
            canvasPattern: {
                ...flatTexture.canvasPattern,
                opacity: 0.42,
                embeddedOpacity: 0.2,
            },
            gridStep: 40,
            nodeRadius: 6,
            nodeShadowBlur: 6,
            nodeSelectedShadowBlur: 10,
        },
        motion,
        components: components({
            ...standardComponentRecipe(),
            toolbarHeight: '38px',
            toolbarPadding: '5px 7px',
            toolbarGap: '7px',
            iconSize: '30px',
            mobileIconSize: '28px',
            menuPadding: '5px',
            menuItemMinHeight: '42px',
            menuItemPadding: '5px 7px',
            sidePanelRowHeight: '30px',
            sidePanelRowPadding: '4px 6px 4px 8px',
            sidePanelListPadding: '3px 5px 7px',
            sidePanelIconButtonSize: '26px',
            popoverPadding: '9px',
            popoverGap: '8px',
            panelPadding: '7px',
            panelGap: '7px',
            nodePadding: '10px',
            drawerWidth: '304px',
            inputHeight: '28px',
            viewportControlInset: '14px',
            viewportControlGap: '5px',
            nodeLayout: {
                contentInsetX: 4,
                titleY: 2,
                metaY: 22,
                contentY: 42,
                bodyLineHeight: 17,
                labelLineHeight: 14,
                rowHeight: 17,
                accentWidth: 26,
                accentHeight: 5,
                controlRadius: 4,
            },
        }),
    },
    surveyMap: {
        id: 'surveyMap',
        name: 'Field Slate',
        mode: 'light',
        description: 'Roomier slate workspace for field and workshop planning.',
        colors: {
            canvas: {
                background: '#eef3f1',
                grid: 'rgba(39, 64, 55, 0.08)',
                gridMajor: 'rgba(39, 64, 55, 0.16)',
                paneFill: 'rgba(251, 252, 251, 0.98)',
                paneBorder: 'rgba(93, 111, 104, 0.34)',
                paneBorderInner: 'rgba(255, 255, 255, 0.94)',
                paneResizer: 'rgba(93, 111, 104, 0.24)',
                paneResizerMuted: 'rgba(93, 111, 104, 0.14)',
                paneResizerStrong: 'rgba(23, 35, 31, 0.66)',
                parentShape: 'rgba(39, 64, 55, 0.15)',
                parentShapeBorder: 'rgba(39, 64, 55, 0.32)',
                portalShape: 'rgba(31, 99, 209, 0.11)',
                portalShapeBorder: 'rgba(31, 99, 209, 0.58)',
            },
            panel: {
                surface: '#fbfcfb',
                surfaceMuted: 'rgba(23, 35, 31, 0.045)',
                surfaceRaised: '#ffffff',
                border: '#c7d3ce',
                borderStrong: '#94a39d',
            },
            node: {
                surface: '#ffffff',
                border: '#bdcbc5',
                selected: '#1f63d1',
                resizeFill: semantic.resize,
                shadow: 'rgba(23, 35, 31, 0.11)',
                task: '#1f63d1',
                data: semantic.success,
                system: semantic.warning,
            },
            text: {
                high: '#17231f',
                body: '#344942',
                muted: '#5d6f68',
                inverse: '#ffffff',
                placeholder: '#5c6f68',
            },
            action: {
                primary: '#1f63d1',
                primaryHover: '#174ea6',
                primarySoft: 'rgba(31, 99, 209, 0.11)',
                focus: '#1f63d1',
            },
            state: stateColors('light'),
            overlay: {
                scrim: 'rgba(15, 23, 42, 0.34)',
                hover: 'rgba(23, 35, 31, 0.065)',
                active: 'rgba(23, 35, 31, 0.1)',
            },
        },
        typography: typography({
            ...standardType,
            family: fontFamilies.sourceSans,
            canvasTitleSize: '15px',
            canvasTitleLineHeight: 19,
            canvasBodyLineHeight: 19,
        }),
        spacing,
        radius: radius(8, 8, 6),
        borders,
        shadows: shadows('light-soft'),
        texture: {
            ...flatTexture,
            paneGutter: '18px',
            canvasPattern: {
                ...flatTexture.canvasPattern,
                kind: 'dot-grid',
                opacity: 0.58,
                embeddedOpacity: 0.28,
                dotRadius: 0.95,
            },
            gridStep: 40,
            nodeRadius: 8,
        },
        motion,
        components: components({
            ...standardComponentRecipe(),
            toolbarHeight: '44px',
            toolbarPadding: '7px 10px',
            toolbarGap: '10px',
            iconSize: '34px',
            mobileIconSize: '30px',
            panelPadding: '10px',
            panelGap: '10px',
            sidePanelRowHeight: '38px',
            sidePanelRowPadding: '7px 9px 7px 12px',
            sidePanelListPadding: '6px 8px 10px',
            sidePanelRowIndent: '16px',
            sidePanelIconButtonSize: '30px',
            popoverPadding: '12px',
            popoverGap: '12px',
            menuWidth: '244px',
            menuPadding: '8px',
            menuItemMinHeight: '54px',
            menuItemPadding: '8px 10px',
            menuItemGap: '10px',
            drawerWidth: '340px',
            inputHeight: '32px',
            viewportControlInset: '22px',
            viewportControlGap: '8px',
            embeddedViewportControlInset: '8px',
            embeddedViewportControlGap: '5px',
            nodePadding: '13px',
            nodeLayout: {
                contentInsetX: 6,
                titleY: 4,
                metaY: 27,
                contentY: 51,
                bodyLineHeight: 19,
                labelLineHeight: 15,
                rowHeight: 20,
                accentWidth: 30,
                accentHeight: 6,
                controlRadius: 5,
            },
        }),
    },
    operationsRoom: {
        id: 'operationsRoom',
        name: 'Review Room',
        mode: 'light',
        description: 'High-clarity shared-screen workspace.',
        colors: {
            canvas: {
                background: '#f8fafc',
                grid: 'rgba(15, 23, 42, 0.14)',
                gridMajor: 'rgba(15, 23, 42, 0.26)',
                paneFill: 'rgba(255, 255, 255, 0.99)',
                paneBorder: 'rgba(71, 85, 105, 0.52)',
                paneBorderInner: 'rgba(255, 255, 255, 0.95)',
                paneResizer: 'rgba(71, 85, 105, 0.32)',
                paneResizerMuted: 'rgba(71, 85, 105, 0.18)',
                paneResizerStrong: 'rgba(15, 23, 42, 0.8)',
                parentShape: 'rgba(15, 23, 42, 0.18)',
                parentShapeBorder: 'rgba(15, 23, 42, 0.48)',
                portalShape: 'rgba(23, 78, 166, 0.12)',
                portalShapeBorder: 'rgba(23, 78, 166, 0.68)',
            },
            panel: {
                surface: '#ffffff',
                surfaceMuted: 'rgba(15, 23, 42, 0.06)',
                surfaceRaised: '#ffffff',
                border: '#94a3b8',
                borderStrong: '#475569',
            },
            node: {
                surface: '#ffffff',
                border: '#8fa0b6',
                selected: '#174ea6',
                resizeFill: semantic.resize,
                shadow: 'rgba(15, 23, 42, 0.14)',
                task: '#174ea6',
                data: semantic.success,
                system: semantic.warning,
            },
            text: {
                high: '#0f172a',
                body: '#273449',
                muted: '#475569',
                inverse: '#ffffff',
                placeholder: '#475569',
            },
            action: {
                primary: '#174ea6',
                primaryHover: '#123f87',
                primarySoft: 'rgba(23, 78, 166, 0.13)',
                focus: '#174ea6',
            },
            state: stateColors('light'),
            overlay: {
                scrim: 'rgba(15, 23, 42, 0.44)',
                hover: 'rgba(15, 23, 42, 0.08)',
                active: 'rgba(15, 23, 42, 0.13)',
            },
        },
        typography: typography({
            ...standardType,
            family: fontFamilies.plex,
            canvasTitleSize: '15px',
            canvasTitleWeight: 660,
            canvasTitleLineHeight: 19,
            canvasBodyLineHeight: 19,
            titleWeight: 660,
        }),
        spacing,
        radius: radius(6, 6, 5),
        borders,
        shadows: shadows('review-flat'),
        texture: {
            ...flatTexture,
            paneGutter: '18px',
            canvasPattern: {
                ...flatTexture.canvasPattern,
                kind: 'line-grid',
                opacity: 0.72,
                embeddedOpacity: 0.36,
            },
            gridStep: 40,
            gridMajorEvery: 3,
            nodeRadius: 6,
            nodeRestBorderWidth: 1.5,
            nodeHoverBorderWidth: 2,
            nodeSelectedBorderWidth: 2.8,
            nodeShadowBlur: 5,
            nodeSelectedShadowBlur: 8,
            nodeShadowOffsetY: 2,
        },
        motion,
        components: components({
            ...standardComponentRecipe(),
            toolbarHeight: '42px',
            toolbarPadding: '7px 9px',
            toolbarGap: '9px',
            iconSize: '34px',
            mobileIconSize: '30px',
            panelPadding: '10px',
            panelGap: '10px',
            sidePanelRowHeight: '36px',
            sidePanelRowPadding: '6px 8px 6px 11px',
            sidePanelListPadding: '5px 8px 10px',
            sidePanelRowIndent: '15px',
            sidePanelIconButtonSize: '30px',
            popoverPadding: '12px',
            popoverGap: '11px',
            nodePadding: '14px',
            menuWidth: '248px',
            menuPadding: '8px',
            menuItemMinHeight: '52px',
            menuItemPadding: '8px 10px',
            menuItemGap: '10px',
            drawerWidth: '336px',
            inputHeight: '32px',
            viewportControlInset: '20px',
            viewportControlGap: '8px',
            nodeLayout: {
                contentInsetX: 6,
                titleY: 4,
                metaY: 28,
                contentY: 52,
                bodyLineHeight: 19,
                labelLineHeight: 16,
                rowHeight: 20,
                accentWidth: 30,
                accentHeight: 6,
                controlRadius: 4,
            },
        }),
    },
};

export const canasterThemeOptions = Object.values(CANASTER_THEMES);

export function isCanasterThemeId(value: string): value is CanasterThemeId {
    return Object.prototype.hasOwnProperty.call(CANASTER_THEMES, value);
}

export function normalizeCanasterThemeId(value: string | null | undefined): CanasterThemeId {
    return value && isCanasterThemeId(value) ? value : DEFAULT_CANASTER_THEME_ID;
}

export function canasterThemeById(value: string | null | undefined): CanasterTheme {
    return CANASTER_THEMES[normalizeCanasterThemeId(value)];
}

function radius(panel: number, node: number, control: number): CanasterTheme['radius'] {
    return {
        xs: '3px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        panel: `${panel}px`,
        node: `${node}px`,
        control: `${control}px`,
    };
}

function stateColors(mode: 'dark' | 'light'): CanasterTheme['colors']['state'] {
    const softAlpha = mode === 'dark' ? 0.18 : 0.12;
    return {
        success: mode === 'dark' ? '#64bd8c' : semantic.success,
        successSoft: rgba(mode === 'dark' ? '100, 189, 140' : '31, 122, 77', softAlpha),
        warning: mode === 'dark' ? '#c99d3d' : semantic.warning,
        warningSoft: rgba(mode === 'dark' ? '201, 157, 61' : '154, 103, 0', softAlpha),
        error: mode === 'dark' ? '#f28b92' : semantic.error,
        errorSoft: rgba(mode === 'dark' ? '242, 139, 146' : '180, 35, 47', softAlpha),
    };
}

function rgba(channels: string, alpha: number) {
    return `rgba(${channels}, ${alpha})`;
}

function shadows(kind: 'dark-quiet' | 'dark-tonal' | 'light-soft' | 'review-flat'): CanasterTheme['shadows'] {
    if (kind === 'dark-quiet') {
        return {
            chrome: '0 8px 18px rgba(0, 0, 0, 0.38)',
            node: '0 4px 8px rgba(0, 0, 0, 0.32)',
            nodeSelected: '0 6px 12px rgba(0, 0, 0, 0.38)',
            modal: '0 18px 42px rgba(0, 0, 0, 0.58)',
            menu: '0 12px 26px rgba(0, 0, 0, 0.46)',
        };
    }
    if (kind === 'dark-tonal') {
        return {
            chrome: '0 10px 24px rgba(0, 0, 0, 0.42)',
            node: '0 5px 10px rgba(0, 0, 0, 0.34)',
            nodeSelected: '0 7px 14px rgba(0, 0, 0, 0.4)',
            modal: '0 18px 46px rgba(0, 0, 0, 0.56)',
            menu: '0 12px 30px rgba(0, 0, 0, 0.48)',
        };
    }
    if (kind === 'review-flat') {
        return {
            chrome: '0 5px 12px rgba(15, 23, 42, 0.12)',
            node: '0 3px 6px rgba(15, 23, 42, 0.12)',
            nodeSelected: '0 4px 8px rgba(15, 23, 42, 0.15)',
            modal: '0 16px 38px rgba(15, 23, 42, 0.24)',
            menu: '0 10px 22px rgba(15, 23, 42, 0.16)',
        };
    }
    return {
        chrome: '0 8px 20px rgba(23, 32, 42, 0.1)',
        node: '0 4px 8px rgba(23, 32, 42, 0.09)',
        nodeSelected: '0 6px 12px rgba(23, 32, 42, 0.14)',
        modal: '0 18px 42px rgba(23, 32, 42, 0.2)',
        menu: '0 12px 24px rgba(23, 32, 42, 0.14)',
    };
}

function standardComponentRecipe(): ComponentRecipe {
    return {
        toolbarHeight: '40px',
        toolbarPadding: '6px 8px',
        toolbarGap: '8px',
        iconSize: '32px',
        mobileIconSize: '28px',
        iconGlyphSize: 17,
        panelPadding: '8px',
        panelGap: '8px',
        sidePanelRowHeight: '34px',
        sidePanelRowPadding: '6px 7px 5px 10px',
        sidePanelListPadding: '4px 6px 8px',
        sidePanelRowIndent: '14px',
        sidePanelIconButtonSize: '28px',
        popoverPadding: '10px',
        popoverGap: '10px',
        nodePadding: '12px',
        drawerWidth: '320px',
        inputHeight: '30px',
        inputPaddingInline: '8px',
        menuWidth: '224px',
        menuPadding: '6px',
        menuItemMinHeight: '46px',
        menuItemPadding: '6px 8px',
        menuItemGap: '8px',
        viewportControlInset: '18px',
        viewportControlGap: '6px',
        embeddedViewportControlInset: '6px',
        embeddedViewportControlGap: '4px',
        nodeLayout: {
            contentInsetX: 5,
            titleY: 3,
            metaY: 25,
            contentY: 48,
            bodyLineHeight: 18,
            labelLineHeight: 15,
            rowHeight: 19,
            accentWidth: 28,
            accentHeight: 6,
            controlRadius: 4,
        },
    };
}
