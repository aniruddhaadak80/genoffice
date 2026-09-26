import { useRef, useState } from 'react'
import type { InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'

/** One named palette entry; `name` is the English color name (tooltip fallback). */
export interface ColorSwatch {
  name: string
  hex: string
}

/** Office theme colors (top row of the Word-style picker). */
export const THEME_COLORS: readonly ColorSwatch[] = [
  { name: 'White', hex: 'FFFFFF' },
  { name: 'Black', hex: '000000' },
  { name: 'Light Gray', hex: 'E7E6E6' },
  { name: 'Blue Gray', hex: '0E2841' },
  { name: 'Blue', hex: '156082' },
  { name: 'Orange', hex: 'E97132' },
  { name: 'Green', hex: '196B24' },
  { name: 'Sky Blue', hex: '0F9ED5' },
  { name: 'Purple', hex: 'A02B93' },
  { name: 'Light Green', hex: '4EA72E' },
]

/** 5 tint/shade rows under the theme colors, one column per theme color. */
export const THEME_COLOR_SHADES: readonly (readonly string[])[] = [
  [
    'F2F2F2',
    '7F7F7F',
    'D0CECE',
    'DDEBF7',
    'DDEBF7',
    'FCE4D6',
    'E2F0D9',
    'DDEBF7',
    'E4DFEC',
    'E2F0D9',
  ],
  [
    'D9D9D9',
    '595959',
    'AEAAAA',
    'BDD7EE',
    '9DC3E6',
    'F8CBAD',
    'C6E0B4',
    '9DC3E6',
    'D9E1F2',
    'C6E0B4',
  ],
  [
    'BFBFBF',
    '3F3F3F',
    '757171',
    '8EA9DB',
    '5B9BD5',
    'F4B084',
    'A9D18E',
    '5B9BD5',
    'B4C6E7',
    'A9D18E',
  ],
  [
    'A6A6A6',
    '262626',
    '3A3838',
    '4472C4',
    '2E75B6',
    'C65911',
    '70AD47',
    '00B0F0',
    '8064A2',
    '70AD47',
  ],
  [
    '808080',
    '0D0D0D',
    '171616',
    '203864',
    '1F4E78',
    '843C0C',
    '375623',
    '0070C0',
    '5B315E',
    '385723',
  ],
]

/** Word standard colors (bottom row). */
export const STANDARD_COLORS: readonly ColorSwatch[] = [
  { name: 'Dark Red', hex: 'C00000' },
  { name: 'Red', hex: 'FF0000' },
  { name: 'Orange', hex: 'FFC000' },
  { name: 'Yellow', hex: 'FFFF00' },
  { name: 'Light Green', hex: '92D050' },
  { name: 'Green', hex: '00B050' },
  { name: 'Light Blue', hex: '00B0F0' },
  { name: 'Blue', hex: '0070C0' },
  { name: 'Dark Blue', hex: '002060' },
  { name: 'Purple', hex: '7030A0' },
]

export interface ColorPickerStrings {
  themeColors: string
  standardColors: string
  /** Section title over the recentColors row (required to show that section). */
  recentColors?: string | undefined
  /** Omit to hide the "More Colors…" native-picker row. */
  moreColors?: string | undefined
  /** Label of the full-width top button ("Automatic" / "No Fill"…); omit to hide it. */
  auto?: string | undefined
  /** Tooltip for a theme shade cell (1-based row/column); defaults to the hex value. */
  shadeTip?: ((row: number, column: number) => string) | undefined
  /** Tooltip for a named swatch; defaults to the English name. */
  colorName?: ((swatch: ColorSwatch) => string) | undefined
}

export interface ColorPickerProps {
  /** Current color as #RRGGBB (any case, # optional); null/undefined = automatic/none. */
  value?: string | null | undefined
  strings: ColorPickerStrings
  /** Extra classes on the panel root (typically the app's popover positioning class). */
  className?: string | undefined
  /** Recently used colors (#RRGGBB), most recent first; shown when strings.recentColors is set. */
  recentColors?: readonly string[] | undefined
  /** Named/shade/custom pick emits "#RRGGBB" (uppercase); the auto button emits null. */
  onPick: (hex: string | null) => void
  /** Merged onto the hidden native input; lets callers override onChange (debounce,
      selection restore) or hook onPointerDown (e.g. arming the input). */
  moreInputProps?: InputHTMLAttributes<HTMLInputElement> | undefined
}

const normalizeHex = (hex: string): string => `#${hex.replace(/^#/, '').toUpperCase()}`

export const COLOR_GRID_COLUMNS = 10

export function colorGridStep(
  key: string,
  index: number,
  count: number,
  columns: number = COLOR_GRID_COLUMNS,
): number | null {
  if (index < 0 || count <= 0 || columns <= 0) return null
  const row = Math.floor(index / columns)
  const col = index % columns
  const lastRow = Math.floor((count - 1) / columns)
  switch (key) {
    case 'ArrowRight':
      return col + 1 < columns && index + 1 < count ? index + 1 : null
    case 'ArrowLeft':
      return col > 0 ? index - 1 : null
    case 'ArrowDown':
      return row < lastRow ? index + columns : null
    case 'ArrowUp':
      return row > 0 ? index - columns : null
    case 'Home':
      return col === 0 ? null : row * columns
    case 'End': {
      const end = Math.min(row * columns + columns, count) - 1
      return end === index ? null : end
    }
    default:
      return null
  }
}

export function rovingTabIndex(
  active: number | null,
  index: number,
  selectedIndex: number,
): 0 | -1 {
  const stop = active ?? (selectedIndex >= 0 ? selectedIndex : 0)
  return stop === index ? 0 : -1
}

interface SwatchCell {
  hex: string
  title: string
  key: string
}

interface SwatchGroup {
  active: number | null
  refs: React.MutableRefObject<(HTMLButtonElement | null)[]>
  selected: number
}

/** The shared Word-style color picker panel: Automatic/None, theme colors with
    tint/shade grid, standard colors and a "More Colors…" native picker entry.
    Callers own the dropdown open state and anchor positioning (via className). */
export function ColorPicker({
  value,
  strings,
  className,
  recentColors,
  onPick,
  moreInputProps,
}: ColorPickerProps): ReactElement {
  const current = value ? normalizeHex(value) : null
  const isSelected = (hex: string): boolean => current === `#${hex}`

  const themeCells: SwatchCell[] = [
    ...THEME_COLORS.map((c) => ({
      hex: c.hex,
      title: strings.colorName?.(c) ?? c.name,
      key: c.hex,
    })),
    ...THEME_COLOR_SHADES.flatMap((row, r) =>
      row.map((hex, c) => ({
        hex,
        title: strings.shadeTip?.(r + 1, c + 1) ?? `#${hex}`,
        key: `${r}-${c}-${hex}`,
      })),
    ),
  ]
  const standardCells: SwatchCell[] = STANDARD_COLORS.map((c) => ({
    hex: c.hex,
    title: strings.colorName?.(c) ?? c.name,
    key: c.hex,
  }))
  const recentCells: SwatchCell[] = (recentColors ?? []).map((hex, i) => {
    const bare = hex.replace(/^#/, '').toUpperCase()
    return { hex: bare, title: `#${bare}`, key: `recent-${i}-${bare}` }
  })
  const showRecent = Boolean(strings.recentColors) && recentCells.length > 0

  const [themeActive, setThemeActive] = useState<number | null>(null)
  const [standardActive, setStandardActive] = useState<number | null>(null)
  const [recentActive, setRecentActive] = useState<number | null>(null)
  const themeRefs = useRef<(HTMLButtonElement | null)[]>([])
  const standardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const recentRefs = useRef<(HTMLButtonElement | null)[]>([])

  const swatch = (cell: SwatchCell, index: number, group: SwatchGroup): ReactElement => (
    <button
      key={cell.key}
      ref={(el) => {
        group.refs.current[index] = el
      }}
      type="button"
      role="option"
      aria-selected={isSelected(cell.hex)}
      tabIndex={rovingTabIndex(group.active, index, group.selected)}
      className={`gcp-swatch ${isSelected(cell.hex) ? 'selected' : ''}`}
      title={cell.title}
      style={{ background: `#${cell.hex}` }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(`#${cell.hex}`)}
    />
  )

  const themeGroup: SwatchGroup = {
    active: themeActive,
    refs: themeRefs,
    selected: themeCells.findIndex((c) => isSelected(c.hex)),
  }
  const standardGroup: SwatchGroup = {
    active: standardActive,
    refs: standardRefs,
    selected: standardCells.findIndex((c) => isSelected(c.hex)),
  }
  const recentGroup: SwatchGroup = {
    active: recentActive,
    refs: recentRefs,
    selected: recentCells.findIndex((c) => isSelected(c.hex)),
  }

  const onGridKeyDown =
    (
      refs: React.MutableRefObject<(HTMLButtonElement | null)[]>,
      setActive: (index: number) => void,
    ) =>
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      const pressed = (e.target as Element | null)?.closest('button') ?? null
      const from = refs.current.indexOf(pressed as HTMLButtonElement)
      const next = colorGridStep(e.key, from, refs.current.length)
      if (next === null) return
      e.preventDefault()
      e.stopPropagation()
      setActive(next)
      refs.current[next]?.focus()
    }

  return (
    <div className={`gcp-palette${className ? ` ${className}` : ''}`}>
      {strings.auto && (
        <button
          type="button"
          className={`gcp-auto ${!current ? 'selected' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(null)}
        >
          {strings.auto}
        </button>
      )}
      <div className="gcp-section-title">{strings.themeColors}</div>
      <div
        className="gcp-theme"
        role="listbox"
        aria-label={strings.themeColors}
        onKeyDown={onGridKeyDown(themeRefs, setThemeActive)}
      >
        <div className="gcp-theme-base">
          {themeCells.slice(0, THEME_COLORS.length).map((cell, i) => swatch(cell, i, themeGroup))}
        </div>
        <div className="gcp-theme-shades">
          {themeCells
            .slice(THEME_COLORS.length)
            .map((cell, i) => swatch(cell, THEME_COLORS.length + i, themeGroup))}
        </div>
      </div>
      <div className="gcp-section-title">{strings.standardColors}</div>
      <div
        className="gcp-standard-row"
        role="listbox"
        aria-label={strings.standardColors}
        onKeyDown={onGridKeyDown(standardRefs, setStandardActive)}
      >
        {standardCells.map((cell, i) => swatch(cell, i, standardGroup))}
      </div>
      {showRecent && (
        <>
          <div className="gcp-section-title">{strings.recentColors}</div>
          <div
            className="gcp-standard-row"
            role="listbox"
            aria-label={strings.recentColors}
            onKeyDown={onGridKeyDown(recentRefs, setRecentActive)}
          >
            {recentCells.map((cell, i) => swatch(cell, i, recentGroup))}
          </div>
        </>
      )}
      {strings.moreColors && (
        <label className="gcp-more">
          <span className="gcp-more-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              aria-hidden="true"
            >
              <path d="M8 12.98a4.98 4.98 0 1 1 4.98-4.98c0 2.44-1.74 2.49-2.74 2.49-.8 0-1.25.5-1.25 1.25 0 .7-.45 1.25-1 1.25Z" />
              <circle cx="8.83" cy="4.93" r="0.71" fill="currentColor" stroke="none" />
              <circle cx="11.07" cy="6.71" r="0.71" fill="currentColor" stroke="none" />
              <circle cx="6.09" cy="5.51" r="0.71" fill="currentColor" stroke="none" />
              <circle cx="4.93" cy="8.25" r="0.71" fill="currentColor" stroke="none" />
            </svg>
          </span>
          {strings.moreColors}
          <input
            type="color"
            value={(current ?? '#4472C4').toLowerCase()}
            onChange={(e) => onPick(normalizeHex(e.currentTarget.value))}
            {...moreInputProps}
          />
        </label>
      )}
    </div>
  )
}
