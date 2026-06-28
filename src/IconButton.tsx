export type IconButtonProps = {
    label: string; disabled?: boolean; pressed?: boolean; onClick: () => void; children: React.ReactNode;
};

export function IconButton({
                               label,
                               disabled = false,
                               pressed,
                               onClick,
                               children
                           }: IconButtonProps) {
    return (<button
        className="icon-button"
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        title={label}
        disabled={disabled}
        onClick={onClick}
    >
        {children}
    </button>);
}
