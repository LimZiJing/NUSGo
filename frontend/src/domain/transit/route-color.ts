function getRelativeLuminance(color: string): number | null {
  const hex = color.startsWith('#') ? color.slice(1) : color
  if (!/^[\da-f]{6}$/i.test(hex)) return null

  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function getRouteContrastTextColor(color: string): '#000000' | '#ffffff' {
  const luminance = getRelativeLuminance(color)
  if (luminance === null) return '#000000'
  const whiteContrast = 1.05 / (luminance + 0.05)
  const blackContrast = (luminance + 0.05) / 0.05
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000'
}
