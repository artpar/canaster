import {
    forwardRef,
    useEffect,
    useRef,
    type Ref
} from "react";
import {X} from "lucide-react";
import {AddPanelNodePreview} from "./AddPanelNodePreview";
import {registeredNodeAddOptions, type RegisteredNodeAddOption} from "./canvas/nodeRegistry";

export const PANEL_CREATE_OPTIONS = registeredNodeAddOptions();

const ADD_PANEL_OPTIONS_ID = 'add-panel-options';


type PanelCreateOption = RegisteredNodeAddOption;

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
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

    useEffect(() => {
        optionRefs.current.length = options.length;
        const activeOptionElement = optionRefs.current[activeIndex];
        activeOptionElement?.scrollIntoView({
            block: 'nearest',
        });
    }, [activeIndex, options.length]);

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
                    const shortcutIndex = Number(event.key) - 1;
                    const option = shortcutIndex < 9 ? options[shortcutIndex] : undefined;
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
                name="add-panel-search"
                aria-label="Search panel types"
                aria-controls={ADD_PANEL_OPTIONS_ID}
                aria-activedescendant={activeOption ? optionIdForType(activeOption.type) : undefined}
                placeholder="Add panel"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
            />
            <div id={ADD_PANEL_OPTIONS_ID} className="add-panel-options" role="listbox" aria-label="Panel types">
                {options.length ? options.map((option, index) => {
                    const shortcut = shortcutForIndex(index);
                    return (
                        <button
                            key={option.type}
                            ref={(element) => {
                                optionRefs.current[index] = element;
                            }}
                            id={optionIdForType(option.type)}
                            className="add-panel-menu-item"
                            type="button"
                            role="option"
                            aria-selected={index === activeIndex}
                            onMouseEnter={() => onActiveIndexChange(index)}
                            onClick={() => onCreate(option.type)}
                            aria-label={shortcut ? `${option.label}. Press ${shortcut} to add.` : option.label}
                            data-panel-type={option.type}
                        >
                            <span className="add-panel-option-header">
                                <span className="add-panel-option-copy">
                                    <strong>{option.label}</strong>
                                </span>
                                {shortcut ? <kbd aria-hidden="true">{shortcut}</kbd> : null}
                            </span>
                            <AddPanelNodePreview
                                type={option.type}
                                className="add-panel-row-preview"
                                height={160}
                            />
                        </button>
                    );
                }) : (
                    <div className="add-panel-empty">No panel type</div>
                )}
            </div>
            <button className="add-panel-close" type="button" aria-label="Close add panel" onClick={onClose}>
                <X size={14}/>
            </button>
        </div>
    );
});

function shortcutForIndex(index: number) {
    return index >= 0 && index < 9 ? String(index + 1) : null;
}

function optionIdForType(type: string) {
    return `add-panel-option-${type}`;
}
