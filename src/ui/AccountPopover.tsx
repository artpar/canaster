import {
    useEffect,
    useRef
} from "react";
import {
    CheckCircle2,
    Cloud,
    LogIn,
    LogOut,
    Mail,
    ShieldCheck,
    UserCircle,
    X
} from "lucide-react";
import {SyncStatusIcon} from "./SyncStatusIcon";

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
                    <span>{signedIn ? 'Signed in' : authStep === 'otp' ? 'Enter code' : 'Email sign in'}</span>
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
                        <span className={`account-step ${authStep === 'email' && !signedIn ? 'active' : 'complete'}`}>
                            <Mail size={14}/>
                            Email
                        </span>
                        <span className={`account-step ${authStep === 'otp' ? 'active' : signedIn ? 'complete' : ''}`}>
                            <ShieldCheck size={14}/>
                            Code
                        </span>
                    </div>) : null}
                    {signedIn ? (<div className="account-signed-in">
                        <div className="account-identity">
                            <span className="account-avatar" aria-hidden="true">
                                <UserCircle size={20}/>
                            </span>
                            <div>
                                <span>Canaster account</span>
                                <span>{authEmail || 'Signed in on this browser'}</span>
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
                                'Sign in with email to open and save account workspaces.'}</p>
                        </div>
                        <label className="account-field">
                            <span>Email</span>
                            <input name="email" type="email" autoComplete="email" value={authEmail}
                                   autoFocus={authStep === 'email'}
                                   data-account-initial-focus={authStep === 'email' ? 'true' : undefined}
                                   disabled={busy && authStep === 'otp'}
                                   onChange={(event) => onEmailChange(event.target.value)}/>
                        </label>
                        {authStep === 'otp' ? (<label className="account-field account-code-field">
                            <span>Code</span>
                            <div className="account-code-slots" aria-hidden="true">
                                {[0, 1, 2, 3].map((slot) => (
                                    <span
                                        className={slot === authOtp.length ? 'active' : authOtp[slot] ? 'filled' : ''}
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
                                pattern="[0-9]*"
                                maxLength={4}
                                autoFocus
                                data-account-initial-focus="true"
                                value={authOtp}
                                onChange={(event) => onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
                            />
                        </label>) : null}
                        <button className="account-submit" type="submit" disabled={submitDisabled}>
                            {authStep === 'otp' ? <CheckCircle2 size={15}/> : <LogIn size={15}/>}
                            {authStep === 'otp' ? 'Verify code' : 'Send code'}
                        </button>
                        {authStep === 'otp' ? (
                            <button className="account-text-action" type="button" onClick={() => onAuthStepChange('email')}>
                                Use a different email
                            </button>) : null}
                    </form>)}
                </section>
                <section className="account-sync-panel" aria-label="Save status">
                    <span className={`account-sync-mark ${syncStatus}`} aria-hidden="true">
                        <Cloud size={22}/>
                    </span>
                    <div>
                        <span>{syncStatusLabel(syncStatus, signedIn)}</span>
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

function syncStatusLabel(syncStatus: SyncStatus, signedIn: boolean): string {
    if (!signedIn) return 'Local workspace';
    if (syncStatus === 'clean') return 'Saved online';
    if (syncStatus === 'dirty') return 'Online changes pending';
    if (syncStatus === 'error') return 'Needs attention';
    if (syncStatus === 'saving') return 'Saving workspace';
    if (syncStatus === 'loading') return 'Checking workspace';
    return 'Workspace status';
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
