import {
    forwardRef,
    type Ref
} from "react";
import {X} from "lucide-react";
import {BuiltInNodeTypes} from "./engine/types";

export const PANEL_CREATE_OPTIONS = [
    {
        type  : BuiltInNodeTypes.card,
        label : 'Work item',
        detail: 'Title, detail, and work accent',
        badge : 'WORK'
    },
    {
        type  : BuiltInNodeTypes.text,
        label : 'Note',
        detail: 'Plain text for local context',
        badge : 'NOTE'
    },
    {
        type  : BuiltInNodeTypes.image,
        label : 'Image',
        detail: 'Visual reference with alt text',
        badge : 'IMAGE'
    },
    {
        type  : BuiltInNodeTypes.canvas,
        label : 'View',
        detail: 'A child canvas portal',
        badge : 'VIEW'
    },
    {
        type  : BuiltInNodeTypes.check,
        label : 'Checklist',
        detail: 'Actionable list with done count',
        badge : 'LIST'
    },
] as const;


type PanelCreateOption = (typeof PANEL_CREATE_OPTIONS)[number];

type AddPanelPopoverProps = {
    searchRef: Ref<HTMLInputElement>;
    position: ArrangeMenuPosition | null;
    options: PanelCreateOption[];
    query: string;
    activeIndex: number;
    onQueryChange: (query: string) => void;
    onActiveIndexChange: (index: number) => void;
    onCreate: (nodeType: string) => void;
    onClose: () => void;
};


export const AddPanelPopover = forwardRef<HTMLDivElement, AddPanelPopoverProps>(function AddPanelPopover(
    {
        searchRef,
        position,
        options,
        query,
        activeIndex,
        onQueryChange,
        onActiveIndexChange,
        onCreate,
        onClose,
    },
    ref,
) {
    const activeOption = options[activeIndex] ?? null;
    return (
        <div
            ref={ref}
            className="add-panel-menu"
            role="dialog"
            aria-label="Add panel"
            style={position ? {
                top : position.top,
                left: position.left
            } : undefined}
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    onActiveIndexChange(options.length ? (activeIndex + 1) % options.length : 0);
                    return;
                }
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    onActiveIndexChange(options.length ? (activeIndex - 1 + options.length) % options.length : 0);
                    return;
                }
                if (event.key === 'Enter' && activeOption) {
                    event.preventDefault();
                    onCreate(activeOption.type);
                    return;
                }
                if (/^[1-9]$/.test(event.key)) {
                    const option = options[Number(event.key) - 1];
                    if (option) {
                        event.preventDefault();
                        onCreate(option.type);
                    }
                }
            }}
        >
            <input
                ref={searchRef}
                className="add-panel-search"
                type="search"
                aria-label="Search panel types"
                placeholder="Add panel"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
            />
            <div className="add-panel-options" role="listbox" aria-label="Panel types">
                {options.length ? options.map((option, index) => (
                    <button
                        key={option.type}
                        className="arrange-menu-item add-panel-menu-item"
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => onActiveIndexChange(index)}
                        onClick={() => onCreate(option.type)}
                    >
                        <span className="panel-type-mark" aria-hidden="true">{option.badge}</span>
                        <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
                        <kbd>{index + 1}</kbd>
                    </button>
                )) : (
                    <div className="add-panel-empty">No panel type</div>
                )}
            </div>
            <button className="add-panel-close" type="button" aria-label="Close add panel" onClick={onClose}>
                <X size={14}/>
            </button>
        </div>
    );
});
