// @vitest-environment jsdom

import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SavedListRow } from './saved-list-row'

describe('SavedListRow', () => {
  it('forwards a ref to the list item', () => {
    const rowRef = createRef<HTMLLIElement>()

    render(
      <ul>
        <SavedListRow
          leading={<span />}
          title="Quiet bench"
          rowRef={rowRef}
        />
      </ul>,
    )

    expect(rowRef.current).toBe(screen.getByRole('listitem'))
  })
})
