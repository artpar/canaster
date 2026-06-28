import {X} from "lucide-react";

export type WorkspaceToast = { id: number; message: string; actionLabel: string; action: () => void } | null;

export function WorkspaceToastView({
                                       toast,
                                       onDismiss
                                   }: { toast: NonNullable<WorkspaceToast>; onDismiss: () => void }) {
    return (<div className="workspace-toast" role="status" aria-live="polite">
        <span>{toast.message}</span>
        <button type="button" onClick={toast.action}>{toast.actionLabel}</button>
        <button className="workspace-toast-close" type="button" aria-label="Dismiss notification"
                onClick={onDismiss}>
            <X size={14}/>
        </button>
    </div>);
}
