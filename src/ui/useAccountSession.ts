import {
    type MutableRefObject,
    useCallback,
    useEffect
} from 'react';
import {
    type CanasterDocumentSummary,
    requestEmailOtp,
    requestPasswordReset,
    signInWithPassword,
    signOut,
    verifyEmailOtp,
    verifyPasswordReset
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
import type {AuthMode, AuthStep, PasswordResetStep, SyncStatusSetter} from './workspaceWorkflowTypes';

export function useAccountSession(input: {
    authEmail: string;
    authOtp: string;
    authPassword: string;
    authResetOtp: string;
    authResetStep: PasswordResetStep;
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
    setAuthMode: (mode: AuthMode) => void;
    setAuthOtp: (otp: string) => void;
    setAuthPassword: (password: string) => void;
    setAuthResetOtp: (otp: string) => void;
    setAuthResetStep: (step: PasswordResetStep) => void;
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
        authPassword,
        authResetOtp,
        authResetStep,
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
        setAuthMode,
        setAuthOtp,
        setAuthPassword,
        setAuthResetOtp,
        setAuthResetStep,
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
        if (authResetStep === 'verify') {
            setAuthResetStep('request');
            setAuthResetOtp('');
        }
    }, [authResetStep, authStep, setAuthEmail, setAuthOtp, setAuthResetOtp, setAuthResetStep, setAuthStep]);

    const completeSignedInAuth = useCallback((email: string) => {
        window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, email);
        setAuthEmail(email);
        setSignedIn(true);
        setAccountOpen(false);
        setAuthMode('code');
        setAuthOtp('');
        setAuthPassword('');
        setAuthResetOtp('');
        setAuthResetStep('request');
        setAuthStep('email');
        setSyncStatus('loading');
        setSyncMessage('Checking saved workspaces');
    }, [
        setAccountOpen,
        setAuthEmail,
        setAuthMode,
        setAuthOtp,
        setAuthPassword,
        setAuthResetOtp,
        setAuthResetStep,
        setAuthStep,
        setSignedIn,
        setSyncMessage,
        setSyncStatus,
    ]);

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
            completeSignedInAuth(email);
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(accountErrorMessage(error, 'verify-code'));
        }
    }, [authEmail, authOtp, completeSignedInAuth, setSyncMessage, setSyncStatus]);

    const handleSignInWithPassword = useCallback(async () => {
        const email = authEmail.trim().toLowerCase();
        const password = authPassword;
        if (!email || !password) return;
        setSyncStatus('loading');
        setSyncMessage('Signing in');
        try {
            await signInWithPassword({
                email,
                password,
            });
            completeSignedInAuth(email);
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(accountErrorMessage(error, 'password-signin'));
        }
    }, [authEmail, authPassword, completeSignedInAuth, setSyncMessage, setSyncStatus]);

    const handleRequestPasswordReset = useCallback(async () => {
        const email = authEmail.trim().toLowerCase();
        if (!email) return;
        setSyncStatus('loading');
        setSyncMessage('Sending password reset code');
        try {
            await requestPasswordReset({email});
            window.localStorage.setItem(DAPTIN_LAST_EMAIL_STORAGE_KEY, email);
            setAuthEmail(email);
            setAuthResetOtp('');
            setAuthResetStep('verify');
            setSyncStatus('clean');
            setSyncMessage('Check your email for the password reset code.');
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(accountErrorMessage(error, 'send-reset-code'));
        }
    }, [
        authEmail,
        setAuthEmail,
        setAuthResetOtp,
        setAuthResetStep,
        setSyncMessage,
        setSyncStatus,
    ]);

    const handleVerifyPasswordReset = useCallback(async () => {
        const email = authEmail.trim().toLowerCase();
        const otp = authResetOtp.trim();
        if (!email || !otp) return;
        setSyncStatus('loading');
        setSyncMessage('Verifying reset code');
        try {
            await verifyPasswordReset({
                email,
                otp,
            });
            setAuthMode('password');
            setAuthPassword('');
            setAuthResetOtp('');
            setAuthResetStep('request');
            setSyncStatus('clean');
            setSyncMessage('Password reset. Use the new password from your email to sign in.');
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(accountErrorMessage(error, 'verify-reset-code'));
        }
    }, [
        authEmail,
        authResetOtp,
        setAuthMode,
        setAuthPassword,
        setAuthResetOtp,
        setAuthResetStep,
        setSyncMessage,
        setSyncStatus,
    ]);

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
        setAuthPassword('');
        setAuthResetOtp('');
        setAuthResetStep('request');
        setAuthMode('code');
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
        setAuthMode,
        setAuthPassword,
        setAuthResetOtp,
        setAuthResetStep,
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
        setAuthPassword('');
        setAuthResetOtp('');
        setAuthResetStep('request');
        setAuthMode('code');
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
        setAuthMode,
        setAuthPassword,
        setAuthResetOtp,
        setAuthResetStep,
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
        handleRequestPasswordReset,
        handleSessionExpired,
        handleSignInWithPassword,
        handleSignOut,
        handleVerifyEmailOtp,
        handleVerifyPasswordReset,
        recoverSessionError,
    };
}
