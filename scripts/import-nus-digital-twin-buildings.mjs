import { DEFAULT_PATHS, runBuildingsCommand } from '../frontend/scripts/buildings/command.ts'

try {
  console.log(await runBuildingsCommand(process.argv.slice(2), {
    fetch,
    now: new Date(),
    paths: DEFAULT_PATHS,
  }))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
