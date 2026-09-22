import { spawnSync } from 'node:child_process'

const composeFile = 'docker-compose.valhalla.yml'
const statusUrl = 'http://127.0.0.1:8002/status'
const waitTimeoutMs = Number(process.env.NAVUS_VALHALLA_WAIT_MS ?? 1_800_000)
const pollIntervalMs = 2_000

function runCompose(args) {
  const result = spawnSync('docker', ['compose', '-f', composeFile, ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

async function isReady() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_500)
  try {
    const response = await fetch(statusUrl, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  runCompose(['up', '-d'])

  const deadline = Date.now() + waitTimeoutMs
  while (Date.now() < deadline) {
    if (await isReady()) {
      console.log('Valhalla is ready at http://127.0.0.1:8002')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  console.error('Valhalla did not become ready before the timeout.')
  runCompose(['logs', '--tail', '80', 'valhalla'])
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
