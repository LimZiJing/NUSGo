export function toViteFsModuleId(path) {
  const normalizedPath = path.replace(/\\/g, '/')
  return `/@fs/${normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath}`
}
