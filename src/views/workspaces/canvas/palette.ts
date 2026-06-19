// Shared swatch palette for the pen color, node coloring, and canvas
// background pickers — keeps all three popovers visually consistent.

export interface PaletteColor {
  label: string
  value: string
}

export const CANVAS_PALETTE: PaletteColor[] = [
  { label: 'Violet', value: '#7c6af7' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Amber', value: '#facc15' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Teal', value: '#06b6d4' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Slate', value: '#64748b' },
]
