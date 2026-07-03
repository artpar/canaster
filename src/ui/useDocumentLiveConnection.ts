import {
    type MutableRefObject,
    useCallback,
    useEffect
} from 'react';
import type {CanasterDocumentSummary} from '../infra/daptin/canasterDocuments';
import {
    connectDaptinLive,
    type DaptinLiveEvent
} from '../infra/daptin/daptinLive';
import {hasUsableStoredToken} from '../infra/daptin/daptinClient';
import type {NestedCanvasWorkspaceHandle} from './canvas/nested/NestedCanvasWorkspace';
import {
    liveDocumentId,
    snapshotSignature,
    workspaceErrorMessage
} from './workspaceDocumentWorkflow';
import type {SyncStatus, SyncStatusSetter} from './workspaceWorkflowTypes';

export function useDocumentLiveConnection(input: {
    activeDocumentIdRef: MutableRefObject<string>;
    handleSessionExpired: () => Promise<void>;
    ignoreActiveDocumentLiveUntilRef: MutableRefObject<{ documentRef: string; until: number } | null>;
    lastSavedSnapshotSignatureRef: MutableRefObject<string | null>;
    loadDaptinDocument: (documentRef: string, knownDocuments?: CanasterDocumentSummary[]) => Promise<void>;
    recoverSessionError: (error: unknown) => Promise<boolean>;
    refreshDocuments: () => Promise<CanasterDocumentSummary[]>;
    setSyncMessage: (message: string) => void;
    setSyncStatus: SyncStatusSetter;
    signedIn: boolean;
    syncStatusRef: MutableRefObject<SyncStatus>;
    workspaceRef: MutableRefObject<NestedCanvasWorkspaceHandle | null>;
}) {
    const {
        activeDocumentIdRef,
        handleSessionExpired,
        ignoreActiveDocumentLiveUntilRef,
        lastSavedSnapshotSignatureRef,
        loadDaptinDocument,
        recoverSessionError,
        refreshDocuments,
        setSyncMessage,
        setSyncStatus,
        signedIn,
        syncStatusRef,
        workspaceRef,
    } = input;

    const handleDocumentLiveEvent = useCallback(async (event: DaptinLiveEvent) => {
        if (event.topic !== 'document') return;
        try {
            const rows = await refreshDocuments();
            const liveDocumentRef = liveDocumentId(event);
            const currentDocumentRef = activeDocumentIdRef.current;
            const ignoredLiveUpdate = ignoreActiveDocumentLiveUntilRef.current;
            if (ignoredLiveUpdate && Date.now() > ignoredLiveUpdate.until) {
                ignoreActiveDocumentLiveUntilRef.current = null;
            }
            if (ignoredLiveUpdate && liveDocumentRef === ignoredLiveUpdate.documentRef &&
                Date.now() <= ignoredLiveUpdate.until) {
                return;
            }
            if (!liveDocumentRef || !currentDocumentRef || liveDocumentRef !== currentDocumentRef) return;
            if (syncStatusRef.current === 'saving' || syncStatusRef.current === 'loading') return;
            const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
            const isClean = syncStatusRef.current !== 'dirty' && currentSnapshot &&
                snapshotSignature(currentSnapshot) === lastSavedSnapshotSignatureRef.current;
            if (!isClean) {
                setSyncStatus('dirty');
                setSyncMessage('Online copy changed elsewhere. Save or refresh before continuing.');
                return;
            }
            await loadDaptinDocument(currentDocumentRef, rows);
        } catch (error) {
            if (await recoverSessionError(error)) return;
            setSyncStatus('error');
            setSyncMessage(workspaceErrorMessage(error, 'refresh'));
        }
    }, [
        activeDocumentIdRef,
        ignoreActiveDocumentLiveUntilRef,
        lastSavedSnapshotSignatureRef,
        loadDaptinDocument,
        recoverSessionError,
        refreshDocuments,
        setSyncMessage,
        setSyncStatus,
        syncStatusRef,
        workspaceRef,
    ]);

    useEffect(() => {
        if (!signedIn || !hasUsableStoredToken()) return;
        const connection = connectDaptinLive({
            topicName     : 'document',
            onEvent       : (event) => {
                void handleDocumentLiveEvent(event);
            },
            onUnauthorized: () => {
                void handleSessionExpired();
            },
        });
        return () => {
            connection.close();
        };
    }, [handleDocumentLiveEvent, handleSessionExpired, signedIn]);
}
