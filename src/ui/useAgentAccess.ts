import {
    type MutableRefObject,
    useCallback,
    useEffect,
    useRef
} from 'react';
import {createAgentAccessBrief} from '../app/agentAccess/createAgentAccessBrief';
import {
    connectCanasterAgentBridge,
    type CanasterAgentBridgeConnection
} from '../app/agentBridge/CanasterAgentBridge';
import {agentTopicName} from '../app/agentBridge/AgentProtocol';
import type {CanasterDocumentSummary} from '../infra/daptin/canasterDocuments';
import {createDaptinAgentLiveTransport} from '../infra/daptin/createDaptinAgentLiveTransport';
import {
    getDaptinEndpoint,
    getToken,
    hasUsableStoredToken
} from '../infra/daptin/daptinClient';
import {createBrowserCanasterAgentTimer} from '../infra/browser/createBrowserCanasterAgentTimer';
import {replaceWorkspaceUrlState} from '../infra/browser/workspaceUrlLocation';
import {createCanasterAgentNodeMetadata} from './agentBridge/createCanasterAgentNodeMetadata';
import {createNestedWorkspaceAgentWorkspace} from './agentBridge/createNestedWorkspaceAgentWorkspace';
import type {
    NestedCanvasWorkspaceChromeState,
    NestedCanvasWorkspaceHandle
} from './canvas/nested/NestedCanvasWorkspace';
import {copyTextToClipboard} from './useWorkspaceExport';
import {
    agentAccessDisabledReason,
    snapshotSignature
} from './workspaceDocumentWorkflow';
import type {SyncStatus, SyncStatusSetter} from './workspaceWorkflowTypes';

const AGENT_LIVE_TRANSPORT = createDaptinAgentLiveTransport();
const AGENT_NODE_METADATA = createCanasterAgentNodeMetadata();
const AGENT_TIMER = createBrowserCanasterAgentTimer();

export function useAgentAccess(input: {
    activeDocumentId: string;
    activeDocumentIdRef: MutableRefObject<string>;
    chromeState: NestedCanvasWorkspaceChromeState;
    documentTitle: string;
    documentTitleRef: MutableRefObject<string>;
    documents: CanasterDocumentSummary[];
    documentsRef: MutableRefObject<CanasterDocumentSummary[]>;
    openDaptinDocument: (documentRef: string, knownDocuments?: CanasterDocumentSummary[]) => Promise<void>;
    refreshDocuments: () => Promise<CanasterDocumentSummary[]>;
    saveOnlineDocument: () => Promise<void>;
    setSyncMessage: (message: string) => void;
    setSyncStatus: SyncStatusSetter;
    signedIn: boolean;
    signedInRef: MutableRefObject<boolean>;
    syncMessage: string;
    syncMessageRef: MutableRefObject<string>;
    syncStatus: SyncStatus;
    syncStatusRef: MutableRefObject<SyncStatus>;
    workspaceRef: MutableRefObject<NestedCanvasWorkspaceHandle | null>;
}) {
    const {
        activeDocumentId,
        activeDocumentIdRef,
        chromeState,
        documentTitle,
        documentTitleRef,
        documents,
        documentsRef,
        openDaptinDocument,
        refreshDocuments,
        saveOnlineDocument,
        setSyncMessage,
        setSyncStatus,
        signedIn,
        signedInRef,
        syncMessage,
        syncMessageRef,
        syncStatus,
        syncStatusRef,
        workspaceRef,
    } = input;
    const agentBridgeRef = useRef<CanasterAgentBridgeConnection | null>(null);
    const agentPageIdRef = useRef(crypto.randomUUID());
    const agentStateVersionRef = useRef(1);
    const lastAgentStateSignatureRef = useRef('');
    const lastAgentVersionSignatureRef = useRef('');
    const suppressNextAgentStateEffectRef = useRef(false);
    const suppressNextAgentStateTimerRef = useRef<number | null>(null);

    const currentAgentStateSignature = useCallback(() => {
        const collection = workspaceRef.current?.collection() ?? chromeState.collection;
        const activeCanvasId = collection.activeCanvasId;
        return snapshotSignature({
            activeDocumentId: activeDocumentIdRef.current,
            activeCanvasId,
            camera          : collection.view.cameras[activeCanvasId] ?? null,
            collection,
            documentTitle   : documentTitleRef.current,
            selection       : collection.view.selections[activeCanvasId] ?? null,
            syncMessage     : syncMessageRef.current,
            syncStatus      : syncStatusRef.current,
        });
    }, [activeDocumentIdRef, chromeState.collection, documentTitleRef, syncMessageRef, syncStatusRef, workspaceRef]);

    const bumpAgentStateVersion = useCallback(() => {
        agentStateVersionRef.current += 1;
        suppressNextAgentStateEffectRef.current = true;
        if (suppressNextAgentStateTimerRef.current !== null) window.clearTimeout(suppressNextAgentStateTimerRef.current);
        suppressNextAgentStateTimerRef.current = window.setTimeout(() => {
            suppressNextAgentStateEffectRef.current = false;
            suppressNextAgentStateTimerRef.current = null;
        }, 1000);
        const signature = currentAgentStateSignature();
        lastAgentStateSignatureRef.current = signature;
        lastAgentVersionSignatureRef.current = signature;
        return agentStateVersionRef.current;
    }, [currentAgentStateSignature]);

    const refreshAgentStateVersion = useCallback(() => {
        const signature = currentAgentStateSignature();
        if (signature !== lastAgentVersionSignatureRef.current) {
            agentStateVersionRef.current += 1;
            lastAgentVersionSignatureRef.current = signature;
        }
        return agentStateVersionRef.current;
    }, [currentAgentStateSignature]);

    useEffect(() => {
        const selection = chromeState.collection.view.selections[chromeState.collection.activeCanvasId] ?? null;
        const camera = chromeState.collection.view.cameras[chromeState.collection.activeCanvasId] ?? null;
        const signature = currentAgentStateSignature();
        if (signature === lastAgentStateSignatureRef.current) return;
        if (suppressNextAgentStateEffectRef.current) {
            suppressNextAgentStateEffectRef.current = false;
            if (suppressNextAgentStateTimerRef.current !== null) {
                window.clearTimeout(suppressNextAgentStateTimerRef.current);
                suppressNextAgentStateTimerRef.current = null;
            }
            if (signature !== lastAgentVersionSignatureRef.current) {
                agentStateVersionRef.current += 1;
                lastAgentVersionSignatureRef.current = signature;
            }
        } else {
            if (signature !== lastAgentVersionSignatureRef.current) {
                agentStateVersionRef.current += 1;
                lastAgentVersionSignatureRef.current = signature;
            }
        }
        lastAgentStateSignatureRef.current = signature;
        agentBridgeRef.current?.emitEvent('workspace.changed', {
            activeCanvasId: chromeState.collection.activeCanvasId,
            title: documentTitle,
        });
        agentBridgeRef.current?.emitEvent('selection.changed', {
            activeCanvasId: chromeState.collection.activeCanvasId,
            selection,
        });
        agentBridgeRef.current?.emitEvent('view.changed', {
            activeCanvasId: chromeState.collection.activeCanvasId,
            camera,
        });
        agentBridgeRef.current?.emitEvent('sync.changed', {
            message: syncMessage,
            status: syncStatus,
        });
    }, [activeDocumentId, chromeState, currentAgentStateSignature, documentTitle, syncMessage, syncStatus]);

    useEffect(() => {
        if (!signedIn || !activeDocumentId || !hasUsableStoredToken()) {
            agentBridgeRef.current?.close();
            agentBridgeRef.current = null;
            return;
        }
        const bridge = connectCanasterAgentBridge({
            appUrl       : () => window.location.href,
            bumpStateVersion: bumpAgentStateVersion,
            documentId   : activeDocumentId,
            documentTitle: () => documentTitleRef.current,
            liveTransport: AGENT_LIVE_TRANSPORT,
            nodeMetadata : AGENT_NODE_METADATA,
            topicName    : agentTopicName(activeDocumentId, agentPageIdRef.current),
            reloadDocument: async () => {
                const documentRef = activeDocumentIdRef.current;
                if (!documentRef) throw new Error('No saved workspace is open.');
                const rows = documentsRef.current.length ? documentsRef.current : await refreshDocuments();
                await openDaptinDocument(documentRef, rows);
            },
            saveOnline: async () => {
                await saveOnlineDocument();
                agentBridgeRef.current?.emitEvent('document.saved', {
                    documentId: activeDocumentIdRef.current,
                });
            },
            stateVersion: refreshAgentStateVersion,
            syncState   : () => ({
                message : syncMessageRef.current,
                signedIn: signedInRef.current,
                status  : syncStatusRef.current,
            }),
            timer: AGENT_TIMER,
            workspace: () => workspaceRef.current ? createNestedWorkspaceAgentWorkspace(workspaceRef.current) : null,
        });
        agentBridgeRef.current = bridge;
        return () => {
            if (agentBridgeRef.current === bridge) agentBridgeRef.current = null;
            bridge.close();
        };
    }, [
        activeDocumentId,
        activeDocumentIdRef,
        bumpAgentStateVersion,
        documentTitleRef,
        documentsRef,
        openDaptinDocument,
        refreshAgentStateVersion,
        refreshDocuments,
        saveOnlineDocument,
        signedIn,
        signedInRef,
        syncMessageRef,
        syncStatusRef,
        workspaceRef,
    ]);

    const handleCopyAgentAccess = useCallback(async () => {
        try {
            if (!signedIn) throw new Error('Sign in before copying agent access');
            if (!activeDocumentId) throw new Error('Save online before copying agent access');
            if (syncStatus !== 'clean') throw new Error('Save online before copying agent access');
            if (!hasUsableStoredToken()) throw new Error('Sign in again before copying agent access');
            const token = getToken();
            if (!token) throw new Error('Sign in again before copying agent access');
            const savedDocument = documents.find((document) => document.id === activeDocumentId);
            const state = workspaceRef.current?.currentWorkspaceUrlState(activeDocumentId);
            const agentTopic = agentTopicName(activeDocumentId, agentPageIdRef.current);
            if (state) replaceWorkspaceUrlState(state);
            await copyTextToClipboard(createAgentAccessBrief({
                appUrl        : window.location.href,
                daptinEndpoint: getDaptinEndpoint(),
                documentId    : activeDocumentId,
                documentPath  : savedDocument?.path ?? '',
                documentTitle,
                agentTopic,
                token,
            }));
            setSyncMessage('Agent access copied');
        } catch (error) {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage(error instanceof Error ? error.message : 'Could not copy agent access.');
        }
    }, [activeDocumentId, documentTitle, documents, setSyncMessage, setSyncStatus, signedIn, syncStatus, workspaceRef]);

    const agentAccessToken = getToken();
    const exportActionDisabled = syncStatus === 'saving' || syncStatus === 'loading';
    const agentAccessDisabled = exportActionDisabled || !signedIn || !activeDocumentId || syncStatus !== 'clean' ||
        !agentAccessToken;
    const agentAccessHint = agentAccessDisabled ?
        agentAccessDisabledReason({
            activeDocumentId,
            signedIn,
            syncStatus,
            token: agentAccessToken,
        }) :
        'Prompt with live document access';

    return {
        agentAccessDisabled,
        agentAccessHint,
        handleCopyAgentAccess,
    };
}
