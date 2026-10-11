import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const frontendRoot = resolve(repositoryRoot, 'frontend')
const backendRoot = resolve(repositoryRoot, 'backend')
const activeProcesses = new Map()
let exitCode = 0
let shutdownRequested = false
let resolveShutdown
const shutdownEvent = new Promise((resolvePromise) => { resolveShutdown = resolvePromise })

function requestShutdown(code) {
  if (shutdownRequested) return
  shutdownRequested = true
  exitCode = code
  resolveShutdown()
  for (const child of activeProcesses.keys()) child.kill('SIGTERM')
}

process.once('SIGINT', () => requestShutdown(130))
process.once('SIGTERM', () => requestShutdown(143))

function launch(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true })
  const done = new Promise((resolvePromise, reject) => {
    child.once('error', (error) => {
      activeProcesses.delete(child)
      reject(error)
    })
    child.once('close', (code, signal) => {
      activeProcesses.delete(child)
      resolvePromise({ code: code ?? 1, signal })
    })
  })
  activeProcesses.set(child, done)
  return { child, done }
}

async function runSetup(command, args, cwd) {
  const { done } = launch(command, args, cwd)
  const outcome = await done
  if (shutdownRequested) return
  if (outcome.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${outcome.code}`)
  }
}

async function valhallaIsReady() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch('http://127.0.0.1:8002/status', { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function stopChildren() {
  const processes = [...activeProcesses.entries()]
  for (const [child] of processes) child.kill('SIGTERM')
  await Promise.race([
    Promise.allSettled(processes.map(([, done]) => done)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 5000)),
  ])
  for (const [child] of activeProcesses) child.kill('SIGKILL')
  await Promise.allSettled([...activeProcesses.values()])
}

async function stopValhalla() {
  try {
    await runSetup('docker', ['compose', '-f', 'docker-compose.valhalla.yml', 'down'], repositoryRoot)
  } catch (error) {
    console.error('Could not stop the Valhalla container.', error instanceof Error ? error.message : 'Unknown error')
    if (exitCode === 0) exitCode = 1
  }
}

async function main() {
  let shouldStopValhalla = false
  try {
    await runSetup(process.execPath, [
      '--experimental-strip-types',
      'scripts/generate-shuttle-timing.mjs',
      '--allow-geometry-fallback',
    ], repositoryRoot)
    if (shutdownRequested) return

    shouldStopValhalla = !(await valhallaIsReady())
    await runSetup(process.execPath, ['scripts/start-valhalla.mjs'], repositoryRoot)
    if (shutdownRequested) return

    const backend = launch(process.execPath, [
      '--env-file-if-exists=.env',
      '--experimental-strip-types',
      '--watch',
      'src/server.ts',
    ], backendRoot)
    const viteCli = resolve(repositoryRoot, 'node_modules/vite/bin/vite.js')
    const frontend = launch(process.execPath, [viteCli, '--config', 'vite.config.ts'], frontendRoot)

    const firstResult = await Promise.race([
      backend.done.then((result) => ({ name: 'backend', result })),
      frontend.done.then((result) => ({ name: 'frontend', result })),
      shutdownEvent.then(() => null),
    ])
    if (firstResult && !shutdownRequested) {
      exitCode = firstResult.result.code === 0 ? 0 : 1
      if (firstResult.result.code !== 0) {
        console.error(`The ${firstResult.name} development server exited with code ${firstResult.result.code}.`)
      }
      requestShutdown(exitCode)
    }
  } catch (error) {
    if (!shutdownRequested) {
      exitCode = 1
      console.error('The NavUS development stack failed to start.', error instanceof Error ? error.message : 'Unknown error')
      requestShutdown(exitCode)
    }
  } finally {
    await stopChildren()
    if (shouldStopValhalla) await stopValhalla()
  }
}

void main().then(() => {
  process.exitCode = exitCode
})
