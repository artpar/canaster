import {
    CheckCircle2,
    FilePlus2,
    Globe2,
    LockKeyhole,
    RefreshCw,
    Save
} from "lucide-react";
import type {CanasterDocumentSummary} from "../infra/daptin/canasterDocuments";
import {
    type DocumentVisibility,
    documentVisibilityFromPermission
} from "../infra/daptin/documentPermissions";
import {SyncStatusIcon} from "./SyncStatusIcon";

type DocumentsPanelProps = {
    activeDocumentId: string;
    documents: CanasterDocumentSummary[];
    saveButtonLabel: string;
    signedIn: boolean;
    syncMessage: string;
    syncStatus: SyncStatus;
    onNew: () => void;
    onOpenAccount: () => void;
    onOpenDocument: (documentRef: string) => void;
    onRefresh: () => void;
    onSaveOnline: () => void;
};

function formatDocumentDate(updatedAt: string | null): string {
    if (!updatedAt) return 'Saved workspace';
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) return 'Saved workspace';
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day  : 'numeric'
    }).format(date);
}


export function DocumentsPanel({
                                   activeDocumentId,
                                   documents,
                                   saveButtonLabel,
                                   signedIn,
                                   syncMessage,
                                   syncStatus,
                                   onNew,
                                   onOpenAccount,
                                   onOpenDocument,
                                   onRefresh,
                                   onSaveOnline,
                               }: DocumentsPanelProps) {
    return (
        <section className="sidepanel-section documents-section" aria-label="Saved workspaces">
            <div className="sidepanel-section-row document-panel-header">
                <div className="sidepanel-section-title">
                    <span>Documents</span>
                    <span>{signedIn ? `${documents.length} saved` : 'Local only'}</span>
                </div>
                <div className="document-panel-actions" aria-label="Document commands">
                    <button className="sidepanel-icon-button" type="button" aria-label="New workspace"
                            title="New workspace" onClick={onNew}>
                        <FilePlus2 size={15}/>
                    </button>
                    <button
                        className={`sidepanel-icon-button save-online-button ${syncStatus}`}
                        type="button"
                        aria-label={saveButtonLabel}
                        title={syncMessage}
                        disabled={syncStatus === 'loading' || syncStatus === 'saving'}
                        onClick={onSaveOnline}
                    >
                        <Save size={15}/>
                        <span className="save-status-badge" aria-hidden="true">
              <SyncStatusIcon status={syncStatus}/>
            </span>
                    </button>
                    <button className="sidepanel-icon-button" type="button" aria-label="Refresh saved workspaces"
                            title="Refresh saved workspaces" disabled={!signedIn || syncStatus === 'loading'}
                            onClick={onRefresh}>
                        <RefreshCw size={15}/>
                    </button>
                </div>
            </div>
            <div className="document-panel-status" role="status" aria-live="polite">{syncMessage}</div>
            {signedIn ? (
                documents.length ? (
                    <ul className="document-list" aria-label="Saved workspaces">
                        {documents.map((document) => {
                            const active = document.id === activeDocumentId;
                            const rowVisibility = documentVisibilityFromPermission(document.permission);
                            return (
                                <li key={document.id} className="document-row">
                                    <button
                                        className="document-row-button"
                                        type="button"
                                        aria-current={active ? 'page' : undefined}
                                        onClick={() => onOpenDocument(document.id)}
                                    >
                                        <span className="document-row-title">
                                            {active ? <CheckCircle2 size={14}/> : <span className="document-row-dot"/>}
                                            <span>{document.title}</span>
                                        </span>
                                        <span className={`document-row-visibility ${rowVisibility}`}>
                                            {rowVisibility === 'public' ? <Globe2 size={12}/> : <LockKeyhole size={12}/>}
                                            <span>{visibilityLabel(rowVisibility)}</span>
                                        </span>
                                        <span className="document-row-date">{formatDocumentDate(document.updatedAt)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="drawer-empty">
                        <p>No online workspaces yet.</p>
                        <button className="drawer-action primary" type="button" onClick={onSaveOnline}>
                            <Save size={15}/>
                            Save this workspace
                        </button>
                    </div>
                )
            ) : (
                <button className="document-signin-note" type="button" onClick={onOpenAccount}>
                    Online documents appear after sign-in
                </button>
            )}
        </section>
    );
}

function visibilityLabel(visibility: DocumentVisibility | null): string {
    return visibility === 'public' ? 'Public' : 'Private';
}
