import { describe, expect, it } from 'vitest'
import { toViteFsModuleId } from './vite-module-id.mjs'

describe('toViteFsModuleId', () => {
  it('creates a Vite file-system module id for a Windows drive path', () => {
    expect(toViteFsModuleId('C:\\Users\\PC\\Work\\Code\\NUSGo\\adapter.ts'))
      .toBe('/@fs/C:/Users/PC/Work/Code/NUSGo/adapter.ts')
  })

  it('creates a Vite file-system module id for a POSIX path', () => {
    expect(toViteFsModuleId('/home/user/NUSGo/adapter.ts'))
      .toBe('/@fs/home/user/NUSGo/adapter.ts')
  })
})
