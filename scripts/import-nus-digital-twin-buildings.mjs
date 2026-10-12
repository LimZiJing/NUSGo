import { fetchBuildingsSnapshot, SNAPSHOT_DIRECTORY } from '../frontend/scripts/buildings/snapshot.ts'

const args = new Set(process.argv.slice(2))
const unknown = [...args].filter((arg) => arg !== '--fetch' && arg !== '--force')
if (unknown.length > 0 || !args.has('--fetch') || (args.has('--force') && !args.has('--fetch'))) {
  console.error('Usage: npm run buildings:import -- --fetch [--force]')
  process.exit(1)
}

try {
  const { path, count } = await fetchBuildingsSnapshot({
    fetch,
    directory: SNAPSHOT_DIRECTORY,
    now: new Date(),
    force: args.has('--force'),
  })
  console.log(`Wrote ${count} buildings to ${path}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
