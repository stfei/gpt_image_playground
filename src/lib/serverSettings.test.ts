import { describe, expect, it, vi } from 'vitest'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import {
  applyLocalPreferenceSettings,
  applyServerSettingsApiKey,
  getLocalPreferenceSettings,
  loadServerSettings,
  parseServerSettingsConfig,
  SERVER_SETTINGS_URL,
} from './serverSettings'

function config() {
  const profile = createDefaultOpenAIProfile({
    id: 'server-profile',
    baseUrl: 'https://server.example/v1',
    apiKey: 'server-secret',
    model: 'server-model',
    timeout: 123,
    apiMode: 'responses',
    codexCli: true,
    apiProxy: true,
    streamImages: false,
    streamPartialImages: 2,
  })
  return {
    version: 1,
    settings: {
      profiles: [profile],
      activeProfileId: profile.id,
    },
  }
}

describe('server settings', () => {
  it('loads compact profile settings and strips every API key', () => {
    const settings = parseServerSettingsConfig(config())

    expect(settings.activeProfileId).toBe('server-profile')
    expect(settings.baseUrl).toBe('https://server.example/v1')
    expect(settings.model).toBe('server-model')
    expect(settings.timeout).toBe(123)
    expect(settings.apiMode).toBe('responses')
    expect(settings.codexCli).toBe(true)
    expect(settings.apiProxy).toBe(true)
    expect(settings.streamImages).toBe(false)
    expect(settings.streamPartialImages).toBe(2)
    expect(settings.apiKey).toBe('')
    expect(settings.profiles[0].apiKey).toBe('')
  })

  it('ignores legacy top-level API settings in favor of the active profile', () => {
    const legacy = config()
    Object.assign(legacy.settings, {
      baseUrl: 'https://legacy.example/v1',
      apiKey: 'legacy-secret',
      model: 'legacy-model',
      timeout: 1,
      apiMode: 'images',
      codexCli: false,
      apiProxy: false,
      streamImages: true,
      streamPartialImages: 0,
    })

    const settings = parseServerSettingsConfig(legacy)

    expect(settings.baseUrl).toBe('https://server.example/v1')
    expect(settings.model).toBe('server-model')
    expect(settings.timeout).toBe(123)
    expect(settings.apiMode).toBe('responses')
    expect(settings.codexCli).toBe(true)
    expect(settings.apiProxy).toBe(true)
    expect(settings.streamImages).toBe(false)
    expect(settings.streamPartialImages).toBe(2)
    expect(settings.apiKey).toBe('')
  })

  it('rejects duplicate profile IDs and invalid active profiles', () => {
    const duplicate = config()
    duplicate.settings.profiles.push({ ...duplicate.settings.profiles[0] })
    expect(() => parseServerSettingsConfig(duplicate)).toThrow('ID 重复')

    const invalidActive = config()
    invalidActive.settings.activeProfileId = 'missing'
    expect(() => parseServerSettingsConfig(invalidActive)).toThrow('活动 API 配置无效')
  })

  it('applies the local key only to the active server profile', () => {
    const document = config()
    document.settings.profiles.push(createDefaultOpenAIProfile({
      id: 'other-profile',
      apiKey: 'other-server-secret',
    }))
    const settings = parseServerSettingsConfig(document)
    const applied = applyServerSettingsApiKey(settings, { value: 'local-key' })

    expect(applied.apiKey).toBe('local-key')
    expect(applied.profiles[0].apiKey).toBe('local-key')
    expect(applied.profiles[1].apiKey).toBe('')
  })

  it('keeps local preference settings separate from server settings', () => {
    const serverSettings = parseServerSettingsConfig(config())
    const localSettings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      clearInputAfterSubmit: true,
      enterSubmit: true,
      agentMathFormattingPrompt: false,
    })
    const settings = applyLocalPreferenceSettings(
      serverSettings,
      getLocalPreferenceSettings(localSettings),
    )

    expect(settings.model).toBe('server-model')
    expect(settings.clearInputAfterSubmit).toBe(true)
    expect(settings.enterSubmit).toBe(true)
    expect(settings.agentMathFormattingPrompt).toBe(false)
  })

  it('loads the fixed same-origin URL without cache', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(config()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const settings = await loadServerSettings(fetcher)

    expect(settings.activeProfileId).toBe('server-profile')
    expect(fetcher).toHaveBeenCalledWith(SERVER_SETTINGS_URL, { cache: 'no-store' })
  })
})
