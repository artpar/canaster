import {
    type MutableRefObject,
    useCallback
} from 'react';
import {safeDocumentSlug} from '../core/documentSlug';
import {publicAccountSlugFromIdentity} from '../core/publicAccountSlug';
import type {DocumentVisibility} from '../infra/daptin/documentPermissions';
import {shareDocumentUrl} from '../infra/browser/workspaceUrlLocation';
import type {NestedCanvasWorkspaceHandle} from './canvas/nested/NestedCanvasWorkspace';
import {
    emailFromStoredToken,
    nameFromStoredToken
} from './workspaceDocumentWorkflow';
import type {SyncStatusSetter} from './workspaceWorkflowTypes';

export type WorkspacePreviewCapture = NonNullable<Awaited<ReturnType<NestedCanvasWorkspaceHandle['captureActiveCanvasPreview']>>>;

export function useWorkspaceExport(input: {
    activeDocumentId: string;
    activeDocumentVisibility: DocumentVisibility | null;
    authEmail: string;
    documentTitle: string;
    setSyncMessage: (message: string) => void;
    setSyncStatus: SyncStatusSetter;
    workspaceRef: MutableRefObject<NestedCanvasWorkspaceHandle | null>;
}) {
    const {
        activeDocumentId,
        activeDocumentVisibility,
        authEmail,
        documentTitle,
        setSyncMessage,
        setSyncStatus,
        workspaceRef,
    } = input;

    const handleDownloadPreview = useCallback(async () => {
        try {
            const previewCapture = await workspaceRef.current?.captureActiveCanvasPreview();
            if (!previewCapture) throw new Error('Workspace preview is not ready yet');
            downloadBlob(previewCapture.blob, previewImageFileName(documentTitle));
        } catch {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Could not download workspace preview.');
        }
    }, [documentTitle, setSyncMessage, setSyncStatus, workspaceRef]);

    const handleCopyPreview = useCallback(async () => {
        try {
            await copyPngCaptureToClipboard(() => workspaceRef.current?.captureActiveCanvasPreview() ?? Promise.resolve(null));
            setSyncMessage('Workspace preview copied');
        } catch {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Could not copy workspace preview.');
        }
    }, [setSyncMessage, setSyncStatus, workspaceRef]);

    const handleCopyWorkspaceLink = useCallback(async () => {
        try {
            if (!activeDocumentId) throw new Error('Save online before copying a workspace link.');
            if (activeDocumentVisibility !== 'public') {
                throw new Error('Make this workspace public before copying a share link.');
            }
            const publicOwner = publicAccountSlugFromIdentity(nameFromStoredToken(), authEmail || emailFromStoredToken());
            if (!publicOwner) throw new Error('Sign in again before copying a workspace link.');
            await copyTextToClipboard(shareDocumentUrl(publicOwner, safeDocumentSlug(documentTitle)));
            setSyncMessage('Workspace link copied');
        } catch (error) {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage(error instanceof Error ? error.message : 'Could not copy workspace link.');
        }
    }, [activeDocumentId, activeDocumentVisibility, authEmail, documentTitle, setSyncMessage, setSyncStatus]);

    const handleCopyWorkspaceDocument = useCallback(async () => {
        try {
            const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
            if (!snapshot) throw new Error('Workspace is not ready yet');
            await copyTextToClipboard(JSON.stringify(snapshot, null, 2));
            setSyncMessage('Workspace document copied');
        } catch {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Could not copy workspace document.');
        }
    }, [setSyncMessage, setSyncStatus, workspaceRef]);

    return {
        handleCopyPreview,
        handleCopyWorkspaceDocument,
        handleCopyWorkspaceLink,
        handleDownloadPreview,
    };
}

export function previewImageFileName(documentTitle: string): string {
    const slug = documentTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return `${slug || 'canaster-workspace'}-preview.png`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function canCopyPngToClipboard(): boolean {
    return typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);
}

export function copyPngCaptureToClipboard(capture: () => Promise<WorkspacePreviewCapture | null>): Promise<void> {
    if (!canCopyPngToClipboard()) throw new Error('Image clipboard is not available');
    const pngBlob = Promise.resolve().then(capture).then((previewCapture) => {
        if (!previewCapture) throw new Error('Workspace preview is not ready yet');
        return pngBlobForClipboard(previewCapture.blob);
    });
    return navigator.clipboard.write([
        new ClipboardItem({
            'image/png': pngBlob,
        }),
    ]);
}

export function pngBlobForClipboard(blob: Blob): Blob {
    return blob.type === 'image/png' ? blob : new Blob([blob], {type: 'image/png'});
}

export async function copyTextToClipboard(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
        }
    }
    if (copyTextWithHiddenTextarea(text)) return;
    throw new Error('Text clipboard is not available');
}

function copyTextWithHiddenTextarea(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.append(textarea);
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch {
        copied = false;
    }
    textarea.remove();
    activeElement?.focus();
    return copied;
}
