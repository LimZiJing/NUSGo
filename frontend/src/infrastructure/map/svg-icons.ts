const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

interface SvgIconNode {
  readonly tag: 'circle' | 'line' | 'path' | 'polygon'
  readonly attributes: Readonly<Record<string, string>>
}

const iconNodes = {
  'circle-dot': [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '1' } },
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
  ],
  armchair: [
    { tag: 'path', attributes: { d: 'M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3' } },
    { tag: 'path', attributes: { d: 'M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z' } },
    { tag: 'path', attributes: { d: 'M5 18v2' } },
    { tag: 'path', attributes: { d: 'M19 18v2' } },
  ],
  coffee: [
    { tag: 'path', attributes: { d: 'M10 2v2' } },
    { tag: 'path', attributes: { d: 'M14 2v2' } },
    { tag: 'path', attributes: { d: 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1' } },
    { tag: 'path', attributes: { d: 'M6 2v2' } },
  ],
  'tree-pine': [
    { tag: 'path', attributes: { d: 'm17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z' } },
    { tag: 'path', attributes: { d: 'M12 22v-3' } },
  ],
  star: [
    { tag: 'path', attributes: { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' } },
  ],
  navigation: [
    { tag: 'polygon', attributes: { points: '3 11 22 2 13 21 11 13 3 11' } },
  ],
  crosshair: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } },
    { tag: 'line', attributes: { x1: '22', x2: '18', y1: '12', y2: '12' } },
    { tag: 'line', attributes: { x1: '6', x2: '2', y1: '12', y2: '12' } },
    { tag: 'line', attributes: { x1: '12', x2: '12', y1: '6', y2: '2' } },
    { tag: 'line', attributes: { x1: '12', x2: '12', y1: '22', y2: '18' } },
  ],
  'map-pin': [
    { tag: 'path', attributes: { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' } },
    { tag: 'circle', attributes: { cx: '12', cy: '10', r: '3' } },
  ],
} satisfies Record<string, readonly SvgIconNode[]>

export type MapSvgIconName = keyof typeof iconNodes

export interface MapSvgIconOptions {
  readonly className?: string
  readonly size?: number
  readonly strokeWidth?: number
}

// MapLibre owns these elements; this focused Lucide subset avoids server-rendering React to DOM.
export function createMapSvgIcon(
  name: MapSvgIconName,
  { className, size = 24, strokeWidth = name === 'star' ? 1.7 : 2 }: MapSvgIconOptions = {},
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', String(strokeWidth))
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', [
    'lucide',
    `lucide-${name}`,
    className,
  ].filter(Boolean).join(' '))

  for (const { tag, attributes } of iconNodes[name]) {
    const node = document.createElementNS(SVG_NAMESPACE, tag)
    for (const [attribute, value] of Object.entries(attributes)) {
      node.setAttribute(attribute, value)
    }
    svg.append(node)
  }

  return svg
}
