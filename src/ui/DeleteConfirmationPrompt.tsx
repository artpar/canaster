import type {CanvasDocumentCollection} from "../domain/documentTypes";

export function DeleteConfirmationPrompt({
                                             collection,
                                             onCancel,
                                             onConfirm,
                                         }: {
    collection: CanvasDocumentCollection; onCancel: () => void; onConfirm: () => void;
}) {
    const confirmation = collection.view.deleteConfirmation;
    if (!confirmation) return null;
    const document = collection.documents[confirmation.canvasId];
    const nodes = document?.model.nodes.filter((node) => confirmation.nodeIds.includes(node.id)) ?? [];
    const count = nodes.length || confirmation.nodeIds.length;
    return (<div className="delete-confirmation" role="presentation" onPointerDown={onCancel}>
        <section
            className="delete-confirmation-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirmation-title"
            aria-describedby="delete-confirmation-copy"
            onPointerDown={(event) => event.stopPropagation()}
        >
            <h2 id="delete-confirmation-title">{count > 1 ? `Delete ${count} views?` : 'Delete this view?'}</h2>
            <p id="delete-confirmation-copy">Child canvas content will be removed with it.</p>
            <div>
                <button type="button" onClick={onCancel}>Cancel</button>
                <button className="danger" type="button" onClick={onConfirm}>Delete</button>
            </div>
        </section>
    </div>);
}
