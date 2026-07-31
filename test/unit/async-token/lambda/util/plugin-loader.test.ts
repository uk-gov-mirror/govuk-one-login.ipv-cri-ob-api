import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('loadPlugin', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('loads the plugin from the path derived from THIRDPARTY_TOKEN_PLUGIN_NAME', async () => {
    vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', 'test-plugin')
    const plugin = { name: 'test-plugin' }
    vi.doMock('/opt/nodejs/test-plugin.mjs', () => ({ createPlugin: () => plugin }))

    const { loadPlugin } = await import('@src/async-token/lambda/util/plugin-loader')

    expect(await loadPlugin()).toBe(plugin)
  })

  it('returns the cached plugin on subsequent calls', async () => {
    vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', 'test-plugin')
    const createPlugin = vi.fn().mockReturnValue({ name: 'test-plugin' })
    vi.doMock('/opt/nodejs/test-plugin.mjs', () => ({ createPlugin }))

    const { loadPlugin } = await import('@src/async-token/lambda/util/plugin-loader')

    await loadPlugin()
    await loadPlugin()

    expect(createPlugin).toHaveBeenCalledOnce()
  })

  it('throws when THIRDPARTY_TOKEN_PLUGIN_NAME is not set', async () => {
    const { loadPlugin } = await import('@src/async-token/lambda/util/plugin-loader')

    await expect(loadPlugin()).rejects.toThrow('THIRDPARTY_TOKEN_PLUGIN_NAME')
  })

  it('throws when plugin name does not match THIRDPARTY_TOKEN_PLUGIN_NAME', async () => {
    vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', 'test-plugin')
    vi.doMock('/opt/nodejs/test-plugin.mjs', () => ({
      createPlugin: () => ({ name: 'wrong-plugin' })
    }))

    const { loadPlugin } = await import('@src/async-token/lambda/util/plugin-loader')

    await expect(loadPlugin()).rejects.toThrow(
      'Plugin name mismatch: expected "test-plugin", got "wrong-plugin"'
    )
  })

  it('throws when createPlugin throws', async () => {
    vi.stubEnv('THIRDPARTY_TOKEN_PLUGIN_NAME', 'test-plugin')
    vi.doMock('/opt/nodejs/test-plugin.mjs', () => ({
      createPlugin: () => {
        throw new Error('plugin init failed')
      }
    }))

    const { loadPlugin } = await import('@src/async-token/lambda/util/plugin-loader')

    await expect(loadPlugin()).rejects.toThrow('plugin init failed')
  })
})
