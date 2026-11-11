import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(resolve(stylesDirectory, 'stops-content.css'), 'utf8')

const desktopBlock = styles.slice(styles.indexOf('@media (min-width: 769px)'))
const mobileBlock = styles.slice(styles.indexOf('@media (max-width: 640px)'), styles.indexOf('@media (min-width: 769px)'))
const rule = (block: string, selector: string) => {
  const match = block.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*{([^}]*)}`, 's'))
  return match?.[1] ?? ''
}

describe('desktop Stops scroll ownership', () => {
  // The wheel scrolled the inner card list instead of the panel whenever the pointer sat
  // over a card, and did nothing over the panel gutter (#252). The desktop pane must have
  // one scroll owner: the navigation panel itself.
  it('lets the desktop panel scroll the stop list instead of clipping it', () => {
    const content = rule(desktopBlock, '.navigation-column .stops-content')
    expect(content).toMatch(/height:\s*auto;/)
    expect(content).toMatch(/min-height:\s*100%;/)
    expect(content).toMatch(/overflow:\s*visible;/)
  })

  it('keeps the card list out of the scroll-container role on desktop', () => {
    const cardList = rule(desktopBlock, '.navigation-column .stops-content .stops-card-list')
    expect(cardList).toMatch(/flex:\s*0 0 auto;/)
    expect(rule(desktopBlock, '.navigation-column .stops-content .navigation-panel-scroll-content'))
      .toMatch(/overflow:\s*visible;/)
    expect(rule(desktopBlock, '.navigation-column .stops-content .navigation-panel-scroll-content'))
      .toMatch(/overscroll-behavior:\s*auto;/)
  })

  // The details pane and the Favourites empty state carry the same shared
  // scroll-container class as the card list. Scoping the rule to the card list alone left
  // a zero-range `overscroll-behavior: contain` box over the stop details that ate the
  // wheel, so the rule must cover every descendant of the desktop pane.
  it('covers the stop details pane and the empty state, not just the card list', () => {
    const shared = rule(desktopBlock, '.navigation-column .stops-content .navigation-panel-scroll-content')
    expect(shared).toMatch(/overflow:\s*visible;/)
    expect(desktopBlock).not.toMatch(/\.navigation-column \.stops-card-list\s*{/)
  })

  it('keeps the Nearby and Favourites switch reachable while the panel scrolls', () => {
    const selector = rule(desktopBlock, '.navigation-column .stops-list-selector-region')
    expect(selector).toMatch(/position:\s*sticky;/)
    expect(selector).toMatch(/background:\s*var\(--surface-raised\);/)
  })

  it('leaves the mobile sheet scrolling and its selector outside the scroll area', () => {
    expect(rule(mobileBlock, '.stops-content .navigation-panel-content')).toMatch(/overflow-y:\s*auto;/)
    expect(rule(mobileBlock, ".stops-content .navigation-panel-content[data-content-state='stop-list']"))
      .toMatch(/overflow:\s*hidden;/)
    expect(mobileBlock).not.toMatch(/\.stops-list-selector-region/)
  })
})

describe('stop row styles', () => {
  it('keeps stop rows on their main-branch surface', () => {
    expect(styles).toMatch(/\.button\.stop-card-toggle\s*{[^}]*border:\s*0;[^}]*color:\s*var\(--text-strong\);[^}]*background:\s*transparent;/s)
    expect(styles).not.toContain(".button.stop-card-toggle[aria-expanded='true'] {")
  })
})
