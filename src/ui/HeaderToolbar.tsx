import {
    useEffect,
    useRef,
    useState,
    type MutableRefObject
} from "react";
import {
    FilePlus2,
    Globe2,
    Link2,
    LockKeyhole,
    PanelLeftClose,
    PanelLeftOpen,
    PanelsTopLeft,
    Redo2,
    Share2,
    Undo2
} from "lucide-react";
import type {DocumentVisibility} from "../infra/daptin/documentPermissions";
import {IconButton} from "./IconButton";

export type HeaderToolbarProps = {
    sidePanel: {
        open: boolean,
        onToggle: () => void
    },
    document: {
        title: string,
        syncMessage: string,
        onTitleChange: (title: string) => void,
        onSave: () => void
    },
    history: {
        canUndo: boolean,
        canRedo: boolean,
        onUndo: () => void,
        onRedo: () => void
    },
    view: {
        parentContextVisible: boolean,
        onToggleParentContext: () => void
    },
    exportMenu: {
        buttonRef: MutableRefObject<HTMLButtonElement | null>,
        disabled: boolean,
        open: boolean,
        onToggle: () => void
    },
    addPanel: {
        buttonRef: MutableRefObject<HTMLButtonElement | null>,
        open: boolean,
        onToggle: () => void
    },
    visibility: {
        active: DocumentVisibility | null,
        editable: boolean,
        signedIn: boolean,
        busy: boolean,
        onCopyLink: () => void,
        onSet: (visibility: DocumentVisibility) => void
    }
};

export function HeaderToolbar(props: HeaderToolbarProps) {
    const [visibilityOpen, setVisibilityOpen] = useState(false);
    const visibilityRef = useRef<HTMLDivElement | null>(null);
    const visibilityBusy = props.visibility.busy;
    const visibility = props.visibility.active ?? 'private';
    const hasOnlineDocument = props.visibility.signedIn && props.visibility.active !== null;
    const canChangeVisibility = hasOnlineDocument && props.visibility.editable && !visibilityBusy;
    const canCopyLink = hasOnlineDocument && visibility === 'public' && !visibilityBusy;
    const visibilityTitle = visibilityTitleForState({
        canChangeVisibility,
        editable          : props.visibility.editable,
        hasOnlineDocument,
        signedIn          : props.visibility.signedIn,
    });

    useEffect(() => {
        if (!visibilityOpen) return;
        const onPointerDown = (event: PointerEvent) => {
            if (visibilityRef.current?.contains(event.target as Node)) return;
            setVisibilityOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setVisibilityOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [visibilityOpen]);

    return <div className="topbar" aria-label="Workspace tools">
        <div className="topbar-zone topbar-identity">
            <button
                className="icon-button view-tree-toggle-button"
                type="button"
                aria-label={props.sidePanel.open ? "Close workspace sidebar" : "Open workspace sidebar"}
                title={props.sidePanel.open ? "Close workspace sidebar" : "Open workspace sidebar"}
                aria-pressed={props.sidePanel.open}
                onClick={props.sidePanel.onToggle}>
                {props.sidePanel.open ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
            </button>
            <form
                className="toolbar-group document-command-group"
                aria-label="Workspace name"
                onSubmit={(event) => {
                    event.preventDefault();
                    props.document.onSave();
                }}
            >
                <input
                    className="document-title-input"
                    aria-label="Workspace name"
                    name="document-title"
                    value={props.document.title}
                    onChange={(event) => props.document.onTitleChange(event.target.value)}
                />
                <span className="sync-status-reader" role="status"
                      aria-live="polite">{props.document.syncMessage}</span>
            </form>
        </div>
        <div className="topbar-zone topbar-controls">
            <div className="toolbar-group" aria-label="History">
                <IconButton label="Undo" disabled={!props.history.canUndo}
                            onClick={props.history.onUndo}>
                    <Undo2 size={17}/>
                </IconButton>
                <IconButton label="Redo" disabled={!props.history.canRedo}
                            onClick={props.history.onRedo}>
                    <Redo2 size={17}/>
                </IconButton>
            </div>
            <div className="toolbar-group" aria-label="View controls">
                <button
                    ref={props.addPanel.buttonRef}
                    className="icon-button"
                    type="button"
                    aria-label="Add panel"
                    aria-haspopup="dialog"
                    aria-expanded={props.addPanel.open}
                    title="Add panel"
                    onClick={props.addPanel.onToggle}
                >
                    <FilePlus2 size={17}/>
                </button>
                <IconButton
                    label={props.view.parentContextVisible ? "Hide parent context panes" : "Show parent context panes"}
                    pressed={props.view.parentContextVisible}
                    onClick={props.view.onToggleParentContext}
                >
                    <PanelsTopLeft size={17}/>
                </IconButton>
                <button
                    ref={props.exportMenu.buttonRef}
                    className="icon-button"
                    type="button"
                    aria-label="Export workspace"
                    aria-haspopup="menu"
                    aria-expanded={props.exportMenu.open}
                    title="Export workspace"
                    disabled={props.exportMenu.disabled}
                    onClick={props.exportMenu.onToggle}
                >
                    <Share2 size={17}/>
                </button>
            </div>
            <div className="toolbar-group workspace-visibility-control" ref={visibilityRef}>
                <button
                    className={`icon-button workspace-visibility-trigger ${visibility}`}
                    type="button"
                    aria-label={`Workspace visibility: ${visibilityLabel(visibility)}`}
                    aria-haspopup="dialog"
                    aria-expanded={visibilityOpen}
                    title={hasOnlineDocument ? `Workspace is ${visibilityLabel(visibility).toLowerCase()}` :
                        'Save online before changing workspace visibility'}
                    disabled={!props.visibility.signedIn}
                    onClick={() => setVisibilityOpen((open) => !open)}
                >
                    <LockKeyhole size={17}/>
                </button>
                {visibilityOpen ? (
                    <div className="workspace-visibility-popover" role="dialog" aria-label="Workspace visibility">
                        <div className="workspace-visibility-summary">
                            <span>{visibilityLabel(visibility)}</span>
                            <span>{visibility === 'public' ? 'Anyone with the link can open it' : 'Only you can open it'}</span>
                        </div>
                        <div className="document-visibility-controls" role="group" aria-label="Change workspace visibility">
                            <button
                                className={`document-visibility-option${visibility === 'private' ? ' active' : ''}`}
                                type="button"
                                aria-pressed={visibility === 'private'}
                                disabled={!canChangeVisibility}
                                title={visibilityTitle}
                                onClick={() => props.visibility.onSet('private')}
                            >
                                <LockKeyhole size={14}/>
                                <span>Private</span>
                            </button>
                            <button
                                className={`document-visibility-option${visibility === 'public' ? ' active' : ''}`}
                                type="button"
                                aria-pressed={visibility === 'public'}
                                disabled={!canChangeVisibility}
                                title={visibilityTitle}
                                onClick={() => props.visibility.onSet('public')}
                            >
                                <Globe2 size={14}/>
                                <span>Public</span>
                            </button>
                        </div>
                        <button
                            className="document-visibility-link"
                            type="button"
                            disabled={!canCopyLink}
                            title={visibility === 'public' ? 'Copy public workspace link' :
                                'Make this workspace public before copying a share link'}
                            onClick={() => {
                                setVisibilityOpen(false);
                                props.visibility.onCopyLink();
                            }}
                        >
                            <Link2 size={14}/>
                            <span>Copy link</span>
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    </div>;
}

function visibilityLabel(visibility: DocumentVisibility): string {
    return visibility === 'public' ? 'Public' : 'Private';
}

function visibilityTitleForState({
                                     canChangeVisibility,
                                     editable,
                                     hasOnlineDocument,
                                     signedIn,
                                 }: {
    canChangeVisibility: boolean;
    editable: boolean;
    hasOnlineDocument: boolean;
    signedIn: boolean;
}): string {
    if (canChangeVisibility) return 'Change workspace visibility';
    if (!signedIn) return 'Sign in before changing workspace visibility';
    if (!hasOnlineDocument) return 'Save online before changing workspace visibility';
    if (!editable) return 'Only the owner can change workspace visibility';
    return 'Workspace visibility is updating';
}
