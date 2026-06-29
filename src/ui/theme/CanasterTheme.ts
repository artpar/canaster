export type CanasterThemeId =
    | 'graphiteDesk'
    | 'paperWorkbench'
    | 'nightLedger'
    | 'operationsRoom'
    | 'surveyMap';

export type CanasterThemeMode = 'dark' | 'light';

export type CanasterTheme = {
    id: CanasterThemeId;
    name: string;
    mode: CanasterThemeMode;
    description: string;
    colors: CanasterThemeColors;
    typography: CanasterThemeTypography;
    spacing: CanasterThemeSpacing;
    radius: CanasterThemeRadius;
    borders: CanasterThemeBorders;
    shadows: CanasterThemeShadows;
    texture: CanasterThemeTexture;
    motion: CanasterThemeMotion;
    components: CanasterThemeComponents;
};

export type CanasterThemeColors = {
    canvas: {
        background: string;
        grid: string;
        gridMajor: string;
        paneFill: string;
        paneBorder: string;
        paneBorderInner: string;
        paneResizer: string;
        paneResizerMuted: string;
        paneResizerStrong: string;
        parentShape: string;
        parentShapeBorder: string;
        portalShape: string;
        portalShapeBorder: string;
    };
    panel: {
        surface: string;
        surfaceMuted: string;
        surfaceRaised: string;
        border: string;
        borderStrong: string;
    };
    node: {
        surface: string;
        border: string;
        selected: string;
        resizeFill: string;
        shadow: string;
        task: string;
        data: string;
        system: string;
    };
    text: {
        high: string;
        body: string;
        muted: string;
        inverse: string;
        placeholder: string;
    };
    action: {
        primary: string;
        primaryHover: string;
        primarySoft: string;
        focus: string;
    };
    state: {
        success: string;
        successSoft: string;
        warning: string;
        warningSoft: string;
        error: string;
        errorSoft: string;
    };
    overlay: {
        scrim: string;
        hover: string;
        active: string;
    };
};

export type CanasterThemeTypography = {
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
};

export type CanasterThemeSpacing = {
    xxs: string;
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
};

export type CanasterThemeRadius = {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    panel: string;
    node: string;
    control: string;
};

export type CanasterThemeBorders = {
    width: string;
    focusWidth: string;
    selectedWidth: string;
};

export type CanasterThemeShadows = {
    chrome: string;
    node: string;
    nodeSelected: string;
    modal: string;
    menu: string;
};

export type CanasterThemeCanvasPatternKind = 'line-grid' | 'dot-grid' | 'dashed-grid' | 'hatch-grid';

export type CanasterThemeCanvasPattern = {
    kind: CanasterThemeCanvasPatternKind;
    opacity: number;
    embeddedOpacity: number;
    dotRadius: number;
    hatchAngle: number;
    hatchLength: number;
};

export type CanasterThemeTexture = {
    canvasBackgroundImage: string;
    canvasBackgroundBlendMode: string;
    canvasWash: string;
    canvasWashOpacity: number;
    canvasPattern: CanasterThemeCanvasPattern;
    panelBackdropFilter: string;
    panelSurfaceTreatment: string;
    paneGutter: string;
    nodeSurfaceTreatment: string;
    gridStep: number;
    gridMajorEvery: number;
    gridLineWidth: number;
    gridDash: number[];
    nodeRadius: number;
    nodeRestBorderWidth: number;
    nodeHoverBorderWidth: number;
    nodeSelectedBorderWidth: number;
    nodePrimaryBorderWidth: number;
    nodeShadowBlur: number;
    nodeSelectedShadowBlur: number;
    nodeShadowOffsetY: number;
};

export type CanasterThemeMotion = {
    fast: string;
    base: string;
    slow: string;
    easeOut: string;
};

export type CanasterThemeComponents = {
    toolbar: {
        height: string;
        padding: string;
        gap: string;
    };
    iconButton: {
        size: string;
        mobileSize: string;
        iconSize: number;
    };
    panel: {
        padding: string;
        gap: string;
    };
    node: {
        padding: string;
        titleSize: string;
        bodySize: string;
        badgeSize: string;
    };
    drawer: {
        width: string;
    };
    input: {
        height: string;
        paddingInline: string;
    };
    menu: {
        width: string;
    };
};
