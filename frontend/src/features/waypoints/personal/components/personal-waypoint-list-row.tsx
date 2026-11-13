import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent, Ref } from 'react'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { useSortable } from '@dnd-kit/react/sortable'
import { IconButton } from '../../../../ui/button'
import { SavedListRow } from '../../../../ui/saved-list-row'
import { CloseIcon, GripVerticalIcon, NavigationIcon, EllipsisVerticalIcon, MapIcon } from '../../../../ui/icons'
import { ConnectedCategoryPicker } from '../connected-category-picker'
import { PersonalWaypointMarkerGlyph } from './personal-waypoint-marker-glyph'
import { personalWaypointMarkerColorClass } from './personal-waypoint-marker-color'
import { useState } from 'react'

interface PersonalWaypointListRowProps {
  readonly waypoint: PersonalWaypoint
  readonly editing: boolean
  readonly handleDisabled: boolean
  readonly onRemove: (waypointId: string) => void
  readonly moveCategoryOptions?: readonly string[]
  readonly onMoveToCategory?: (waypointId: string, category: string) => boolean
  readonly onFocusWaypoint?: (waypoint: PersonalWaypoint) => void
  readonly onOpenDetails?: (waypoint: PersonalWaypoint, trigger: HTMLElement) => void
  readonly onDirections?: (waypoint: PersonalWaypoint) => void
  readonly onHandleRef?: (waypointId: string, element: HTMLButtonElement | null) => void
  readonly rowRef?: Ref<HTMLLIElement>
  readonly handleRef?: (element: HTMLButtonElement | null) => void
  readonly isDragging?: boolean
  readonly isDropTarget?: boolean
  readonly index: number
  readonly keyboardReordering?: boolean
  readonly onHandleKeyDown?: (waypointId: string, event: KeyboardEvent<HTMLButtonElement>) => void
  readonly handleDescriptionId: string
  readonly group?: string
}

export function PersonalWaypointListRow({
  waypoint,
  editing,
  handleDisabled,
  onRemove,
  moveCategoryOptions = [],
  onMoveToCategory,
  onFocusWaypoint,
  onOpenDetails,
  onDirections,
  onHandleRef,
  rowRef,
  handleRef,
  isDragging = false,
  isDropTarget = false,
  keyboardReordering = false,
  onHandleKeyDown,
  handleDescriptionId,
}: PersonalWaypointListRowProps) {
  const [moving, setMoving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const label = `${waypoint.name}, ${waypoint.category}`
  const markerIcon = <PersonalWaypointMarkerGlyph markerIcon={waypoint.markerIcon} size={15} />
  const setHandleRef = useCallback((element: HTMLButtonElement | null): void => {
    handleRef?.(element)
    onHandleRef?.(waypoint.id, element)
  }, [handleRef, onHandleRef, waypoint.id])
  useLayoutEffect(() => {
    if (moving) triggerRef.current?.closest('.personal-waypoint-row')?.querySelector<HTMLInputElement>('.personal-waypoint-category-input-group input')?.focus({ preventScroll: true })
  }, [moving])
  useEffect(() => {
    if (!menuOpen && !moving) return
    const onPointer = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node) || triggerRef.current?.closest('.personal-waypoint-row')?.contains(target) || (target instanceof Element && target.closest('.personal-waypoint-category-popup'))) return
      setMenuOpen(false); setMoving(false); triggerRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', onPointer, true)
    return () => document.removeEventListener('pointerdown', onPointer, true)
  }, [menuOpen, moving])
  const optionsMenu = onMoveToCategory ? <div className="personal-waypoint-list-actions" data-owns-escape={menuOpen || moving ? 'true' : undefined} onKeyDown={(event) => {
    if (event.key !== 'Escape' || (!menuOpen && !moving)) return
    event.preventDefault(); event.stopPropagation(); setMenuOpen(false); setMoving(false); triggerRef.current?.focus({ preventScroll: true })
  }}><IconButton ref={triggerRef} label={`Waypoint options for ${label}`} icon={<EllipsisVerticalIcon />} variant="plain" expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} />{menuOpen && <div className="personal-waypoint-list-actions-menu"><button type="button" autoFocus className="personal-waypoint-move-menu-item" onClick={() => { setMenuOpen(false); setMoving(true) }}><MapIcon />Move to category</button></div>}</div> : null
  const picker = moving && onMoveToCategory ? <div className="personal-waypoint-move-picker" data-owns-escape="true" onKeyDown={(event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()
    setMoving(false)
    triggerRef.current?.focus({ preventScroll: true })
  }}><span>Move {waypoint.name} to</span><ConnectedCategoryPicker id={`move-category-${waypoint.id}`} label={`Move ${waypoint.name} to category`} category={waypoint.category} options={moveCategoryOptions} onSelect={(category) => { if (onMoveToCategory(waypoint.id, category)) setMoving(false) }} /></div> : null

  return (
    <SavedListRow
      rowRef={rowRef}
      className={`personal-waypoint-row${isDragging ? ' personal-waypoint-row-dragging' : ''}${isDropTarget ? ' personal-waypoint-row-drop-target' : ''}`}
      density="compact"
      leading={<>
        {editing && <IconButton
          className="personal-waypoint-grip"
          label={`Reorder ${label}`}
          icon={<GripVerticalIcon />}
          onClick={() => undefined}
          onKeyDown={(event) => onHandleKeyDown?.(waypoint.id, event)}
          ariaDescribedBy={handleDescriptionId}
          ariaKeyShortcuts="Space Enter ArrowUp ArrowDown Escape"
          dataKeyboardReordering={keyboardReordering}
          disabled={handleDisabled}
          ref={setHandleRef}
        />}
        <span className={`personal-waypoint-pin ${personalWaypointMarkerColorClass(waypoint.markerColor)}`}>{markerIcon}</span>
      </>}
      title={waypoint.name}
      subtitle={waypoint.category}
      onSelect={(event) => onOpenDetails
        ? onOpenDetails(waypoint, event.currentTarget)
        : onFocusWaypoint?.(waypoint)}
      selectLabel={`Open ${label} details`}
      trailing={editing ? (
        <div className="personal-waypoint-row-actions">
          {optionsMenu}
          <IconButton
            className="personal-waypoint-remove"
            label={`Remove ${label}`}
            icon={<CloseIcon />}
            onClick={() => onRemove(waypoint.id)}
          />
        </div>
      ) : onDirections ? (
        <div className="personal-waypoint-row-actions">
          {optionsMenu}
          <IconButton
            className="personal-waypoint-directions"
            label={`Directions to ${label}`}
            icon={<NavigationIcon />}
            variant="plain"
            title={`Directions to ${label}`}
            onClick={() => onDirections(waypoint)}
          />
        </div>
      ) : undefined}
    >{picker}</SavedListRow>
  )
}

export function PersonalWaypointSortableListRow({
  waypoint,
  index,
  group,
  ...props
}: PersonalWaypointListRowProps) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: waypoint.id,
    index,
    group,
    // React owns rows across category lists; dnd-kit's optimistic plugin reparents their DOM nodes directly.
    plugins: [],
  })

  return (
    <PersonalWaypointListRow
      {...props}
      waypoint={waypoint}
      index={index}
      rowRef={ref}
      handleRef={handleRef}
      isDragging={isDragging}
      isDropTarget={isDropTarget}
    />
  )
}
