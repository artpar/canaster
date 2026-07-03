import type {StarterCatalogEntry} from '../app/starterWorkspace/types';
import {
    defaultStarterEntry,
    starterCollectionForEntry
} from '../app/starterWorkspace/starterCatalog';
import type {
    CanvasWorkspaceSnapshot
} from '../domain/documentTypes';
import {
    createWorkspaceHistory,
    createWorkspaceSnapshot
} from '../domain/workspaceHistory';
import {
    normalizeDaptinError,
    tokenEmail,
    tokenName
} from '../infra/daptin/daptinClient';
import type {DaptinLiveEvent} from '../infra/daptin/daptinLive';

export const DEFAULT_DOCUMENT_TITLE = 'Canaster Workspace';
export const SAVED_MESSAGE = 'Saved online';

export function saveActionLabel(status: SyncStatus, message: string, signedIn: boolean) {
    if (!signedIn) return 'Sign in to save online';
    if (status === 'saving' || status === 'loading') return message;
    if (status === 'error') return `${message}. Try saving again.`;
    if (status === 'dirty') return 'Save online changes';
    if (status === 'clean') return message === SAVED_MESSAGE ? 'Saved online' : 'Save workspace online';
    return 'Save workspace online';
}

export function agentAccessDisabledReason(input: {
    activeDocumentId: string;
    signedIn: boolean;
    syncStatus: SyncStatus;
    token: string;
}): string {
    if (input.syncStatus === 'saving' || input.syncStatus === 'loading') return 'Wait for sync to finish';
    if (!input.signedIn || !input.token) return 'Sign in and save online';
    if (!input.activeDocumentId) return 'Save online first';
    if (input.syncStatus === 'dirty') return 'Save online first';
    if (input.syncStatus === 'error') return 'Resolve sync before sharing';
    return 'Save online first';
}

export function remoteWorkspaceStorageKey(documentRef: string): string {
    return `daptin:${documentRef}`;
}

export function createLocalDraftSnapshot(entry: StarterCatalogEntry = defaultStarterEntry): CanvasWorkspaceSnapshot {
    return createWorkspaceSnapshot(createWorkspaceHistory(starterCollectionForEntry(entry)), null);
}

export function titleFromSnapshot(snapshot: CanvasWorkspaceSnapshot): string {
    const collection = snapshot.history.present;
    return collection.documents[collection.rootCanvasId]?.title || DEFAULT_DOCUMENT_TITLE;
}

export function workspaceErrorMessage(error: unknown, action: 'open' | 'refresh' | 'save'): string {
    const apiError = normalizeDaptinError(error, '');
    if (apiError.kind ===
        'session') return 'Session expired. Your workspace is saved on this device. Sign in again to save online.';
    if (apiError.kind === 'network') return 'Could not reach saved workspaces. Check your connection and try again.';
    if (apiError.kind === 'permission') return action === 'save' ?
        'Could not save this workspace because this account no longer has access. Keep working locally or sign in again.' :
        'This account cannot open that workspace. Choose another workspace or sign in again.';
    if (apiError.kind ===
        'not-found') return 'That saved workspace was not found. Refresh saved workspaces or keep working locally.';
    if (apiError.kind === 'server') return action === 'save' ?
        'Saved workspaces are unavailable right now. Your workspace is still here; try Save online again.' :
        'Saved workspaces are unavailable right now. Keep working locally and try again.';
    if (apiError.kind === 'invalid-response') return action === 'open' ?
        'That saved workspace could not be read. The current workspace was left unchanged.' :
        'Saved workspace data looked wrong. Keep working locally and try again.';
    if (action === 'open') return 'Could not open this workspace. Refresh saved workspaces or choose another one.';
    if (action === 'refresh') return 'Could not refresh saved workspaces. Check your connection and try again.';
    return 'Could not save this workspace. Check your connection and try again.';
}

export function accountErrorMessage(error: unknown, action: 'send-code' | 'verify-code'): string {
    const apiError = normalizeDaptinError(error, '');
    if (apiError.kind === 'network') return 'Could not reach accounts. Check your connection and try again.';
    if (apiError.kind === 'server' && action ===
        'send-code') return 'Accounts are unavailable right now. Try sending the code again.';
    if (action === 'send-code') return 'Could not send a sign-in code. Check the email and try again.';
    return 'Could not verify that code. Check the code and try again.';
}

export function liveDocumentId(event: DaptinLiveEvent): string {
    console.log("Get document id from", event)
    return documentIdFromLivePayload(event.data) || documentIdFromLivePayload(event.raw);
}

export function documentIdFromLivePayload(value: unknown): string {
    if (!isRecord(value)) return '';
    const direct = stringField(value.reference_id) || stringField(value.referenceId) || stringField(value.id);
    if (direct) return direct;
    const attributes = isRecord(value.attributes) ? value.attributes : null;
    if (!attributes) return '';
    return stringField(attributes.reference_id) || stringField(attributes.referenceId) || stringField(attributes.id);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function stringField(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

export function emailFromStoredToken(): string {
    return tokenEmail();
}

export function nameFromStoredToken(): string {
    return tokenName();
}

export function snapshotSignature(snapshot: unknown): string {
    return JSON.stringify(snapshot);
}
