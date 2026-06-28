import type {
    CanvasDocumentId,
    DocumentCommand
} from "../domain/documentTypes";
import type {CanasterDocumentSummary} from "../infra/daptin/canasterDocuments";
import {
    ChevronDown,
    LogIn,
    UserCircle,
    X
} from "lucide-react";
import {
    AccountPopover,
    type AccountPopoverProps
} from "./AccountPopover";
import {DocumentsPanel} from "./DocumentsPanel";
import type {CSSProperties} from "react";

export type ViewTreeNode = {
    canvasId: CanvasDocumentId; title: string; depth: number; children: ViewTreeNode[];
};


export function SidePanel({
                                  tree,
                                  activeCanvasId,
                                  activeDocumentId,
                                  account,
                                  documents,
                                  saveButtonLabel,
                                  signedIn,
                                  syncMessage,
                                  syncStatus,
                                  executeDocumentCommand,
                                  onClose,
                                  onNewDocument,
                                  onOpenAccount,
                                  onOpenDocument,
                                  onRefreshDocuments,
                                  onSaveOnline,
                              }: {
    tree: ViewTreeNode | null;
    activeCanvasId: CanvasDocumentId;
    activeDocumentId: string;
    account: AccountPopoverProps & {
        open: boolean;
        onToggle: () => void;
    };
    documents: CanasterDocumentSummary[];
    saveButtonLabel: string;
    signedIn: boolean;
    syncMessage: string;
    syncStatus: SyncStatus;
    executeDocumentCommand: (command: DocumentCommand) => void;
    onClose: () => void;
    onNewDocument: () => void;
    onOpenAccount: () => void;
    onOpenDocument: (documentRef: string) => void;
    onRefreshDocuments: () => void;
    onSaveOnline: () => void;
}) {
    const viewCount = tree ? countViewTreeNodes(tree) : 0;
    return (
        <aside className="view-tree-panel" aria-label="Views and documents">
            <section className="sidepanel-section views-section" aria-label="Views">
                <div className="sidepanel-section-row">
                    <div className="sidepanel-section-title">
                        <span>Views</span>
                        <span>{viewCount === 1 ? '1 view' : `${viewCount} views`}</span>
                    </div>
                    <button className="utility-close" type="button" aria-label="Close view tree" onClick={onClose}>
                        <X size={15}/>
                    </button>
                </div>
                <nav className="view-tree-list" aria-label="Canvas views">
                    {tree ? (<ViewTreeItem
                        node={tree}
                        activeCanvasId={activeCanvasId}
                        executeDocumentCommand={executeDocumentCommand}
                    />) : (<div className="view-tree-empty">No views</div>)}
                </nav>
            </section>
            <DocumentsPanel
                activeDocumentId={activeDocumentId}
                documents={documents}
                saveButtonLabel={saveButtonLabel}
                signedIn={signedIn}
                syncMessage={syncMessage}
                syncStatus={syncStatus}
                onNew={onNewDocument}
                onOpenAccount={onOpenAccount}
                onOpenDocument={onOpenDocument}
                onRefresh={onRefreshDocuments}
                onSaveOnline={onSaveOnline}
            />
            <section className="sidepanel-account-footer" aria-label="Account">
                {account.open ? (
                    <AccountPopover {...account} docked onClose={account.onClose}/>
                ) : (
                    <button className="account-footer-button" type="button" onClick={account.onToggle}>
                        <span className="account-footer-icon" aria-hidden="true">
                            {signedIn ? <UserCircle size={17}/> : <LogIn size={17}/>}
                        </span>
                        <span className="account-footer-copy">
                            <span>{signedIn ? 'Account' : 'Sign in'}</span>
                            <span>{signedIn ? authIdentity(account.authEmail) : 'Save workspaces online'}</span>
                        </span>
                    </button>
                )}
            </section>
        </aside>
    );
}

function ViewTreeItem({
                          node,
                          activeCanvasId,
                          executeDocumentCommand,
                      }: {
    node: ViewTreeNode; activeCanvasId: CanvasDocumentId; executeDocumentCommand: (command: DocumentCommand) => void;
}) {
    const active = node.canvasId === activeCanvasId;
    return (<div className="view-tree-branch">
        <button
            className={`view-tree-row${active ? ' active' : ''}`}
            type="button"
            style={{'--depth': node.depth} as CSSProperties}
            aria-current={active ? 'page' : undefined}
            onClick={() => executeDocumentCommand({
                type    : 'select-canvas',
                canvasId: node.canvasId,
                source  : 'nonvisual'
            })}
        >
        <span className={`view-tree-disclosure${node.children.length ? '' : ' empty'}`} aria-hidden="true">
          {node.children.length ? <ChevronDown size={13}/> : null}
        </span>
            <span className="view-tree-title">{node.title}</span>
        </button>
        {node.children.length ? (<div className="view-tree-children">
            {node.children.map((child) => (<ViewTreeItem
                key={child.canvasId}
                node={child}
                activeCanvasId={activeCanvasId}
                executeDocumentCommand={executeDocumentCommand}
            />))}
        </div>) : null}
    </div>);
}

function countViewTreeNodes(node: ViewTreeNode): number {
    return 1 + node.children.reduce((count, child) => count + countViewTreeNodes(child), 0);
}

function authIdentity(authEmail: string): string {
    return authEmail.trim() || 'Signed in on this browser';
}
