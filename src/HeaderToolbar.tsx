import type {MutableRefObject} from "react";
import {
    FilePlus2,
    LayoutGrid,
    LogIn,
    Maximize2,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    PanelsTopLeft,
    Redo2,
    RotateCcw,
    Sun,
    Undo2,
    UserCircle
} from "lucide-react";
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
        onCenterMap: () => void,
        onResetZoom: () => void,
        onToggleParentContext: () => void
    },
    addPanel: {
        buttonRef: MutableRefObject<HTMLButtonElement | null>,
        open: boolean,
        onToggle: () => void
    },
    arrange: {
        buttonRef: MutableRefObject<HTMLButtonElement | null>,
        open: boolean,
        onToggle: () => void
    },
    theme: {
        name: "dark" | "light",
        onToggle: () => void
    },
    account: {
        signedIn: boolean,
        open: boolean,
        onToggle: () => void
    }
};

export function HeaderToolbar(props: HeaderToolbarProps) {
    return <div className="topbar" aria-label="Workspace tools">
        <div className="topbar-zone topbar-identity">
            <button
                className="icon-button view-tree-toggle-button"
                type="button"
                aria-label={props.sidePanel.open ? "Close views and documents panel" :
                    "Open views and documents panel"}
                title={props.sidePanel.open ? "Close views and documents" : "Open views and documents"}
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
                <IconButton label="Center map" onClick={props.view.onCenterMap}>
                    <Maximize2 size={17}/>
                </IconButton>
                <IconButton label="Reset map zoom" onClick={props.view.onResetZoom}>
                    <RotateCcw size={17}/>
                </IconButton>
                <IconButton
                    label={props.view.parentContextVisible ? "Hide parent context panes" : "Show parent context panes"}
                    pressed={props.view.parentContextVisible}
                    onClick={props.view.onToggleParentContext}
                >
                    <PanelsTopLeft size={17}/>
                </IconButton>
                <button
                    ref={props.arrange.buttonRef}
                    className="icon-button"
                    type="button"
                    aria-label="Arrange canvas panels"
                    aria-haspopup="menu"
                    aria-expanded={props.arrange.open}
                    title="Arrange canvas panels"
                    onClick={props.arrange.onToggle}
                >
                    <LayoutGrid size={17}/>
                </button>
            </div>
            <div className="toolbar-group" aria-label="Panels">
                <IconButton
                    label={props.theme.name === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                    onClick={props.theme.onToggle}
                >
                    {props.theme.name === "dark" ? <Sun size={17}/> : <Moon size={17}/>}
                </IconButton>
            </div>
            <div className="toolbar-group account-command-group" aria-label="Account">
                <IconButton
                    label={props.account.signedIn ? "Open account" : "Sign in"}
                    pressed={props.account.open}
                    onClick={props.account.onToggle}
                >
                    {props.account.signedIn ? <UserCircle size={17}/> : <LogIn size={17}/>}
                </IconButton>
            </div>
        </div>
    </div>;
}
