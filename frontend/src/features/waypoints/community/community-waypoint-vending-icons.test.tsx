import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ComponentType } from 'react'
import {
  COMMUNITY_WAYPOINT_VENDING_ITEMS,
  COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS,
} from '@nusgo/shared/waypoints/community'
import type { IconProps } from '../../../ui/icons'
import { COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS } from './community-waypoint-vending-item-icons'
import { COMMUNITY_WAYPOINT_VENDING_PREP_ICONS } from './community-waypoint-vending-prep-icons'

/* Two options that look identical are worse than options with no icon at all: the
   reader cannot tell them apart without reading both labels, which the icon was
   supposed to save them from. This caught "Supplies" and "Pre-packaged" both
   rendering a parcel. Comparing markup rather than the component reference also
   catches two different wrappers around the same lucide glyph. */
function glyphSignature(Icon: ComponentType<IconProps>): string {
  return renderToStaticMarkup(<Icon />)
}

describe('vending option icons', () => {
  const allOptions = [
    ...COMMUNITY_WAYPOINT_VENDING_ITEMS.map(({ value, label }) => ({
      group: 'Items',
      label,
      Icon: COMMUNITY_WAYPOINT_VENDING_ITEM_ICONS[value],
    })),
    ...COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS.map(({ value, label }) => ({
      group: 'Prep',
      label,
      Icon: COMMUNITY_WAYPOINT_VENDING_PREP_ICONS[value],
    })),
  ]

  it('gives every option in the vending panel a distinct glyph', () => {
    const seen = new Map<string, string>()

    for (const { group, label, Icon } of allOptions) {
      const signature = glyphSignature(Icon)
      const previous = seen.get(signature)
      expect(
        previous,
        `${group} "${label}" renders the same icon as ${previous ?? ''}`,
      ).toBeUndefined()
      seen.set(signature, `${group} "${label}"`)
    }
  })

  it('covers every vending option', () => {
    /* A missing entry would silently render a label with no icon, which is fine
       visually but hides the omission. This makes the map's completeness explicit. */
    for (const { label, Icon } of allOptions) {
      expect(Icon, `${label} has no icon`).toBeTypeOf('function')
    }
  })
})
