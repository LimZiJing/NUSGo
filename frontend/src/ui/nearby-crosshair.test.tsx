import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NearbyCrosshair } from './nearby-crosshair'

describe('NearbyCrosshair', () => {
  it('renders as decorative markup hidden from assistive tech', () => {
    const markup = renderToStaticMarkup(
      <NearbyCrosshair insets={{ top: 0, right: 0, bottom: 0, left: 0 }} />,
    )

    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('class="nearby-crosshair-area"')
    expect(markup).toContain('class="nearby-crosshair"')
  })

  it('does not expose pointer or focus targets', () => {
    const markup = renderToStaticMarkup(
      <NearbyCrosshair insets={{ top: 0, right: 0, bottom: 0, left: 0 }} />,
    )

    expect(markup).not.toMatch(/tabindex|role=|<button|<a /)
  })

  it('passes the usable-area insets through as CSS custom properties', () => {
    const markup = renderToStaticMarkup(
      <NearbyCrosshair insets={{ top: 10, right: 20, bottom: 30, left: 40 }} />,
    )

    expect(markup).toContain('--nearby-crosshair-top:10px')
    expect(markup).toContain('--nearby-crosshair-right:20px')
    expect(markup).toContain('--nearby-crosshair-bottom:30px')
    expect(markup).toContain('--nearby-crosshair-left:40px')
  })
})
