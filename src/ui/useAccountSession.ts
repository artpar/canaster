import {
    type MutableRefObject,
    useCallback,
    useEffect
} from 'react';
import {
    type CanasterDocumentSummary,
    requestEmailOtp,
    signOut,
    verifyEmailOtp
} from '../infra/daptin/canasterDocuments';
import {
    clearDaptinSession,
    DAPTIN_LAST_EMAIL_STORAGE_KEY,
    isSessionError
} from '../infra/daptin/daptinClient';
import {saveWorkspaceSnapshot} from '../infra/browser/workspaceStorage';
import {STARTER_WORKSPACE_STORAGE_KEY} from '../app/starterWorkspace/starterCatalog';
import type {NestedCanvasWorkspaceHandle} from './canvas/nested/NestedCanvasWorkspace';
import {
    accountErrorMessage,
    emailFromStoredToken
} from './workspaceDocumentWorkflow';

type SyncStatusSetter = (value: SyncStatus | ((current: SyncStatus) => SyncStatus)) => void;

export function useAccountSession(input: {
    authEmail: string;
    authOtp: string;
    authStep: AuthStep;
    documentOpenRequestIdRef: MutableRefObject<number>;
    lastSavedSnapshotSignatureRef: MutableRefObject<string | null>;
    localSaveMessage: string;
    preserveCameraOnNextLocalMountRef: MutableRefObject<boolean>;
    preserveShareUrlRef: MutableRefObject<boolean>;
    replaceCurrentWorkspaceUrl: (documentRef: string | null) => void;
    setAccountOpen: (open: boolean) => void;
    setActiveDocumentId: (documentRef: string) => void;
    setAuthEmail: (email: string) => void;
    setAuthOtp: (otp: string) => void;
    setAuthStep: (step: AuthStep) => void;
    setDocuments: (documents: CanasterDocumentSummary[]) => void;
    setSidePanelOpen: (open: boolean) => void;
    setSignedIn: (signedIn: boolean) => void;
    setSyncMessage: (message: string) => void;
    setSyncStatus: SyncStatusSetter;
    signedIn: boolean;
    workspaceRef: MutableRefObject<NestedCanvasWorkspaceHandle | null>;
}) {
    const {
        authEmail,
        authOtp,
        authStep,
        documentOpenRequestIdRef,
        lastSavedSnapshotSignatureRef,
        localSaveMessage,
        preserveCameraOnNextLocalMountRef,
        preserveShareUrlRef,
        replaceCurrentWorkspaceUrl,
        setAccountOpen,
        setActiveDocumentId,
        setAuthEmail,
        setAuthOtp,
        setAuthStep,
        setDocuments,
        setSidePanelOpen,
        setSignedIn,
        setSyncMessage,
        setSyncStatus,
        signedIn,
        workspaceRef,
    } = input;

    useEffect(() => {
        if (!signedIn) return;
        const tokenEmail = emailFromStoredToken();
        if (!tokenEmail || tokenEmail === authEmail.trim()) return;
        setAuthEmail(tokenEmail);
        window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, tokenEmail);
    }, [authEmail, setAuthEmail, signedIn]);

    const handleAuthEmailChange = useCallback((value: string) => {
        setAuthEmail(value);
        if (authStep === 'otp') {
            setAuthStep('email');
            setAuthOtp('');
        }
    }, [authStep, setAuthEmail, setAuthOtp, setAuthStep]);

    const handleRequestEmailOtp = useCallback(async () => {
        const email = authEmail.trim().toLowerCase();
        if (!email) return;
        setSyncStatus('loading');
        setSyncMessage('Sending sign-in code');
        try {
            await requestEmailOtp({email});
            window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, email);
            setAuthEmail(email);
            setAuthOtp('');
            setAuthStep('otp');
            setSyncStatus('clean');
            setSyncMessage('Check your email for the sign-in code.');
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(accountErrorMessage(error, 'send-code'));
        }
    }, [authEmail, setAuthEmail, setAuthOtp, setAuthStep, setSyncMessage, setSyncStatus]);

    const handleVerifyEmailOtp = useCallback(async () => {
        const email = authEmail.trim().toLowerCase();
        const otp = authOtp.trim();
        if (!email || !otp) return;
        setSyncStatus('loading');
        setSyncMessage('Verifying sign-in code');
        try {
            await verifyEmailOtp({
                email,
                otp
            });
            window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, email);
            setAuthEmail(email);
            setSignedIn(true);
            setAccountOpen(false);
            setAuthOtp('');
            setAuthStep('email');
            setSyncStatus('loading');
            setSyncMessage('Checking saved workspaces');
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(accountErrorMessage(error, 'verify-code'));
        }
    }, [authEmail, authOtp, setAccountOpen, setAuthEmail, setAuthOtp, setAuthStep, setSignedIn, setSyncMessage, setSyncStatus]);

    const handleSessionExpired = useCallback(async () => {
        documentOpenRequestIdRef.current += 1;
        let savedLocally = false;
        const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
        if (snapshot) {
            try {
                await saveWorkspaceSnapshot(snapshot, STARTER_WORKSPACE_STORAGE_KEY);
                savedLocally = true;
            } catch {
                savedLocally = false;
            }
        }
        clearDaptinSession();
        lastSavedSnapshotSignatureRef.current = null;
        preserveCameraOnNextLocalMountRef.current = true;
        setSignedIn(false);
        setActiveDocumentId('');
        setDocuments([]);
        setAuthOtp('');
        setAuthStep('email');
        setSidePanelOpen(true);
        setAccountOpen(true);
        setSyncStatus('error');
        setSyncMessage(
            savedLocally ? 'Session expired. Your workspace is saved on this device. Sign in again to save online.' :
                'Session expired. Keep this tab open and sign in again to save online.');
        replaceCurrentWorkspaceUrl(null);
    }, [
        documentOpenRequestIdRef,
        lastSavedSnapshotSignatureRef,
        preserveCameraOnNextLocalMountRef,
        replaceCurrentWorkspaceUrl,
        setAccountOpen,
        setActiveDocumentId,
        setAuthOtp,
        setAuthStep,
        setDocuments,
        setSidePanelOpen,
        setSignedIn,
        setSyncMessage,
        setSyncStatus,
        workspaceRef,
    ]);

    const recoverSessionError = useCallback(async (error: unknown): Promise<boolean> => {
        if (!isSessionError(error)) return false;
        await handleSessionExpired();
        return true;
    }, [handleSessionExpired]);

    const handleSignOut = useCallback(async () => {
        documentOpenRequestIdRef.current += 1;
        const snapshot = workspaceRef.current?.getWorkspaceSnapshot();
        if (snapshot) await saveWorkspaceSnapshot(snapshot, STARTER_WORKSPACE_STORAGE_KEY);
        try {
            await signOut();
        } catch {
        }
        clearDaptinSession();
        lastSavedSnapshotSignatureRef.current = null;
        preserveCameraOnNextLocalMountRef.current = true;
        setSignedIn(false);
        setActiveDocumentId('');
        setDocuments([]);
        setAuthOtp('');
        setAuthStep('email');
        setAccountOpen(false);
        setSyncStatus('anonymous');
        setSyncMessage(localSaveMessage);
        preserveShareUrlRef.current = false;
        replaceCurrentWorkspaceUrl(null);
    }, [
        documentOpenRequestIdRef,
        lastSavedSnapshotSignatureRef,
        localSaveMessage,
        preserveCameraOnNextLocalMountRef,
        preserveShareUrlRef,
        replaceCurrentWorkspaceUrl,
        setAccountOpen,
        setActiveDocumentId,
        setAuthOtp,
        setAuthStep,
        setDocuments,
        setSignedIn,
        setSyncMessage,
        setSyncStatus,
        workspaceRef,
    ]);

    return {
        handleAuthEmailChange,
        handleRequestEmailOtp,
        handleSessionExpired,
        handleSignOut,
        handleVerifyEmailOtp,
        recoverSessionError,
    };
}
