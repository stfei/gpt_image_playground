import type { AppSettings } from '../types'
import { normalizeSettings } from './apiProfiles'

export const SERVER_SETTINGS_URL = '/app-config.json'

export interface ServerSettingsApiKey {
  value: string
}

const LOCAL_PREFERENCE_KEYS = [
  'clearInputAfterSubmit',
  'persistInputOnRestart',
  'reuseTaskApiProfileTemporarily',
  'alwaysShowRetryButton',
  'allowPromptRewrite',
  'taskCompletionNotification',
  'enterSubmit',
  'zipDownloadRoutes',
  'agentScrollToBottomAfterSubmit',
  'agentMathFormattingPrompt',
] as const

export type LocalPreferenceSettings = Pick<AppSettings, typeof LOCAL_PREFERENCE_KEYS[number]>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function stripServerSettingsApiKeys(settings: Partial<AppSettings> | unknown): AppSettings {
  const normalized = normalizeSettings(settings)
  return normalizeSettings({
    ...normalized,
    apiKey: '',
    profiles: normalized.profiles.map((profile) => ({
      ...profile,
      apiKey: '',
    })),
  })
}

export function applyServerSettingsApiKey(
  settings: Partial<AppSettings> | unknown,
  apiKey: ServerSettingsApiKey | null,
): AppSettings {
  const normalized = stripServerSettingsApiKeys(settings)
  if (!apiKey) return normalized

  const apiKeyProfileIds = new Set([normalized.activeProfileId])
  if (normalized.agentApiConfigMode !== 'off' && normalized.agentTextProfileId) {
    apiKeyProfileIds.add(normalized.agentTextProfileId)
  }
  if (normalized.agentApiConfigMode === 'hybrid' && normalized.agentImageProfileId) {
    apiKeyProfileIds.add(normalized.agentImageProfileId)
  }

  return normalizeSettings({
    ...normalized,
    apiKey: apiKey.value,
    profiles: normalized.profiles.map((profile) =>
      apiKeyProfileIds.has(profile.id)
        ? { ...profile, apiKey: apiKey.value }
        : profile,
    ),
  })
}

export function getLocalPreferenceSettings(settings: Partial<AppSettings> | unknown): LocalPreferenceSettings {
  const normalized = normalizeSettings(settings)
  return {
    clearInputAfterSubmit: normalized.clearInputAfterSubmit,
    persistInputOnRestart: normalized.persistInputOnRestart,
    reuseTaskApiProfileTemporarily: normalized.reuseTaskApiProfileTemporarily,
    alwaysShowRetryButton: normalized.alwaysShowRetryButton,
    allowPromptRewrite: normalized.allowPromptRewrite,
    taskCompletionNotification: normalized.taskCompletionNotification,
    enterSubmit: normalized.enterSubmit,
    zipDownloadRoutes: [...normalized.zipDownloadRoutes],
    agentScrollToBottomAfterSubmit: normalized.agentScrollToBottomAfterSubmit,
    agentMathFormattingPrompt: normalized.agentMathFormattingPrompt,
  }
}

export function applyLocalPreferenceSettings(
  settings: Partial<AppSettings> | unknown,
  preferences: LocalPreferenceSettings,
): AppSettings {
  return normalizeSettings({
    ...normalizeSettings(settings),
    ...preferences,
    zipDownloadRoutes: [...preferences.zipDownloadRoutes],
  })
}

export function hasLocalPreferenceSettingsPatch(settings: Partial<AppSettings>): boolean {
  return LOCAL_PREFERENCE_KEYS.some((key) => settings[key] !== undefined)
}

export function parseServerSettingsConfig(value: unknown): AppSettings {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.settings)) {
    throw new Error('服务端设置格式无效')
  }

  const profiles = value.settings.profiles
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error('服务端设置必须包含 API 配置')
  }

  const ids = new Set<string>()
  for (const profile of profiles) {
    if (!isRecord(profile) || typeof profile.id !== 'string' || !profile.id.trim()) {
      throw new Error('服务端 API 配置缺少有效 ID')
    }
    if (ids.has(profile.id)) throw new Error(`服务端 API 配置 ID 重复：${profile.id}`)
    ids.add(profile.id)
  }

  if (typeof value.settings.activeProfileId !== 'string' || !ids.has(value.settings.activeProfileId)) {
    throw new Error('服务端活动 API 配置无效')
  }

  const settings = { ...value.settings }
  delete settings.baseUrl
  delete settings.apiKey
  delete settings.model
  delete settings.timeout
  delete settings.apiMode
  delete settings.codexCli
  delete settings.apiProxy
  delete settings.streamImages
  delete settings.streamPartialImages
  return stripServerSettingsApiKeys(settings)
}

export async function loadServerSettings(
  fetcher: typeof fetch = fetch,
): Promise<AppSettings> {
  const response = await fetcher(SERVER_SETTINGS_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error(`服务端设置请求失败：HTTP ${response.status}`)
  return parseServerSettingsConfig(await response.json())
}
