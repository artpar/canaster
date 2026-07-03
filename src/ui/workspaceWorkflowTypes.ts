export type AuthMode = 'code' | 'password' | 'reset';

export type AuthStep = 'email' | 'otp';

export type PasswordResetStep = 'request' | 'verify';

export type SyncStatus = 'anonymous' | 'loading' | 'clean' | 'dirty' | 'saving' | 'error';

export type SyncStatusSetter = (value: SyncStatus | ((current: SyncStatus) => SyncStatus)) => void;

export type ArrangeMenuPosition = {
    top: number;
    left: number;
};
