import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const exploreStyles = readFileSync(resolve(stylesDirectory, 'explore-view.css'), 'utf8')
const routeBrowserStyles = readFileSync(resolve(stylesDirectory, 'route-browser.css'), 'utf8')
const stopsStyles = readFileSync(resolve(stylesDirectory, '../../stops-view/styles/stops-view.css'), 'utf8')

describe('route browser visual contracts', () => {
  it('keeps feature button defaults from overriding shared route chips', () => {
    expect(stopsStyles).toMatch(/\.stops-view button:not\(\.route-chip\)\s*{/s)
    expect(exploreStyles).toMatch(/\.explore-view button:not\(\.route-chip\):not\(\.explore-route-browser-stop\)\s*{[^}]*padding:\s*5px 8px;/s)
  })

  it('keeps route browser stop geometry specific to its button host', () => {
    expect(routeBrowserStyles).toMatch(/\.explore-view \.explore-route-browser-stop\s*{[^}]*padding:\s*8px 14px 8px 20px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s)
    expect(routeBrowserStyles).toMatch(/\.explore-route-browser-stop-list::before\s*{[^}]*left:\s*25px;[^}]*width:\s*3px;/s)
  })

  it('keeps the mobile explore header compact above its content', () => {
    expect(exploreStyles).toMatch(/\.explore-view-shuttle \.explore-view-header\s*{[^}]*flex:\s*0 0 auto;/s)
    expect(exploreStyles).toMatch(/\.explore-view-shuttle \.explore-view-content\s*{[^}]*display:\s*flex;[^}]*flex:\s*1 1 0;/s)
  })
})
