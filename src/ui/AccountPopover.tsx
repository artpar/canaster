import {
    useEffect,
    useRef
} from "react";
import {
    AlertCircle,
    CheckCircle2,
    Clock3,
    Cloud,
    KeyRound,
    LogIn,
    LogOut,
    Mail,
    Save,
    ShieldCheck,
    UserCircle,
    X
} from "lucide-react";
import {SyncStatusIcon} from "./SyncStatusIcon";
import type {AuthMode, AuthStep, PasswordResetStep, SyncStatus} from "./workspaceWorkflowTypes";

export type AccountPopoverProps = {
    authEmail: string;
    authMode: AuthMode;
    authOtp: string;
    authPassword: string;
    authResetOtp: string;
    authResetStep: PasswordResetStep;
    authStep: AuthStep;
    docked?: boolean;
    signedIn: boolean;
    syncMessage: string;
    syncStatus: SyncStatus;
    onAuthModeChange: (mode: AuthMode) => void;
    onAuthPasswordChange: (value: string) => void;
    onAuthResetOtpChange: (value: string) => void;
    onAuthResetStepChange: (step: PasswordResetStep) => void;
    onAuthStepChange: (step: AuthStep) => void;
    onClose: () => void;
    onEmailChange: (value: string) => void;
    onOtpChange: (value: string) => void;
    onRequestEmailOtp: () => void;
    onRequestPasswordReset: () => void;
    onSignInWithPassword: () => void;
    onSignOut: () => void;
    onVerifyEmailOtp: () => void;
    onVerifyPasswordReset: () => void;
};

export function AccountPopover({
                                   authEmail,
                                   authMode,
                                   authOtp,
                                   authPassword,
                                   authResetOtp,
                                   authResetStep,
                                   authStep,
                                   docked = false,
                                   signedIn,
                                   syncMessage,
                                   syncStatus,
                                   onAuthModeChange,
                                   onAuthPasswordChange,
                                   onAuthResetOtpChange,
                                   onAuthResetStepChange,
                                   onAuthStepChange,
                                   onClose,
                                   onEmailChange,
                                   onOtpChange,
                                   onRequestEmailOtp,
                                   onRequestPasswordReset,
                                   onSignInWithPassword,
                                   onSignOut,
                                   onVerifyEmailOtp,
                                   onVerifyPasswordReset,
                               }: AccountPopoverProps) {
    const busy = syncStatus === 'loading' || syncStatus === 'saving';
    const submitDisabled = authSubmitDisabled({
        authEmail,
        authMode,
        authOtp,
        authPassword,
        authResetOtp,
        authResetStep,
        authStep,
        busy,
    });
    const dialogRef = useRef<HTMLElement | null>(null);
    const modeLabel = accountModeLabel(authMode, authResetStep, authStep, signedIn);
    const syncLabel = syncStatusLabel(syncStatus, signedIn);
    const syncDescription = syncStatusDescription(syncStatus, signedIn);
    const accountAccessLabel = accountAccessStatusLabel(authMode, authResetStep, authStep, signedIn);
    const saveScopeLabel = signedIn ? 'Account workspaces' : 'This browser';
    const verificationLabel = accountVerificationLabel(authMode, authResetStep, authStep, signedIn);

    useEffect(() => {
        if (docked) return;
        const dialog = dialogRef.current;
        const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusTarget = initialDialogFocusTarget(dialog);
        const focusFrame = window.requestAnimationFrame(() => {
            focusTarget?.focus();
        });
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialog) return;
            const focusableElements = dialogFocusableElements(dialog);
            if (!focusableElements.length) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;
            if (event.shiftKey) {
                if (activeElement === firstElement || !dialog.contains(activeElement)) {
                    event.preventDefault();
                    lastElement.focus();
                }
                return;
            }
            if (activeElement === lastElement || !dialog.contains(activeElement)) {
                event.preventDefault();
                firstElement.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.removeEventListener('keydown', handleKeyDown);
            if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
        };
    }, [docked, onClose]);

    const content = (
        <aside
            ref={dialogRef}
            className={`account-popover${docked ? ' account-popover-docked' : ''}`}
            aria-label="Account"
            aria-modal={docked ? undefined : true}
            role={docked ? undefined : 'dialog'}
            tabIndex={docked ? undefined : -1}
        >
            <div className="account-popover-header">
                <div>
                    <span>Account</span>
                    <span>{modeLabel}</span>
                </div>
                <button
                    className="utility-close"
                    type="button"
                    aria-label="Close account"
                    data-account-initial-focus={signedIn ? 'true' : undefined}
                    onClick={onClose}
                >
                    <X size={15}/>
                </button>
            </div>
            <div className="account-popover-body">
                <section className="account-primary-panel" aria-label={signedIn ? 'Signed-in account' : 'Sign in'}>
                    {!signedIn && authMode !== 'reset' ? (<div className="account-tabs" role="tablist" aria-label="Sign-in method">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={authMode === 'code'}
                            onClick={() => onAuthModeChange('code')}
                        >
                            Email code
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={authMode === 'password'}
                            onClick={() => onAuthModeChange('password')}
                        >
                            Password
                        </button>
                    </div>) : null}
                    {!signedIn && authMode === 'code' ? (<div className="account-stepper">
                        <span className={`account-step ${authStep === 'email' ? 'active' : 'complete'}`}>
                            <Mail size={14}/>
                            Email
                        </span>
                        <span className={`account-step ${authStep === 'otp' ? 'active' : ''}`}>
                            <ShieldCheck size={14}/>
                            Code
                        </span>
                    </div>) : null}
                    {signedIn ? (<div className="account-signed-in">
                        <div className="account-identity-panel">
                            <div className="account-identity">
                                <span className="account-avatar" aria-hidden="true">
                                    <UserCircle size={20}/>
                                </span>
                                <div>
                                    <span>Canaster account</span>
                                    <span>{authEmail || 'Signed in on this browser'}</span>
                                </div>
                            </div>
                            <span className="account-connection-badge">
                                <CheckCircle2 size={13}/>
                                Online save ready
                            </span>
                        </div>
                        <div className="account-session-grid" aria-label="Account readiness">
                            <div>
                                <span><ShieldCheck size={14}/>Account access</span>
                                <strong>{accountAccessLabel}</strong>
                            </div>
                            <div>
                                <span><Save size={14}/>Save scope</span>
                                <strong>{saveScopeLabel}</strong>
                            </div>
                            <div>
                                <span><Cloud size={14}/>Workspace state</span>
                                <strong>{syncLabel}</strong>
                            </div>
                        </div>
                        <button className="drawer-action" type="button" onClick={onSignOut}>
                            <LogOut size={15}/>
                            Sign out
                        </button>
                    </div>) : (<form
                        className="account-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (authMode === 'code') {
                                if (authStep === 'otp') onVerifyEmailOtp(); else onRequestEmailOtp();
                                return;
                            }
                            if (authMode === 'password') {
                                onSignInWithPassword();
                                return;
                            }
                            if (authResetStep === 'verify') onVerifyPasswordReset(); else onRequestPasswordReset();
                        }}
                    >
                        <div className="account-auth-copy">
                            <span>{authTitle(authMode, authResetStep, authStep)}</span>
                            <p>{authDescription(authEmail, authMode, authResetStep, authStep)}</p>
                        </div>
                        <label className="account-field">
                            <span className="account-field-label">
                                Email
                                {emailFieldBadge(authMode, authResetStep, authStep)}
                            </span>
                            <input name="email" type="email" autoComplete="email" value={authEmail}
                                   autoFocus={authMode === 'code' && authStep === 'email'}
                                   data-account-initial-focus={authMode === 'code' && authStep === 'email' ? 'true' : undefined}
                                   disabled={busy && (authStep === 'otp' || authResetStep === 'verify')}
                                   onChange={(event) => onEmailChange(event.target.value)}/>
                        </label>
                        {authMode === 'password' ? (<label className="account-field">
                            <span className="account-field-label">Password</span>
                            <input
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                value={authPassword}
                                autoFocus
                                data-account-initial-focus="true"
                                onChange={(event) => onAuthPasswordChange(event.target.value)}
                            />
                        </label>) : null}
                        {authMode === 'reset' && authResetStep === 'verify' ? (
                            <label className="account-field">
                                <span className="account-field-label">Reset code</span>
                                <input
                                    name="password-reset-code"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={authResetOtp}
                                    autoFocus
                                    data-account-initial-focus="true"
                                    onChange={(event) => onAuthResetOtpChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
                                />
                            </label>
                        ) : null}
                        {authMode === 'code' && authStep === 'otp' ? (<label className="account-field account-code-field">
                            <span className="account-field-label">
                                Code
                                <em>{authOtp.length}/4 digits</em>
                            </span>
                            <div className="account-code-slots" aria-hidden="true">
                                {[0, 1, 2, 3].map((slot) => (
                                    <span
                                        className={codeSlotClassName(slot, authOtp)}
                                        key={slot}
                                    >
                                        {authOtp[slot] || ''}
                                    </span>
                                ))}
                            </div>
                            <input
                                name="one-time-code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                aria-label="Email sign-in code"
                                pattern="[0-9]*"
                                maxLength={4}
                                autoFocus
                                data-account-initial-focus="true"
                                value={authOtp}
                                onChange={(event) => onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
                            />
                        </label>) : null}
                        <button className="account-submit" type="submit" disabled={submitDisabled}>
                            {busy ? <Clock3 size={15}/> : submitIcon(authMode, authResetStep, authStep)}
                            {submitLabel(authMode, authResetStep, authStep, busy)}
                        </button>
                        {authMode === 'password' ? (
                            <button className="account-text-action" type="button" onClick={() => {
                                onAuthResetStepChange('request');
                                onAuthModeChange('reset');
                            }}>
                                Forgot password
                            </button>) : null}
                        {authMode === 'reset' ? (
                            <button className="account-text-action" type="button" onClick={() => onAuthModeChange('password')}>
                                Back to password sign in
                            </button>) : null}
                        {authMode === 'code' && authStep === 'otp' ? (
                            <button className="account-text-action" type="button" onClick={() => onAuthStepChange('email')}>
                                Use a different email
                            </button>) : null}
                    </form>)}
                </section>
                <section className="account-sync-panel" aria-label="Save status">
                    <div className={`account-sync-hero ${syncStatus}`}>
                        <span className={`account-sync-mark ${syncStatus}`} aria-hidden="true">
                            {syncStatus === 'error' ? <AlertCircle size={22}/> : <Cloud size={22}/>}
                        </span>
                        <div>
                            <span>{syncLabel}</span>
                            <p>{syncDescription}</p>
                        </div>
                    </div>
                    <div className="account-trust-list" aria-label="Account and save details">
                        <div>
                            <span><KeyRound size={14}/>Account access</span>
                            <strong>{accountAccessLabel}</strong>
                        </div>
                        <div>
                            <span><Save size={14}/>Save scope</span>
                            <strong>{saveScopeLabel}</strong>
                        </div>
                        <div>
                            <span><ShieldCheck size={14}/>Verification</span>
                            <strong>{verificationLabel}</strong>
                        </div>
                    </div>
                    <div className={`account-status ${syncStatus}`} role="status" aria-live="polite">
                        <SyncStatusIcon status={syncStatus}/>
                        <span>{syncMessage}</span>
                    </div>
                </section>
            </div>
        </aside>
    );

    if (docked) return content;
    return (
        <div className="account-popover-shell" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            {content}
        </div>
    );
}

function authSubmitDisabled(input: {
    authEmail: string;
    authMode: AuthMode;
    authOtp: string;
    authPassword: string;
    authResetOtp: string;
    authResetStep: PasswordResetStep;
    authStep: AuthStep;
    busy: boolean;
}): boolean {
    if (input.busy || !input.authEmail.trim()) return true;
    if (input.authMode === 'code') return input.authStep === 'otp' && !input.authOtp.trim();
    if (input.authMode === 'password') return !input.authPassword;
    return input.authResetStep === 'verify' && !input.authResetOtp.trim();
}

function accountModeLabel(
    authMode: AuthMode,
    authResetStep: PasswordResetStep,
    authStep: AuthStep,
    signedIn: boolean,
): string {
    if (signedIn) return 'Signed in';
    if (authMode === 'password') return 'Password sign in';
    if (authMode === 'reset') return authResetStep === 'verify' ? 'Reset password' : 'Forgot password';
    if (authStep === 'otp') return 'Enter code';
    return 'Email sign in';
}

function accountAccessStatusLabel(
    authMode: AuthMode,
    authResetStep: PasswordResetStep,
    authStep: AuthStep,
    signedIn: boolean,
): string {
    if (signedIn) return 'Connected';
    if (authMode === 'password') return 'Password';
    if (authMode === 'reset') return authResetStep === 'verify' ? 'Reset code pending' : 'Password reset';
    return authStep === 'otp' ? 'Code pending' : 'Email code';
}

function accountVerificationLabel(
    authMode: AuthMode,
    authResetStep: PasswordResetStep,
    authStep: AuthStep,
    signedIn: boolean,
): string {
    if (signedIn) return 'Ready to open online workspaces';
    if (authMode === 'password') return 'Use your account password';
    if (authMode === 'reset') return authResetStep === 'verify' ? 'Enter the code from your email' : 'Send a reset code';
    return authStep === 'otp' ? 'Enter the code from your email' : 'No password needed';
}

function authTitle(authMode: AuthMode, authResetStep: PasswordResetStep, authStep: AuthStep): string {
    if (authMode === 'password') return 'Sign in with password';
    if (authMode === 'reset') return authResetStep === 'verify' ? 'Reset password' : 'Forgot password';
    return authStep === 'otp' ? 'Check email' : 'Save workspaces online';
}

function authDescription(
    authEmail: string,
    authMode: AuthMode,
    authResetStep: PasswordResetStep,
    authStep: AuthStep,
): string {
    if (authMode === 'password') return 'Use your account password to open and save account workspaces.';
    if (authMode === 'reset') {
        if (authResetStep === 'verify') return `Enter the reset code sent to ${authEmail || 'your email'}. A new password will be emailed after verification.`;
        return 'Send a password reset code to the email on your account.';
    }
    if (authStep === 'otp') return `Enter the 4-digit code sent to ${authEmail || 'your email'}.`;
    return 'Use email to open and save account workspaces.';
}

function emailFieldBadge(authMode: AuthMode, authResetStep: PasswordResetStep, authStep: AuthStep) {
    if (authMode === 'reset' && authResetStep === 'verify') return <em>Reset sent</em>;
    if (authMode === 'code' && authStep === 'otp') return <em>Code sent</em>;
    return null;
}

function submitIcon(authMode: AuthMode, authResetStep: PasswordResetStep, authStep: AuthStep) {
    if (authMode === 'reset') return authResetStep === 'verify' ? <CheckCircle2 size={15}/> : <KeyRound size={15}/>;
    if (authMode === 'code' && authStep === 'otp') return <CheckCircle2 size={15}/>;
    return <LogIn size={15}/>;
}

function submitLabel(
    authMode: AuthMode,
    authResetStep: PasswordResetStep,
    authStep: AuthStep,
    busy: boolean,
): string {
    if (authMode === 'password') return busy ? 'Signing in' : 'Sign in';
    if (authMode === 'reset') {
        if (authResetStep === 'verify') return busy ? 'Verifying code' : 'Verify reset code';
        return busy ? 'Sending reset code' : 'Send reset code';
    }
    if (authStep === 'otp') return busy ? 'Checking code' : 'Verify code';
    return busy ? 'Sending code' : 'Send code';
}

function codeSlotClassName(slot: number, authOtp: string): string {
    if (authOtp[slot]) return 'filled';
    if (slot === authOtp.length && authOtp.length < 4) return 'active';
    return '';
}

function syncStatusLabel(syncStatus: SyncStatus, signedIn: boolean): string {
    if (!signedIn) return 'Local workspace';
    if (syncStatus === 'clean') return 'Saved online';
    if (syncStatus === 'dirty') return 'Online changes pending';
    if (syncStatus === 'error') return 'Needs attention';
    if (syncStatus === 'saving') return 'Saving workspace';
    if (syncStatus === 'loading') return 'Checking workspace';
    return 'Workspace status';
}

function syncStatusDescription(syncStatus: SyncStatus, signedIn: boolean): string {
    if (!signedIn) return 'Your current workspace stays on this browser until you sign in.';
    if (syncStatus === 'clean') return 'Changes are saved to your account and ready to reopen.';
    if (syncStatus === 'dirty') return 'Recent edits are waiting for the next save.';
    if (syncStatus === 'error') return 'Canaster could not finish the last account save.';
    if (syncStatus === 'saving') return 'Canaster is saving the current workspace now.';
    if (syncStatus === 'loading') return 'Canaster is checking account workspaces.';
    return 'Canaster is watching this workspace for account saves.';
}

function initialDialogFocusTarget(dialog: HTMLElement | null): HTMLElement | null {
    if (!dialog) return null;
    const preferredTarget = dialog.querySelector<HTMLElement>('[data-account-initial-focus]');
    return preferredTarget ?? dialogFocusableElements(dialog)[0] ?? dialog;
}

function dialogFocusableElements(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), ' +
        '[tabindex]:not([tabindex="-1"])'
    )).filter((element) => {
        if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') return false;
        return element.getClientRects().length > 0 || element === document.activeElement;
    });
}
