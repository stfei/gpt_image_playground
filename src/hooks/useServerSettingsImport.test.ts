// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../store'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from '../lib/apiProfiles'
import { setPresetConfig } from '../lib/presetConfig'
import { applyServerSettingsApiKey, getLocalPreferenceSettings } from '../lib/serverSettings'
import { promptImportLink } from './useImportLinks'

describe('server settings import confirmation', () => {
  beforeEach(() => {
    setPresetConfig(null)
    const profile = createDefaultOpenAIProfile({ id: 'server-profile', baseUrl: 'https://server.example/v1', model: 'server-model', apiKey: '' })
    const serverSettings = normalizeSettings({ profiles: [profile], activeProfileId: profile.id })
    useStore.setState({
      settings: applyServerSettingsApiKey(serverSettings, { value: 'old-local-key' }),
      defaultServiceEnabled: true,
      serverSettingsCache: serverSettings,
      customSettingsBackup: DEFAULT_SETTINGS,
      defaultServiceApiKey: { value: 'old-local-key' },
      localPreferenceSettings: getLocalPreferenceSettings(DEFAULT_SETTINGS),
      showSettings: false,
      confirmDialog: null,
      privacyMode: null,
      showToast: vi.fn(),
    })
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    useStore.getState().setConfirmDialog(null)
    await Promise.resolve()
    localStorage.clear()
  })

  it('applies a shared key only after confirmation without replacing the server profile', async () => {
    promptImportLink(new URLSearchParams({ apiKey: ' new-local-key ', apiUrl: 'https://blocked.example/v1', model: 'blocked-model' }), true)
    await vi.waitFor(() => expect(useStore.getState().confirmDialog).not.toBeNull())
    expect(useStore.getState().settings.apiKey).toBe('old-local-key')
    await useStore.getState().confirmDialog!.action!()

    expect(useStore.getState().defaultServiceApiKey).toEqual({ value: 'new-local-key' })
    expect(useStore.getState().settings).toMatchObject({ apiKey: 'new-local-key', baseUrl: 'https://server.example/v1', model: 'server-model' })
    expect(useStore.getState().serverSettingsCache?.profiles[0].apiKey).toBe('')
    expect(useStore.getState().customSettingsBackup).toEqual(DEFAULT_SETTINGS)
  })

  it('does not apply the key when the import is cancelled', async () => {
    promptImportLink(new URLSearchParams({ apiKey: 'cancelled-key' }), true)
    await vi.waitFor(() => expect(useStore.getState().confirmDialog).not.toBeNull())
    useStore.getState().setConfirmDialog(null)
    await Promise.resolve()

    expect(useStore.getState().settings.apiKey).toBe('old-local-key')
    expect(useStore.getState().defaultServiceApiKey).toEqual({ value: 'old-local-key' })
  })

  it('keeps the main import behavior when the default service is disabled', async () => {
    useStore.getState().setDefaultServiceEnabled(false)
    promptImportLink(new URLSearchParams({ apiKey: 'custom-key', apiUrl: 'https://custom.example/v1' }), true)
    await vi.waitFor(() => expect(useStore.getState().confirmDialog).not.toBeNull())
    await useStore.getState().confirmDialog!.action!()

    expect(useStore.getState().settings).toMatchObject({ apiKey: 'custom-key', baseUrl: 'https://custom.example/v1' })
    expect(useStore.getState().defaultServiceApiKey).toEqual({ value: 'old-local-key' })
  })

  it('applies the shared key without a dialog when deployment disables confirmation', async () => {
    vi.stubEnv('VITE_SHOW_CONFIG_CHANGE_DIALOG', 'false')
    promptImportLink(new URLSearchParams({ apiKey: 'auto-local-key', apiUrl: 'https://blocked.example/v1', model: 'blocked-model' }), true)
    await vi.waitFor(() => expect(useStore.getState().defaultServiceApiKey).toEqual({ value: 'auto-local-key' }))

    expect(useStore.getState().confirmDialog).toBeNull()
    expect(useStore.getState().settings).toMatchObject({ apiKey: 'auto-local-key', baseUrl: 'https://server.example/v1', model: 'server-model' })
    expect(useStore.getState().serverSettingsCache?.profiles[0].apiKey).toBe('')
    expect(useStore.getState().customSettingsBackup).toEqual(DEFAULT_SETTINGS)
  })
})
