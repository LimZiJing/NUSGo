import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installFixtures } from './fixtures.mjs'
import { installPerformanceProbe } from './browser-metrics.mjs'
import { runPerformanceScenarios } from './scenarios.mjs'
import { fingerprintPageInputs } from './page-inputs.mjs'

const directory = resolve(process.env.PERF_DIST ?? 'frontend/dist-local-rehearsal')
const network = JSON.parse(await readFile(resolve(directory, 'data/shuttle-network.json'), 'utf8'))
const html = await readFile(resolve(directory, 'index.html'), 'utf8')
const pageInputs = await fingerprintPageInputs()
const setup = `<script>window.nusgoPerformanceInputs=${JSON.stringify(pageInputs)};(${installFixtures.toString()})(${JSON.stringify(network).replaceAll('<', '\\u003c')});(${installPerformanceProbe.toString()})();window.runNusgoPerformance=${runPerformanceScenarios.toString()}</script>`
await writeFile(resolve(directory, 'performance.html'), html.replace('<head>', `<head>${setup}`))
console.log('Prepared ignored performance.html with controlled API fixtures before application startup')
