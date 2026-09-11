import { describe, expect, it, vi } from 'vitest'
import appConfig from '../../public/app-config.json'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import {
  applyLocalPreferenceSettings,
  applyServerSettingsApiKey,
  getLocalPreferenceSettings,
  loadServerSettings,
  parseServerSettingsConfig,
  SERVER_SETTINGS_URL,
  stripServerSettingsApiKeys,
} from './serverSettings'

function config() {
  const profile = createDefaultOpenAIProfile({
    id: 'server-profile',
    isDefault: true,
    description: '服务器下发说明',
    baseUrl: 'https://server.example/v1',
    apiKey: 'server-secret',
    model: 'server-model',
    imageGenerationModel: 'server-image-model',
    timeout: 123,
    apiMode: 'responses',
    reasoningEffort: 'medium',
    codexCli: true,
    apiProxy: true,
    responseFormatB64Json: true,
    streamImages: false,
    streamPartialImages: 2,
    transparentBackgroundMethod: 'local',
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
  it('loads the repository app config with the active profile fields', () => {
    const settings = parseServerSettingsConfig(appConfig)
    const profile = settings.profiles.find((item) => item.id === settings.activeProfileId)

    expect(settings.activeProfileId).toBe('responses-api')
    expect(settings.agentApiConfigMode).toBe('native')
    expect(settings.agentTextProfileId).toBe('responses-api')
    expect(profile).toMatchObject({
      isDefault: true,
      description: '用于智能代理对话与工具调用。',
      imageGenerationModel: 'gpt-image-2',
      reasoningEffort: 'medium',
      transparentBackgroundMethod: 'api',
      apiKey: '',
    })
    expect(profile?.responseFormatB64Json).toBeUndefined()
  })

  it('loads compact profile settings and strips every API key', () => {
    const settings = parseServerSettingsConfig(config())

    expect(settings.activeProfileId).toBe('server-profile')
    expect(settings.baseUrl).toBe('https://server.example/v1')
    expect(settings.model).toBe('server-model')
    expect(settings.profiles[0].imageGenerationModel).toBe('server-image-model')
    expect(settings.timeout).toBe(123)
    expect(settings.apiMode).toBe('responses')
    expect(settings.profiles[0].isDefault).toBe(true)
    expect(settings.profiles[0].description).toBe('服务器下发说明')
    expect(settings.profiles[0].reasoningEffort).toBe('medium')
    expect(settings.codexCli).toBe(true)
    expect(settings.apiProxy).toBe(true)
    expect(settings.profiles[0].responseFormatB64Json).toBe(true)
    expect(settings.streamImages).toBe(false)
    expect(settings.streamPartialImages).toBe(2)
    expect(settings.profiles[0].transparentBackgroundMethod).toBe('local')
    expect(settings.apiKey).toBe('')
    expect(settings.profiles[0].apiKey).toBe('')
  })

  it('normalizes invalid reasoning effort without dropping other profile fields', () => {
    const document = config()
    Object.assign(document.settings.profiles[0], { reasoningEffort: 'invalid' })

    const settings = parseServerSettingsConfig(document)

    expect(settings.profiles[0].reasoningEffort).toBeUndefined()
    expect(settings.profiles[0].imageGenerationModel).toBe('server-image-model')
    expect(settings.profiles[0].responseFormatB64Json).toBe(true)
    expect(settings.profiles[0].transparentBackgroundMethod).toBe('local')
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
    expect(applied.profiles[0].reasoningEffort).toBe('medium')
    expect(applied.profiles[0].imageGenerationModel).toBe('server-image-model')
    expect(applied.profiles[0].responseFormatB64Json).toBe(true)
    expect(applied.profiles[0].transparentBackgroundMethod).toBe('local')
  })

  it('applies the shared local key to active and configured Agent profiles', () => {
    const document = config()
    document.settings.profiles[0].id = 'agent-text'
    document.settings.profiles[0].isDefault = undefined
    const activeProfile = createDefaultOpenAIProfile({
      id: 'active-image',
      isDefault: true,
      apiMode: 'images',
      apiKey: 'active-server-secret',
    })
    const agentImageProfile = createDefaultOpenAIProfile({
      id: 'agent-image',
      apiMode: 'images',
      apiKey: 'agent-image-server-secret',
    })
    const unusedProfile = createDefaultOpenAIProfile({
      id: 'unused',
      apiKey: 'unused-server-secret',
    })
    document.settings.profiles.push(activeProfile, agentImageProfile, unusedProfile)
    Object.assign(document.settings, {
      activeProfileId: activeProfile.id,
      agentApiConfigMode: 'hybrid',
      agentTextProfileId: 'agent-text',
      agentImageProfileId: agentImageProfile.id,
    })

    const settings = parseServerSettingsConfig(document)
    const applied = applyServerSettingsApiKey(settings, { value: 'local-key' })

    expect(applied.profiles.map((profile) => [profile.id, profile.apiKey])).toEqual([
      ['agent-text', 'local-key'],
      ['active-image', 'local-key'],
      ['agent-image', 'local-key'],
      ['unused', ''],
    ])
    expect(stripServerSettingsApiKeys(applied).profiles.every((profile) => profile.apiKey === '')).toBe(true)
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

  it('rejects failed HTTP responses', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }))

    await expect(loadServerSettings(fetcher)).rejects.toThrow('HTTP 503')
  })
})
