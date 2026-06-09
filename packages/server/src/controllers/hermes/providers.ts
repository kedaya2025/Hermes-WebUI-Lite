import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getActiveAuthPath } from '../../services/hermes/hermes-profile'
import * as hermesCli from '../../services/hermes/hermes-cli'
import { updateConfigYaml, saveEnvValue, PROVIDER_ENV_MAP } from '../../services/config-helpers'
import { PROVIDER_PRESETS } from '../../shared/providers'
import { logger } from '../../services/logger'
import { readAppConfig, writeAppConfig } from '../../services/app-config'

const OPTIONAL_API_KEY_PROVIDERS = new Set(['cliproxyapi', 'xai-oauth'])
const DIRECT_CONFIG_PROVIDERS = new Set(['xai-oauth'])

async function clearStoredAuthProvider(poolKey: string) {
  try {
    const authPath = getActiveAuthPath()
    if (!existsSync(authPath)) return

    const auth = JSON.parse(readFileSync(authPath, 'utf-8'))
    let changed = false
    if (auth.providers && Object.prototype.hasOwnProperty.call(auth.providers, poolKey)) {
      delete auth.providers[poolKey]
      changed = true
    }
    if (auth.credential_pool && Object.prototype.hasOwnProperty.call(auth.credential_pool, poolKey)) {
      delete auth.credential_pool[poolKey]
      changed = true
    }
    if (changed) {
      await writeFile(authPath, JSON.stringify(auth, null, 2) + '\n', 'utf-8')
    }
  } catch (err: any) { logger.error(err, 'Failed to clear auth credentials for %s', poolKey) }
}

function buildProviderEntry(name: string, base_url: string, api_key: string, model: string, context_length?: number) {
  const entry: any = { name, base_url, api_key, model }
  if (context_length && context_length > 0) {
    entry.models = { [model]: { context_length } }
  }
  return entry
}

function customPoolKey(name: unknown): string {
  return `custom:${String(name || '').trim().toLowerCase().replace(/ /g, '-')}`
}

function modelsFromEntry(entry: any): string[] {
  const fromModels = Array.isArray(entry?.models)
    ? entry.models
    : entry?.models && typeof entry.models === 'object'
      ? Object.keys(entry.models)
      : []
  return Array.from(new Set([
    ...fromModels.map((model: unknown) => String(model || '').trim()).filter(Boolean),
    String(entry?.model || '').trim(),
  ].filter(Boolean)))
}

function removeOwnProperty(target: any, key: string): boolean {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return false
  if (!Object.prototype.hasOwnProperty.call(target, key)) return false
  delete target[key]
  return true
}

function providerMatchesPoolKey(name: string, poolKey: string): boolean {
  return name === poolKey || customPoolKey(name) === poolKey
}

function collectProviderModels(config: any, providerKeys: Set<string>): string[] {
  const models: string[] = []
  const collect = (providerName: string, entry: any) => {
    if (!providerKeys.has(providerName) && !providerKeys.has(customPoolKey(providerName))) return
    models.push(...modelsFromEntry(entry))
  }

  if (Array.isArray(config.custom_providers)) {
    for (const entry of config.custom_providers) collect(customPoolKey(entry?.name), entry)
  }
  if (config.providers && typeof config.providers === 'object' && !Array.isArray(config.providers)) {
    for (const [name, entry] of Object.entries(config.providers)) collect(String(name), entry)
  }
  const catalogProviders = config.model_catalog?.providers
  if (catalogProviders && typeof catalogProviders === 'object' && !Array.isArray(catalogProviders)) {
    for (const [name, entry] of Object.entries(catalogProviders)) collect(String(name), entry)
  }

  return Array.from(new Set(models.filter(Boolean)))
}

function chooseFallbackProvider(config: any, removedKeys: Set<string>) {
  const candidates: Array<{ provider: string; model: string }> = []
  if (Array.isArray(config.custom_providers)) {
    for (const entry of config.custom_providers) {
      const provider = customPoolKey(entry?.name)
      const model = String(entry?.model || modelsFromEntry(entry)[0] || '').trim()
      if (model && !removedKeys.has(provider)) candidates.push({ provider, model })
    }
  }
  if (config.providers && typeof config.providers === 'object' && !Array.isArray(config.providers)) {
    for (const [name, entry] of Object.entries(config.providers)) {
      const provider = String(name)
      const model = String((entry as any)?.model || modelsFromEntry(entry)[0] || '').trim()
      if (model && !removedKeys.has(provider) && !removedKeys.has(customPoolKey(provider))) candidates.push({ provider, model })
    }
  }
  const catalogProviders = config.model_catalog?.providers
  if (catalogProviders && typeof catalogProviders === 'object' && !Array.isArray(catalogProviders)) {
    for (const [name, entry] of Object.entries(catalogProviders)) {
      const provider = String(name)
      const model = String((entry as any)?.model || modelsFromEntry(entry)[0] || '').trim()
      if (model && !removedKeys.has(provider) && !removedKeys.has(customPoolKey(provider))) candidates.push({ provider, model })
    }
  }
  return candidates[0]
}

async function clearAppProviderState(providerKeys: Set<string>) {
  const appConfig = await readAppConfig()
  const modelVisibility = { ...(appConfig.modelVisibility || {}) }
  const modelAliases = { ...(appConfig.modelAliases || {}) }
  let changed = false
  for (const key of providerKeys) {
    if (Object.prototype.hasOwnProperty.call(modelVisibility, key)) {
      delete modelVisibility[key]
      changed = true
    }
    if (Object.prototype.hasOwnProperty.call(modelAliases, key)) {
      delete modelAliases[key]
      changed = true
    }
  }
  if (changed) await writeAppConfig({ modelVisibility, modelAliases })
}

export async function create(ctx: any) {
  const { name, base_url, api_key, model, context_length, providerKey } = ctx.request.body as {
    name: string; base_url: string; api_key: string; model: string; context_length?: number; providerKey?: string | null
  }
  if (!name || !base_url || !model) {
    ctx.status = 400; ctx.body = { error: 'Missing name, base_url, or model' }; return
  }
  if (!api_key && !OPTIONAL_API_KEY_PROVIDERS.has(String(providerKey || ''))) {
    ctx.status = 400; ctx.body = { error: 'Missing API key' }; return
  }
  try {
    const poolKey = providerKey || `custom:${name.trim().toLowerCase().replace(/ /g, '-')}`
    const isBuiltin = poolKey in PROVIDER_ENV_MAP
    await updateConfigYaml(async (config) => {
      if (typeof config.model !== 'object' || config.model === null) { config.model = {} }
      if (!isBuiltin) {
        if (!Array.isArray(config.custom_providers)) { config.custom_providers = [] }
        const existing = (config.custom_providers as any[]).find(
          (e: any) => `custom:${e.name}` === poolKey
        )
        if (existing) {
          existing.base_url = base_url
          existing.api_key = api_key
          existing.model = model
          const preset = PROVIDER_PRESETS.find(p => p.value === poolKey.replace('custom:', ''))
          if (preset?.api_mode) existing.api_mode = preset.api_mode
          if (context_length && context_length > 0) {
            if (!existing.models) existing.models = {}
            existing.models[model] = existing.models[model] || {}
            existing.models[model].context_length = context_length
          }
        } else {
          const entry = buildProviderEntry(name.trim().toLowerCase().replace(/ /g, '-'), base_url, api_key, model, context_length)
          const preset = PROVIDER_PRESETS.find(p => p.value === poolKey.replace('custom:', ''))
          if (preset?.api_mode) entry.api_mode = preset.api_mode
          config.custom_providers.push(entry)
        }
        config.model.default = model
        config.model.provider = poolKey
      } else {
        if (PROVIDER_ENV_MAP[poolKey].api_key_env) {
          await saveEnvValue(PROVIDER_ENV_MAP[poolKey].api_key_env, api_key)
          if (PROVIDER_ENV_MAP[poolKey].base_url_env) { await saveEnvValue(PROVIDER_ENV_MAP[poolKey].base_url_env, base_url) }
          config.model.default = model
          config.model.provider = poolKey
        } else if (DIRECT_CONFIG_PROVIDERS.has(poolKey)) {
          if (PROVIDER_ENV_MAP[poolKey].base_url_env) { await saveEnvValue(PROVIDER_ENV_MAP[poolKey].base_url_env, base_url) }
          config.model.default = model
          config.model.provider = poolKey
        } else {
          if (!Array.isArray(config.custom_providers)) { config.custom_providers = [] }
          const existing = (config.custom_providers as any[]).find(
            (e: any) => `custom:${e.name}` === `custom:${poolKey}`
          )
          if (existing) {
            existing.base_url = base_url
            existing.api_key = api_key
            existing.model = model
            const preset = PROVIDER_PRESETS.find(p => p.value === poolKey)
            if (preset?.api_mode) existing.api_mode = preset.api_mode
            if (context_length && context_length > 0) {
              if (!existing.models) existing.models = {}
              existing.models[model] = existing.models[model] || {}
              existing.models[model].context_length = context_length
            }
          } else {
            const entry = buildProviderEntry(poolKey, base_url, api_key, model, context_length)
            const preset = PROVIDER_PRESETS.find(p => p.value === poolKey)
            if (preset?.api_mode) entry.api_mode = preset.api_mode
            config.custom_providers.push(entry)
          }
          config.model.default = model
          config.model.provider = `custom:${poolKey}`
        }
      }
      delete config.model.base_url
      delete config.model.api_key
      return config
    })
    // TODO: Test if provider works without gateway restart
    // try { await hermesCli.restartGateway() } catch (e: any) { logger.error(e, 'Gateway restart failed') }
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message }
  }
}

export async function update(ctx: any) {
  const poolKey = decodeURIComponent(ctx.params.poolKey)
  const { name, base_url, api_key, model } = ctx.request.body as {
    name?: string; base_url?: string; api_key?: string; model?: string
  }
  try {
    const isCustom = poolKey.startsWith('custom:')
    if (isCustom) {
      const found = await updateConfigYaml((config) => {
        if (!Array.isArray(config.custom_providers)) return { data: config, result: false, write: false }
        const entry = (config.custom_providers as any[]).find((e: any) => {
          return `custom:${e.name.trim().toLowerCase().replace(/ /g, '-')}` === poolKey
        })
        if (!entry) return { data: config, result: false, write: false }
        if (name !== undefined) entry.name = name
        if (base_url !== undefined) entry.base_url = base_url
        if (api_key !== undefined) entry.api_key = api_key
        if (model !== undefined) entry.model = model
        return { data: config, result: true }
      })
      if (!found) {
        ctx.status = 404; ctx.body = { error: `Custom provider "${poolKey}" not found` }; return
      }
    } else {
      const envMapping = PROVIDER_ENV_MAP[poolKey]
      if (!envMapping?.api_key_env) {
        ctx.status = 400; ctx.body = { error: `Cannot update credentials for "${poolKey}"` }; return
      }
      if (api_key !== undefined) { await saveEnvValue(envMapping.api_key_env, api_key) }
    }
    // TODO: Test if provider works without gateway restart
    // try { await hermesCli.restartGateway() } catch (e: any) { logger.error(e, 'Gateway restart failed') }
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message }
  }
}

export async function remove(ctx: any) {
  const poolKey = decodeURIComponent(ctx.params.poolKey)
  try {
    const isCustom = poolKey.startsWith('custom:')
    const removedKeys = new Set<string>([poolKey])
    const removed = await updateConfigYaml(async (config) => {
      let changed = false
      const removedModels = collectProviderModels(config, removedKeys)

      if (Array.isArray(config.custom_providers)) {
        const before = config.custom_providers.length
        config.custom_providers = (config.custom_providers as any[]).filter((entry: any) => {
          const entryKey = customPoolKey(entry?.name)
          const keep = entryKey !== poolKey && String(entry?.name || '') !== poolKey
          if (!keep) removedKeys.add(entryKey)
          return keep
        })
        changed = changed || config.custom_providers.length !== before
      }

      if (config.providers && typeof config.providers === 'object' && !Array.isArray(config.providers)) {
        for (const name of Object.keys(config.providers)) {
          if (providerMatchesPoolKey(name, poolKey)) {
            removedKeys.add(name)
            removedKeys.add(customPoolKey(name))
            changed = removeOwnProperty(config.providers, name) || changed
          }
        }
      }

      const catalogProviders = config.model_catalog?.providers
      if (catalogProviders && typeof catalogProviders === 'object' && !Array.isArray(catalogProviders)) {
        for (const name of Object.keys(catalogProviders)) {
          if (providerMatchesPoolKey(name, poolKey)) {
            removedKeys.add(name)
            removedKeys.add(customPoolKey(name))
            changed = removeOwnProperty(catalogProviders, name) || changed
          }
        }
      }

      if (!changed && isCustom) return { data: config, result: false, write: false }

      if (!isCustom) {
        const envMapping = PROVIDER_ENV_MAP[poolKey]
        if (envMapping?.api_key_env) {
          await saveEnvValue(envMapping.api_key_env, '')
          if (envMapping.base_url_env) { await saveEnvValue(envMapping.base_url_env, '') }
          changed = true
        }
      }

      if (typeof config.model === 'object' && config.model !== null) {
        const currentProvider = String(config.model.provider || '')
        const currentDefault = String(config.model.default || '')
        const providerRemoved = removedKeys.has(currentProvider) || removedKeys.has(customPoolKey(currentProvider))
        const defaultRemoved = currentDefault && removedModels.includes(currentDefault)
        if (providerRemoved || defaultRemoved) {
          const fallback = chooseFallbackProvider(config, removedKeys)
          if (fallback) {
            config.model.default = fallback.model
            config.model.provider = fallback.provider
            delete config.model.base_url
            delete config.model.api_key
          } else {
            config.model = {}
          }
          changed = true
        }
      }

      return { data: config, result: changed }
    })
    if (!removed) {
      ctx.status = 404; ctx.body = { error: `Provider "${poolKey}" not found` }; return
    }
    if (!isCustom) {
      const envMapping = PROVIDER_ENV_MAP[poolKey]
      if (!envMapping) {
        ctx.status = 404; ctx.body = { error: `Provider "${poolKey}" not found` }; return
      }
    }
    await clearStoredAuthProvider(poolKey)
    await clearAppProviderState(removedKeys)
    // TODO: Test if provider works without gateway restart
    // try { await hermesCli.restartGateway() } catch (e: any) { logger.error(e, 'Gateway restart failed') }
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message }
  }
}
