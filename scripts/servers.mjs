import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createSocket } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnOwned, stopTree } from './servers/process.mjs'

const script = fileURLToPath(import.meta.url)
const repository = resolve(dirname(script), '..')
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16)

/** Canonicalize worktree ownership and share local state across the repository's linked checkouts. */
export async function groupOptions(worktree = repository) {
  worktree = await realpath(worktree)
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: worktree, encoding: 'utf8', windowsHide: true,
  }).trim()
  const state = process.env.LOCALAPPDATA || join(homedir(), '.local', 'state')
  return { worktree, registry: join(state, 'NUSGo', 'servers', hash(await realpath(common))) }
}

const recordPath = (options) => join(options.registry, `${hash(options.worktree)}.json`)

/** Missing state means no owner; malformed or unreadable state must fail closed. */
async function readRecord(options) {
  try { return JSON.parse(await readFile(recordPath(options), 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** Authenticate a loopback manager and verify its identity; return null when ownership cannot be proved. */
export async function contact(record, action = 'status') {
  if (!record || !Number.isInteger(record.controlPort) || typeof record.token !== 'string') return null
  try {
    const response = await fetch(`http://127.0.0.1:${record.controlPort}/${action}`, {
      method: action === 'status' ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${record.token}` },
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return null
    const status = await response.json()
    return status.identity === record.identity && status.worktree === record.worktree ? status : null
  } catch { return null }
}

/** Probe the exact loopback port without adopting or stopping an existing listener. */
async function assertPortFree(port) {
  const server = createSocket()
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  await new Promise((done) => server.close(done))
}

/** Reject privileged, invalid, or overlapping ports before creating persistent state. */
function validatePorts(ports) {
  for (const port of ports) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Ports must be integers from 1024 to 65535.')
  }
  if (new Set(ports).size !== ports.length) throw new Error('Frontend and backend ports must differ.')
}

/** Reuse a verified healthy group or wait for one exclusive supervisor to finish startup. */
export async function startGroup(options) {
  const port = 20000 + (parseInt(hash(options.worktree).slice(0, 6), 16) % 10000) * 2
  options = { mode: 'dev', ports: [port, port + 1], ...options }
  validatePorts(options.ports)
  await mkdir(options.registry, { recursive: true })
  const existing = await readRecord(options)
  if (existing) {
    const status = await contact(existing)
    if (!status) throw new Error(`Unverified registry entry: ${recordPath(options)}. No process was stopped. Inspect it before removing it.`)
    if (options.mode !== 'dev' || existing.mode !== 'dev') throw new Error('A group already owns this worktree; stop it before running a temporary preview.')
    if (!['ready', 'starting'].includes(status.state)) throw new Error(`Existing group is ${status.state}; inspect servers:status or its log.`)
    if (options.explicitPorts && options.ports.join() !== existing.ports.join()) throw new Error('Existing group uses different ports; stop it first.')
    if (status.state === 'ready') return { record: existing, reused: true }
  }
  const identity = randomUUID()
  const logPath = join(options.registry, `${hash(options.worktree)}.log`)
  const log = await open(logPath, 'a')
  let child
  try {
    child = spawn(process.execPath, [script, 'supervise', JSON.stringify({ ...options, identity })], {
      cwd: options.worktree, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
    })
    child.unref()
  } finally { await log.close() }
  let spawnError
  child.once('error', (error) => { spawnError = error })
  for (let attempt = 0; attempt < 600; attempt++) {
    if (spawnError) throw spawnError
    const record = await readRecord(options)
    const status = await contact(record)
    if (status?.state === 'ready') {
      if (options.mode === 'preview' && record.identity !== identity) throw new Error('Another group won startup; its preview was left running.')
      if (record.mode !== options.mode || (options.explicitPorts && options.ports.join() !== record.ports.join())) {
        throw new Error('Another group won startup with different settings; stop it first.')
      }
      return { record, reused: record.identity !== identity }
    }
    if (status?.state === 'failed') throw new Error(`Server startup failed. See ${logPath}`)
    const locked = await access(`${recordPath(options)}.lock`).then(() => true, () => false)
    if (child.exitCode !== null && !locked) throw new Error(`Server manager exited (${child.exitCode}). See ${logPath}`)
    await delay(100)
  }
  const record = await readRecord(options)
  if (record?.identity === identity) await stopGroup(record)
  throw new Error(`Server startup timed out. See ${logPath}`)
}

/** Request authenticated shutdown and await disappearance; never signal a registry PID directly. */
export async function stopGroup(record) {
  if (!await contact(record, 'stop')) throw new Error('Cannot verify this manager; no PID was killed.')
  for (let attempt = 0; attempt < 150; attempt++) {
    if (!await contact(record)) return
    await delay(100)
  }
  throw new Error('Manager shutdown timed out; inspect its log.')
}

/** Accept any HTTP response as listener readiness, including an API root's expected 404. */
async function healthy(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })
    await response.body?.cancel()
    return true
  } catch { return false }
}

/** Own the worktree lock and service tree until initialization and shutdown have both settled. */
async function supervise(options) {
  const path = recordPath(options)
  // Held for the manager's lifetime. Never steal a lock based on age or PID alone.
  const lock = await open(`${path}.lock`, 'wx')
  let child, control, leaseTimer
  let state = 'starting'
  let stopping = false
  let initialization = Promise.resolve()
  const token = randomUUID()
  let lease = Date.now()
  const status = () => ({ identity: options.identity, worktree: options.worktree, state })
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    state = 'stopping'
    clearInterval(leaseTimer)
    try {
      // Cancellation may arrive while a resource is being acquired. Finish that
      // acquisition before deciding which resources must be released.
      await initialization.catch(() => {})
      if (child) await stopTree(child)
      if (control) await new Promise((done) => control.close(done))
      await rm(path, { force: true })
      await lock.close()
      await rm(`${path}.lock`, { force: true })
    } catch (error) {
      console.error('Shutdown failed; retaining ownership for inspection.', error)
      state = 'failed'
      stopping = false
    }
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
  try {
    initialization = (async () => {
      for (const port of options.ports) {
        await assertPortFree(port)
        if (stopping) return
      }
      control = createServer(async (request, response) => {
        if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403).end(); return }
        if (request.method === 'GET' && request.url === '/status') {
          response.setHeader('Content-Type', 'application/json')
          const ready = state !== 'ready' || (await Promise.all(options.ports.map(healthy))).every(Boolean)
          response.end(JSON.stringify({ ...status(), state: ready ? state : 'unhealthy' }))
        } else if (request.method === 'POST' && ['/stop', '/lease'].includes(request.url)) {
          lease = Date.now()
          response.end(JSON.stringify(status()))
          if (request.url === '/stop') void shutdown()
        } else response.writeHead(404).end()
      })
      await new Promise((done, reject) => {
        control.once('error', reject)
        control.listen(0, '127.0.0.1', done)
      })
      if (stopping) return
      const record = {
        worktree: options.worktree, ports: options.ports, mode: options.mode,
        pid: process.pid, startedAt: new Date().toISOString(), identity: options.identity,
        controlPort: control.address().port, token,
      }
      const command = options.command || (options.mode === 'preview'
        ? [resolve(options.worktree, 'node_modules/vite/bin/vite.js'), 'preview', '--mode', 'local-rehearsal', '--outDir', 'dist-local-rehearsal', '--host', '127.0.0.1', '--port', String(options.ports[0]), '--strictPort']
        : [resolve(options.worktree, 'scripts/dev.mjs')])
      child = spawnOwned(command, {
        cwd: options.command ? options.worktree : options.mode === 'preview' ? join(options.worktree, 'frontend') : options.worktree,
        windowsHide: true, detached: process.platform !== 'win32', stdio: 'inherit',
        env: {
          ...process.env, NUSGO_MANAGED_SERVERS: '1', HOST: '127.0.0.1',
          NUSGO_FRONTEND_PORT: String(options.ports[0]), PORT: String(options.ports[1] ?? ''),
          ...(options.mode === 'dev' ? { VITE_API_ORIGIN: '' } : {}),
          NUSGO_DEV_API_ORIGIN: `http://127.0.0.1:${options.ports[1]}`,
          API_CORS_ORIGINS: `http://127.0.0.1:${options.ports[0]},http://localhost:${options.ports[0]}`,
        },
      })
      child.once('error', (error) => { console.error(error); state = 'failed'; void shutdown() })
      child.once('exit', () => { if (!stopping) void shutdown() })
      record.childPid = child.pid
      const temporary = `${path}.${options.identity}.tmp`
      await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' })
      await rename(temporary, path)
    })()
    await initialization
    if (stopping) return
    leaseTimer = setInterval(() => {
      if (options.mode === 'preview' && Date.now() - lease > 15000) void shutdown()
    }, 1000)
    while (!stopping && !await Promise.all(options.ports.map(healthy)).then((results) => results.every(Boolean))) {
      await delay(200)
    }
    if (!stopping) state = 'ready'
  } catch (error) {
    console.error(error)
    await shutdown()
    process.exitCode = 1
  }
}

/** Dispatch repository commands and keep temporary checks separate from persistent development groups. */
async function main() {
  const [action, ...args] = process.argv.slice(2)
  if (action === 'supervise') return supervise(JSON.parse(args[0]))
  const options = await groupOptions()
  if (action === 'status') {
    await mkdir(options.registry, { recursive: true })
    const groups = []
    for (const file of await readdir(options.registry)) {
      if (!file.endsWith('.json')) continue
      const record = JSON.parse(await readFile(join(options.registry, file), 'utf8'))
      const status = await contact(record)
      groups.push({ worktree: record.worktree, ports: record.ports.join(','), pid: record.pid, childPid: record.childPid, startedAt: record.startedAt, state: status?.state ?? 'unverified', mode: record.mode })
    }
    console.table(groups)
    return
  }
  if (action === 'stop') {
    const record = await readRecord(options)
    if (record) await stopGroup(record)
    console.log(record ? 'Server group stopped.' : 'No registered group for this worktree.')
    return
  }
  if (!['start', 'preview'].includes(action)) throw new Error('Use start, status, stop, or preview [--port N] -- command [args].')
  const separator = args.indexOf('--')
  const flags = separator < 0 ? args : args.slice(0, separator)
  const ports = []
  for (let i = 0; i < flags.length; i += 2) {
    if (!['--port', '--backend-port'].includes(flags[i]) || !flags[i + 1]) throw new Error('Expected --port N or --backend-port N.')
    ports[flags[i] === '--port' ? 0 : 1] = Number(flags[i + 1])
  }
  const mode = action === 'preview' ? 'preview' : 'dev'
  if (mode === 'preview' && ports.length > 1) throw new Error('Preview mode accepts only --port; the API origin is embedded at build time.')
  if (ports.length && (!ports[0] || (mode === 'dev' && !ports[1]))) throw new Error('Specify both --port and --backend-port for development.')
  const check = separator < 0 ? [] : args.slice(separator + 1)
  if (mode === 'preview' && !check.length) throw new Error('Temporary previews require a command after -- (for example: -- node scripts/check.mjs).')
  if (mode === 'dev' && check.length) throw new Error('Commands after -- are only supported for temporary previews.')
  const result = await startGroup({ ...options, mode, ...(ports.length ? { ports, explicitPorts: true } : mode === 'preview' ? { ports: [4173] } : {}) })
  console.log(`${result.reused ? 'Reusing' : 'Started'} ${options.worktree}: ports ${result.record.ports.join(', ')} (PID ${result.record.pid})`)
  if (mode === 'dev') return
  process.exitCode = await runPreviewCheck(result.record, check, options.worktree)
}

/** Lease a preview while its check runs, preserving the check's result even if its manager disappears. */
export async function runPreviewCheck(record, check, worktree) {
  const lease = setInterval(() => void contact(record, 'lease'), 3000)
  let checkProcess
  const interrupt = () => { if (checkProcess) void stopTree(checkProcess) }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    checkProcess = spawn(check[0] === 'node' ? process.execPath : check[0], check.slice(1), {
      cwd: worktree, stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32',
      env: { ...process.env, NUSGO_PREVIEW_URL: `http://127.0.0.1:${record.ports[0]}` },
    })
    return await new Promise((done, reject) => {
      checkProcess.once('error', reject)
      checkProcess.once('exit', (code) => done(code ?? 1))
    })
  } finally {
    clearInterval(lease)
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
    try {
      if (await contact(record)) await stopGroup(record)
    } catch (error) {
      console.error('Preview cleanup failed; inspect the manager log.', error.message)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
