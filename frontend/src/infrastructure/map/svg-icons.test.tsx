// @vitest-environment jsdom

import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  ArmchairIcon,
  CircleDotIcon,
  CoffeeIcon,
  CupSodaIcon,
  DropletsIcon,
  FavoriteIcon,
  NavigationIcon,
  PrinterIcon,
  ToiletIcon,
  TreePineIcon,
} from '../../ui/icons'
import { createMapSvgIcon, type MapSvgIconName } from './svg-icons'

const icons: readonly { name: MapSvgIconName; reactIcon: ReactElement }[] = [
  {
    name: 'circle-dot',
    reactIcon: createElement(CircleDotIcon, { className: 'personal-waypoint-marker-glyph', size: 13 }),
  },
  {
    name: 'armchair',
    reactIcon: createElement(ArmchairIcon, { className: 'personal-waypoint-marker-glyph', size: 13 }),
  },
  {
    name: 'coffee',
    reactIcon: createElement(CoffeeIcon, { className: 'personal-waypoint-marker-glyph', size: 13 }),
  },
  {
    name: 'tree-pine',
    reactIcon: createElement(TreePineIcon, { className: 'personal-waypoint-marker-glyph', size: 13 }),
  },
  {
    name: 'star',
    reactIcon: createElement(FavoriteIcon, {
      className: 'personal-waypoint-marker-glyph',
      filled: false,
      size: 13,
    }),
  },
  { name: 'navigation', reactIcon: createElement(NavigationIcon) },
  { name: 'printer', reactIcon: createElement(PrinterIcon, { className: 'community-waypoint-marker-glyph', size: 13 }) },
  { name: 'droplets', reactIcon: createElement(DropletsIcon, { className: 'community-waypoint-marker-glyph', size: 13 }) },
  { name: 'toilet', reactIcon: createElement(ToiletIcon, { className: 'community-waypoint-marker-glyph', size: 13 }) },
  { name: 'cup-soda', reactIcon: createElement(CupSodaIcon, { className: 'community-waypoint-marker-glyph', size: 13 }) },
]

function attributesOf(element: Element): Record<string, string> {
  return Object.fromEntries(Array.from(element.attributes)
    .filter(({ name }) => name !== 'xmlns')
    .map(({ name, value }) => [name, value]))
}

describe('createMapSvgIcon', () => {
  it.each(icons)('matches the $name icon from the shared icon system', ({ name, reactIcon }) => {
    const template = document.createElement('template')
    template.innerHTML = renderToStaticMarkup(reactIcon)
    const expected = template.content.querySelector('svg')!
    const actual = createMapSvgIcon(name, {
      ...(name === 'circle-dot' || name === 'armchair' || name === 'coffee' || name === 'tree-pine' || name === 'star'
        ? { className: 'personal-waypoint-marker-glyph', size: 13 }
        : name === 'printer' || name === 'droplets' || name === 'toilet' || name === 'cup-soda'
          ? { className: 'community-waypoint-marker-glyph', size: 13 }
        : {}),
    })

    expect(attributesOf(actual)).toEqual(attributesOf(expected))
    expect(actual.innerHTML).toBe(expected.innerHTML)
  })
})
