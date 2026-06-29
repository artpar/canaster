import type { StarterCatalogEntry } from "../app/starterWorkspace/types";

type CatalogPanelProps = {
    entries: readonly StarterCatalogEntry[];
    onStart: (entryId: string) => void;
};

export function CatalogPanel({entries, onStart}: CatalogPanelProps) {
    return (
        <section className="sidepanel-section catalog-section" aria-label="Catalog">
            <div className="sidepanel-section-row">
                <div className="sidepanel-section-title">
                    <span>Catalog</span>
                    <span>{entries.length === 1 ? '1 start' : `${entries.length} starts`}</span>
                </div>
            </div>
            <div className="catalog-list" aria-label="Starter workspaces">
                {entries.map((entry) => (
                    <button
                        key={entry.id}
                        className="catalog-row"
                        type="button"
                        onClick={() => onStart(entry.id)}
                    >
                        <span className="catalog-row-title">{entry.title}</span>
                        <span className="catalog-row-summary">{entry.summary}</span>
                        <span className="catalog-row-meta">{catalogMeta(entry)}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}

function catalogMeta(entry: StarterCatalogEntry): string {
    return [entry.audience, ...entry.tags].filter(Boolean).join(' / ');
}
