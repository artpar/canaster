import {
    CheckCircle2,
    LogIn,
    LogOut,
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
    return (<aside className={`account-popover${docked ? ' account-popover-docked' : ''}`} aria-label="Account">
        <div className="account-popover-header">
            <div>
                <span>Account</span>
                <span>{signedIn ? 'Signed in' : authStep === 'otp' ? 'Enter code' : 'Email sign in'}</span>
            </div>
            <button className="utility-close" type="button" aria-label="Close account" onClick={onClose}>
                <X size={15}/>
            </button>
        </div>
        {signedIn ? (<div className="account-signed-in">
            <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">
              <UserCircle size={18}/>
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
                <span>{authStep === 'otp' ? 'Check email' : ''}</span>
            </div>
            <label className="account-field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" value={authEmail}
                       onChange={(event) => onEmailChange(event.target.value)}/>
            </label>
            {authStep === 'otp' ? (<label className="account-field">
                <span>Code</span>
                <input
                    name="one-time-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={4}
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
        <div className={`account-status ${syncStatus}`} role="status" aria-live="polite">
            <SyncStatusIcon status={syncStatus}/>
            <span>{syncMessage}</span>
        </div>
    </aside>);
}
