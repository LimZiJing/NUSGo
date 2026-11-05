import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function spawnOwned(args, options) {
  if (process.platform !== 'win32') return spawn(process.execPath, args, { ...options, detached: true })
  const payload = Buffer.from(JSON.stringify({ exe: process.execPath, args, cwd: options.cwd })).toString('base64')
  return spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', fileURLToPath(new URL('./windows-run.ps1', import.meta.url)), '-Payload', payload,
  ], { ...options, windowsHide: true })
}

const terminations = new WeakMap()

// Only accept ChildProcess handles owned by this supervisor, never registry PIDs.
export function stopTree(child, options) {
  if (!terminations.has(child)) {
    terminations.set(child, terminate(child, options).catch((error) => {
      terminations.delete(child)
      throw error
    }))
  }
  return terminations.get(child)
}

async function terminate(child, { group = true } = {}) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise((done, reject) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true, stdio: 'ignore',
      })
      killer.once('error', reject)
      killer.once('exit', (code) => {
        if (code && child.exitCode === null) reject(new Error(`Could not stop owned process tree ${child.pid}.`))
        else done()
      })
    })
  } else {
    const target = group ? -child.pid : child.pid
    try { process.kill(target, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
    await new Promise((done) => setTimeout(done, 300))
    if (!group && (child.exitCode !== null || child.signalCode !== null)) return
    try { process.kill(target, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
}
