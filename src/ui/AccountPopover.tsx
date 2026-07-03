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
import type {AuthStep, SyncStatus} from "./workspaceWorkflowTypes";

export type AccountPopoverProps = {
    authEmail: string;
    authOtp: string;
    authStep: AuthStep;
    docked?: boolean;
    signedIn: boolean;
    syncMessage: string;
    syncStatus: SyncStatus;
    onAuthStepChange: (step: AuthStep) => void;
    onClose: () => void;
    onEmailChange: (value: string) => void;
    onOtpChange: (value: string) => void;
    onRequestEmailOtp: () => void;
    onSignOut: () => void;
    onVerifyEmailOtp: () => void;
};

export function AccountPopover({
                                   authEmail,
                                   authOtp,
                                   authStep,
                                   docked = false,
                                   signedIn,
                                   syncMessage,
                                   syncStatus,
                                   onAuthStepChange,
                                   onClose,
                                   onEmailChange,
                                   onOtpChange,
                                   onRequestEmailOtp,
                                   onSignOut,
                                   onVerifyEmailOtp,
                               }: AccountPopoverProps) {
    const busy = syncStatus === 'loading' || syncStatus === 'saving';
    const submitDisabled = busy || !authEmail.trim() || (authStep === 'otp' && !authOtp.trim());
    const dialogRef = useRef<HTMLElement | null>(null);
    const modeLabel = accountModeLabel(authStep, signedIn);
    const syncLabel = syncStatusLabel(syncStatus, signedIn);
    const syncDescription = syncStatusDescription(syncStatus, signedIn);
    const accountAccessLabel = signedIn ? 'Connected' : authStep === 'otp' ? 'Code pending' : 'Email code';
    const saveScopeLabel = signedIn ? 'Account workspaces' : 'This browser';
    const verificationLabel = signedIn ? 'Ready to open online workspaces' :
        authStep === 'otp' ? 'Enter the code from your email' : 'No password needed';

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
                    {!signedIn ? (<div className="account-stepper">
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
                            if (authStep === 'otp') onVerifyEmailOtp(); else onRequestEmailOtp();
                        }}
                    >
                        <div className="account-auth-copy">
                            <span>{authStep === 'otp' ? 'Check email' : 'Save workspaces online'}</span>
                            <p>{authStep === 'otp' ? `Enter the 4-digit code sent to ${authEmail || 'your email'}.` :
                                'Use email to open and save account workspaces.'}</p>
                        </div>
                        <label className="account-field">
                            <span className="account-field-label">
                                Email
                                {authStep === 'otp' ? <em>Code sent</em> : null}
                            </span>
                            <input name="email" type="email" autoComplete="email" value={authEmail}
                                   autoFocus={authStep === 'email'}
                                   data-account-initial-focus={authStep === 'email' ? 'true' : undefined}
                                   disabled={busy && authStep === 'otp'}
                                   onChange={(event) => onEmailChange(event.target.value)}/>
                        </label>
                        {authStep === 'otp' ? (<label className="account-field account-code-field">
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
                            {busy ? <Clock3 size={15}/> : authStep === 'otp' ? <CheckCircle2 size={15}/> : <LogIn size={15}/>}
                            {busy ? authStep === 'otp' ? 'Checking code' : 'Sending code' :
                                authStep === 'otp' ? 'Verify code' : 'Send code'}
                        </button>
                        {authStep === 'otp' ? (
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

function accountModeLabel(authStep: AuthStep, signedIn: boolean): string {
    if (signedIn) return 'Signed in';
    if (authStep === 'otp') return 'Enter code';
    return 'Email sign in';
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
