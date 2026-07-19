import { evaluateResourcePolicy } from '../src/utils/resourceGuard'

describe('resource guard', () => {
  it('pauses heavy inference during thermal danger', () => {
    expect(evaluateResourcePolicy({ thermal: 'serious', availableRamBytes: 8, requiredRamBytes: 1 }).reason).toBe('thermal_limit')
  })

  it('protects the device when a model does not fit RAM', () => {
    expect(evaluateResourcePolicy({ thermal: 'nominal', availableRamBytes: 1, requiredRamBytes: 2 }).shouldStopNewModelDownloads).toBe(true)
  })
})
