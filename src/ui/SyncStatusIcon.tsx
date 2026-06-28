import {
    CheckCircle2,
    Loader2
} from "lucide-react";

export function SyncStatusIcon({status}: { status: SyncStatus }) {
    if (status === 'loading' || status === 'saving') return <Loader2 size={13}/>;
    if (status === 'clean') return <CheckCircle2 size={13}/>;
    return <span className="sync-dot" aria-hidden="true"/>;
}
