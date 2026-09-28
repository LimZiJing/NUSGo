export function isFocusInsideMapRecenterControl(
  root: HTMLElement | null,
  activeElement: Element | null = document.activeElement,
): activeElement is HTMLElement {
  return root !== null && activeElement instanceof HTMLElement && root.contains(activeElement)
}
