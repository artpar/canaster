export type CanvasInputControllerHandlers = {
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  onPointerCancel(event: PointerEvent): void;
  onLostPointerCapture(event: PointerEvent): void;
  onKeyDown(event: KeyboardEvent): void;
  onPaste(event: ClipboardEvent): void;
  onFocus(event: FocusEvent): void;
  onBlur(event: FocusEvent): void;
  onWindowBlur(event: FocusEvent): void;
  onWheel(event: WheelEvent): void;
  onDoubleClick(event: MouseEvent): void;
  onContextMenu(event: MouseEvent): void;
};

export class CanvasInputController {
  private attached = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: CanvasInputControllerHandlers,
  ) {}

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.attach();
      return;
    }
    this.detach();
  }

  attach(): void {
    if (this.attached) return;
    this.canvas.addEventListener('pointerdown', this.handlers.onPointerDown);
    this.canvas.addEventListener('pointercancel', this.handlers.onPointerCancel);
    this.canvas.addEventListener('lostpointercapture', this.handlers.onLostPointerCapture);
    this.canvas.addEventListener('keydown', this.handlers.onKeyDown);
    this.canvas.addEventListener('paste', this.handlers.onPaste);
    this.canvas.addEventListener('focus', this.handlers.onFocus);
    this.canvas.addEventListener('blur', this.handlers.onBlur);
    window.addEventListener('pointermove', this.handlers.onPointerMove);
    window.addEventListener('pointerup', this.handlers.onPointerUp);
    window.addEventListener('blur', this.handlers.onWindowBlur);
    this.canvas.addEventListener('wheel', this.handlers.onWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.handlers.onDoubleClick);
    this.canvas.addEventListener('contextmenu', this.handlers.onContextMenu);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    this.canvas.removeEventListener('pointerdown', this.handlers.onPointerDown);
    this.canvas.removeEventListener('pointercancel', this.handlers.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.handlers.onLostPointerCapture);
    this.canvas.removeEventListener('keydown', this.handlers.onKeyDown);
    this.canvas.removeEventListener('paste', this.handlers.onPaste);
    this.canvas.removeEventListener('focus', this.handlers.onFocus);
    this.canvas.removeEventListener('blur', this.handlers.onBlur);
    window.removeEventListener('pointermove', this.handlers.onPointerMove);
    window.removeEventListener('pointerup', this.handlers.onPointerUp);
    window.removeEventListener('blur', this.handlers.onWindowBlur);
    this.canvas.removeEventListener('wheel', this.handlers.onWheel);
    this.canvas.removeEventListener('dblclick', this.handlers.onDoubleClick);
    this.canvas.removeEventListener('contextmenu', this.handlers.onContextMenu);
    this.attached = false;
  }
}
