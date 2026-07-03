import {
    type MutableRefObject,
    useCallback
} from 'react';
import {
    setDocumentVisibility
} from '../infra/daptin/canasterDocuments';
import type {DocumentVisibility} from '../infra/daptin/documentPermissions';
import {normalizeDaptinError} from '../infra/daptin/daptinClient';
import type {NestedCanvasWorkspaceHandle} from './canvas/nested/NestedCanvasWorkspace';
import {snapshotSignature} from './workspaceDocumentWorkflow';

type SyncStatusSetter = (value: SyncStatus | ((current: SyncStatus) => SyncStatus)) => void;

export function useDocumentVisibility(input: {
    activeDocumentEditable: boolean;
    activeDocumentId: string;
    activeDocumentVisibility: DocumentVisibility | null;
    ignoreActiveDocumentLiveUntilRef: MutableRefObject<{ documentRef: string; until: number } | null>;
    lastSavedSnapshotSignatureRef: MutableRefObject<string | null>;
    recoverSessionError: (error: unknown) => Promise<boolean>;
    refreshDocuments: () => Promise<unknown>;
    setAccountOpen: (open: boolean) => void;
    setAuthStep: (step: AuthStep) => void;
    setSidePanelOpen: (open: boolean) => void;
    setSyncMessage: (message: string) => void;
    setSyncStatus: SyncStatusSetter;
    signedIn: boolean;
    syncStatusRef: MutableRefObject<SyncStatus>;
    workspaceRef: MutableRefObject<NestedCanvasWorkspaceHandle | null>;
}) {
    const {
        activeDocumentEditable,
        activeDocumentId,
        activeDocumentVisibility,
        ignoreActiveDocumentLiveUntilRef,
        lastSavedSnapshotSignatureRef,
        recoverSessionError,
        refreshDocuments,
        setAccountOpen,
        setAuthStep,
        setSidePanelOpen,
        setSyncMessage,
        setSyncStatus,
        signedIn,
        syncStatusRef,
        workspaceRef,
    } = input;

    return useCallback(async (visibility: DocumentVisibility) => {
        if (!signedIn) {
            setAuthStep('email');
            setSidePanelOpen(true);
            setAccountOpen(true);
            setSyncStatus('anonymous');
            setSyncMessage('Sign in before changing workspace visibility');
            return;
        }
        if (!activeDocumentId) {
            setSyncStatus('anonymous');
            setSyncMessage('Save online before changing workspace visibility');
            return;
        }
        if (!activeDocumentEditable) {
            setSyncStatus('error');
            setSyncMessage('Only the owner can change workspace visibility');
            return;
        }
        if (activeDocumentVisibility === visibility) return;
        const currentSnapshot = workspaceRef.current?.getWorkspaceSnapshot();
        const hasUnsavedWorkspaceChanges = syncStatusRef.current === 'dirty' ||
            Boolean(currentSnapshot && snapshotSignature(currentSnapshot) !== lastSavedSnapshotSignatureRef.current);
        setSyncStatus('saving');
        setSyncMessage(visibility === 'public' ? 'Making workspace public' : 'Making workspace private');
        try {
            ignoreActiveDocumentLiveUntilRef.current = { documentRef: activeDocumentId, until: Date.now() + 10000 };
            await setDocumentVisibility(activeDocumentId, visibility);
            ignoreActiveDocumentLiveUntilRef.current = { documentRef: activeDocumentId, until: Date.now() + 10000 };
            await refreshDocuments();
            if (hasUnsavedWorkspaceChanges) {
                setSyncStatus('dirty');
                setSyncMessage(visibility === 'public'
                    ? 'Workspace is public. Unsaved online changes'
                    : 'Workspace is private. Unsaved online changes');
            } else {
                setSyncStatus('clean');
                setSyncMessage(visibility === 'public' ? 'Workspace is public' : 'Workspace is private');
            }
        } catch (error) {
            if (await recoverSessionError(error)) return;
            setSyncStatus('error');
            const fallback = visibility === 'public'
                ? 'Could not make this workspace public. Check access and try again.'
                : 'Could not make this workspace private. Check access and try again.';
            const apiError = normalizeDaptinError(error, fallback);
            setSyncMessage(apiError.kind === 'permission'
                ? 'Only the owner can change workspace visibility'
                : apiError.message || fallback);
        }
    }, [
        activeDocumentEditable,
        activeDocumentId,
        activeDocumentVisibility,
        ignoreActiveDocumentLiveUntilRef,
        lastSavedSnapshotSignatureRef,
        recoverSessionError,
        refreshDocuments,
        setAccountOpen,
        setAuthStep,
        setSidePanelOpen,
        setSyncMessage,
        setSyncStatus,
        signedIn,
        syncStatusRef,
        workspaceRef,
    ]);
}
