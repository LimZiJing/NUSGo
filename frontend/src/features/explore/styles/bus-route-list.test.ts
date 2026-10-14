import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))
const exploreStyles = readFileSync(resolve(stylesDirectory, 'explore-content.css'), 'utf8')
const routeListStyles = readFileSync(resolve(stylesDirectory, 'bus-route-list.css'), 'utf8')
const stopsStyles = readFileSync(resolve(stylesDirectory, '../../stops/styles/stops-content.css'), 'utf8')

describe('route browser visual contracts', () => {
  it('keeps feature button defaults from overriding shared route chips', () => {
    // The Stops screen no longer restyles buttons by element type, so it cannot override route chips.
    expect(stopsStyles).not.toMatch(/\.stops-content button\b/)
    expect(exploreStyles).not.toMatch(/\.explore-content button/)
    expect(exploreStyles).not.toMatch(/\.explore-mode-selector button/)
    expect(routeListStyles).not.toMatch(/(^|[\s,>+~])button/m)
  })

  it('keeps route browser stop geometry specific to its button host', () => {
    expect(routeListStyles).toMatch(/\.explore-content \.explore-bus-route-list-stop\s*{[^}]*padding:\s*8px 14px 8px 20px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s)
    expect(routeListStyles).toMatch(/\.explore-bus-route-list-stop-list::before\s*{[^}]*left:\s*25px;[^}]*width:\s*3px;/s)
  })

  it('keeps the mobile explore header compact above its content', () => {
    expect(exploreStyles).toMatch(/\.explore-content-bus-routes \.explore-content-header\s*{[^}]*flex:\s*0 0 auto;/s)
    expect(exploreStyles).toMatch(/\.explore-content-bus-routes \.explore-content-panel\s*{[^}]*display:\s*flex;[^}]*flex:\s*1 1 0;/s)
  })

  it('bounds the desktop bus stop list inside the navigation panel', () => {
    expect(exploreStyles).toMatch(/\.navigation-column \.explore-content\.explore-content-bus-routes\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s)
    expect(exploreStyles).toMatch(/\.navigation-column \.explore-content-bus-routes \.explore-content-panel\s*{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s)
    expect(routeListStyles).toMatch(/\.navigation-column \.explore-content-bus-routes \.explore-bus-route-list-timeline\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;/s)
    expect(routeListStyles).toMatch(/\.navigation-column \.explore-content-bus-routes \.explore-bus-route-list-scroll\s*{[^}]*flex:\s*1 1 0;[^}]*min-height:\s*0;/s)
  })
})
