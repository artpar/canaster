import {
  DEFAULT_TEXT_STYLE,
  TEXT_STYLE_ALIGNMENTS,
  TEXT_STYLE_BORDER_STYLES,
  TEXT_STYLE_DECORATIONS,
  TEXT_STYLE_FONT_STYLES,
  TEXT_STYLE_PRESETS,
  TEXT_STYLE_TRANSFORMS,
  TEXT_STYLE_VERTICAL_ALIGNMENTS,
  normalizeTextStyle,
  type TextStyle,
  type TextStylePreset,
} from '../../domain/textStyle';

export type TextStylePanelController = {
  element: HTMLElement;
  readValue(): TextStyle;
  setValue(nextStyle: TextStyle): void;
  focus(): void;
  dispose(): void;
};

type TextStylePanelConfig = {
  value: TextStyle;
  presetStyles?: Partial<Record<TextStylePreset, TextStyle>>;
  onChange?: (nextStyle: TextStyle) => void;
};

type ControlMap = {
  preset: HTMLSelectElement;
  fontFamily: HTMLSelectElement;
  fontSize: HTMLInputElement;
  fontWeight: HTMLSelectElement;
  fontStyle: HTMLSelectElement;
  textDecoration: HTMLSelectElement;
  color: HTMLInputElement;
  backgroundEnabled: HTMLInputElement;
  backgroundColor: HTMLInputElement;
  align: HTMLSelectElement;
  verticalAlign: HTMLSelectElement;
  lineHeight: HTMLInputElement;
  letterSpacing: HTMLInputElement;
  paddingTop: HTMLInputElement;
  paddingRight: HTMLInputElement;
  paddingBottom: HTMLInputElement;
  paddingLeft: HTMLInputElement;
  borderStyle: HTMLSelectElement;
  borderWidth: HTMLInputElement;
  borderColor: HTMLInputElement;
  borderRadius: HTMLInputElement;
  opacity: HTMLInputElement;
  textTransform: HTMLSelectElement;
};

const FONT_OPTIONS = [
  { value: 'system-ui, sans-serif', label: 'System' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { value: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', label: 'Mono' },
] as const;

const FONT_WEIGHT_OPTIONS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Heavy' },
] as const;

const PRESET_LABELS: Record<TextStylePreset, string> = {
  body: 'Body',
  heading: 'Heading',
  label: 'Label',
  caption: 'Caption',
  custom: 'Custom',
};

export function createTextStylePanel({ value, presetStyles = {}, onChange }: TextStylePanelConfig): TextStylePanelController {
  const root = document.createElement('div');
  root.className = 'text-style-panel';

  const controls = createControls(normalizeTextStyle(value));
  root.append(
    createSection('Preset', createGrid([
      field('Style', controls.preset),
    ])),
    createSection('Font', createGrid([
      field('Family', controls.fontFamily),
      field('Size', controls.fontSize),
      field('Weight', controls.fontWeight),
      field('Face', controls.fontStyle),
      field('Line', controls.lineHeight),
      field('Track', controls.letterSpacing),
    ])),
    createSection('Color', createGrid([
      field('Text', controls.color),
      checkboxField('Fill', controls.backgroundEnabled),
      field('Fill color', controls.backgroundColor),
      field('Opacity', controls.opacity),
    ])),
    createSection('Layout', createGrid([
      field('Align', controls.align),
      field('Vertical', controls.verticalAlign),
      field('Case', controls.textTransform),
      field('Mark', controls.textDecoration),
    ])),
    createSection('Padding', createGrid([
      field('Top', controls.paddingTop),
      field('Right', controls.paddingRight),
      field('Bottom', controls.paddingBottom),
      field('Left', controls.paddingLeft),
    ])),
    createSection('Border', createGrid([
      field('Style', controls.borderStyle),
      field('Width', controls.borderWidth),
      field('Color', controls.borderColor),
      field('Radius', controls.borderRadius),
    ])),
  );

  const emitChange = () => onChange?.(readControls(controls));
  for (const control of Object.values(controls)) control.addEventListener('input', emitChange);
  for (const control of Object.values(controls)) control.addEventListener('change', emitChange);

  controls.preset.addEventListener('change', () => {
    const preset = controls.preset.value as TextStylePreset;
    const presetStyle = presetStyles[preset];
    if (!presetStyle || preset === 'custom') return;
    writeControls(controls, { ...presetStyle, preset });
    emitChange();
  });

  controls.backgroundEnabled.addEventListener('change', () => {
    controls.backgroundColor.disabled = !controls.backgroundEnabled.checked;
  });

  return {
    element: root,
    readValue() {
      return readControls(controls);
    },
    setValue(nextStyle) {
      writeControls(controls, normalizeTextStyle(nextStyle));
    },
    focus() {
      controls.preset.focus({ preventScroll: true });
    },
    dispose() {},
  };
}

function createControls(style: TextStyle): ControlMap {
  const controls: ControlMap = {
    preset: selectControl(TEXT_STYLE_PRESETS.map((preset) => ({ value: preset, label: PRESET_LABELS[preset] })), style.preset),
    fontFamily: selectControl(FONT_OPTIONS, style.fontFamily),
    fontSize: numberControl(style.fontSize, 8, 96, 1),
    fontWeight: selectControl(FONT_WEIGHT_OPTIONS, String(style.fontWeight)),
    fontStyle: selectControl(TEXT_STYLE_FONT_STYLES.map(optionLabel), style.fontStyle),
    textDecoration: selectControl(TEXT_STYLE_DECORATIONS.map(optionLabel), style.textDecoration),
    color: colorControl(style.color, DEFAULT_TEXT_STYLE.color),
    backgroundEnabled: checkboxControl(style.backgroundColor !== 'transparent'),
    backgroundColor: colorControl(style.backgroundColor, '#ffffff'),
    align: selectControl(TEXT_STYLE_ALIGNMENTS.map(optionLabel), style.align),
    verticalAlign: selectControl(TEXT_STYLE_VERTICAL_ALIGNMENTS.map(optionLabel), style.verticalAlign),
    lineHeight: numberControl(style.lineHeight, 8, 140, 1),
    letterSpacing: numberControl(style.letterSpacing, -4, 16, 0.25),
    paddingTop: numberControl(style.padding.top, 0, 96, 1),
    paddingRight: numberControl(style.padding.right, 0, 96, 1),
    paddingBottom: numberControl(style.padding.bottom, 0, 96, 1),
    paddingLeft: numberControl(style.padding.left, 0, 96, 1),
    borderStyle: selectControl(TEXT_STYLE_BORDER_STYLES.map(optionLabel), style.border.style),
    borderWidth: numberControl(style.border.width, 0, 24, 1),
    borderColor: colorControl(style.border.color, DEFAULT_TEXT_STYLE.border.color),
    borderRadius: numberControl(style.border.radius, 0, 48, 1),
    opacity: numberControl(style.opacity, 0, 1, 0.05),
    textTransform: selectControl(TEXT_STYLE_TRANSFORMS.map(optionLabel), style.textTransform),
  };
  controls.backgroundColor.disabled = !controls.backgroundEnabled.checked;
  return controls;
}

function readControls(controls: ControlMap): TextStyle {
  return normalizeTextStyle({
    preset: controls.preset.value,
    fontFamily: controls.fontFamily.value,
    fontSize: controls.fontSize.valueAsNumber,
    fontWeight: Number.parseInt(controls.fontWeight.value, 10),
    fontStyle: controls.fontStyle.value,
    textDecoration: controls.textDecoration.value,
    color: controls.color.value,
    backgroundColor: controls.backgroundEnabled.checked ? controls.backgroundColor.value : 'transparent',
    align: controls.align.value,
    verticalAlign: controls.verticalAlign.value,
    lineHeight: controls.lineHeight.valueAsNumber,
    letterSpacing: controls.letterSpacing.valueAsNumber,
    padding: {
      top: controls.paddingTop.valueAsNumber,
      right: controls.paddingRight.valueAsNumber,
      bottom: controls.paddingBottom.valueAsNumber,
      left: controls.paddingLeft.valueAsNumber,
    },
    border: {
      style: controls.borderStyle.value,
      width: controls.borderWidth.valueAsNumber,
      color: controls.borderColor.value,
      radius: controls.borderRadius.valueAsNumber,
    },
    opacity: controls.opacity.valueAsNumber,
    textTransform: controls.textTransform.value,
  });
}

function writeControls(controls: ControlMap, nextStyle: TextStyle): void {
  const style = normalizeTextStyle(nextStyle);
  controls.preset.value = style.preset;
  controls.fontFamily.value = style.fontFamily;
  controls.fontSize.value = String(style.fontSize);
  controls.fontWeight.value = String(style.fontWeight);
  controls.fontStyle.value = style.fontStyle;
  controls.textDecoration.value = style.textDecoration;
  controls.color.value = colorInputValue(style.color, DEFAULT_TEXT_STYLE.color);
  controls.backgroundEnabled.checked = style.backgroundColor !== 'transparent';
  controls.backgroundColor.value = colorInputValue(style.backgroundColor, '#ffffff');
  controls.backgroundColor.disabled = !controls.backgroundEnabled.checked;
  controls.align.value = style.align;
  controls.verticalAlign.value = style.verticalAlign;
  controls.lineHeight.value = String(style.lineHeight);
  controls.letterSpacing.value = String(style.letterSpacing);
  controls.paddingTop.value = String(style.padding.top);
  controls.paddingRight.value = String(style.padding.right);
  controls.paddingBottom.value = String(style.padding.bottom);
  controls.paddingLeft.value = String(style.padding.left);
  controls.borderStyle.value = style.border.style;
  controls.borderWidth.value = String(style.border.width);
  controls.borderColor.value = colorInputValue(style.border.color, DEFAULT_TEXT_STYLE.border.color);
  controls.borderRadius.value = String(style.border.radius);
  controls.opacity.value = String(style.opacity);
  controls.textTransform.value = style.textTransform;
}

function createSection(title: string, content: HTMLElement) {
  const section = document.createElement('fieldset');
  section.className = 'text-style-panel-section';
  const legend = document.createElement('legend');
  legend.textContent = title;
  section.append(legend, content);
  return section;
}

function createGrid(children: HTMLElement[]) {
  const grid = document.createElement('div');
  grid.className = 'text-style-panel-grid';
  grid.append(...children);
  return grid;
}

function field(label: string, control: HTMLInputElement | HTMLSelectElement) {
  const wrapper = document.createElement('label');
  wrapper.className = 'text-style-panel-field';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function checkboxField(label: string, control: HTMLInputElement) {
  const wrapper = document.createElement('label');
  wrapper.className = 'text-style-panel-field text-style-panel-checkbox';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(control, text);
  return wrapper;
}

function selectControl(options: readonly { value: string; label: string }[], value: string) {
  const select = document.createElement('select');
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  }
  select.value = value;
  if (select.value !== value && options[0]) select.value = options[0].value;
  return select;
}

function numberControl(value: number, min: number, max: number, step: number) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  return input;
}

function colorControl(value: string, fallback: string) {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = colorInputValue(value, fallback);
  return input;
}

function checkboxControl(checked: boolean) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  return input;
}

function optionLabel<T extends string>(value: T) {
  return {
    value,
    label: value.replace(/-/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()),
  };
}

function colorInputValue(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
