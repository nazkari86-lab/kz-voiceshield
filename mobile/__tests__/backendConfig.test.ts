jest.mock('../src/bridge/SecureStorageBridge', () => ({
  SecureStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}))

import { inspectBackendTransport } from '../src/services/backendConfig'

describe('backend transport diagnostics', () => {
  it.each([
    ['https://api.example.kz', 'https'],
    ['http://192.168.1.3:8000', 'private-http'],
    ['http://10.0.0.7:8000', 'private-http'],
    ['http://127.0.0.1:8000', 'loopback-http'],
    ['http://example.kz:8000', 'insecure-http'],
  ] as const)('classifies %s as %s', (url, expected) => {
    expect(inspectBackendTransport(url).transport).toBe(expected)
  })

  it('warns when a phone cannot reach a loopback server', () => {
    expect(inspectBackendTransport('http://127.0.0.1:8000').warning).toContain('same device')
  })
})
