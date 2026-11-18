// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// First-run AI setup: three short steps to a working chat model, instead of a
// card that points at a wall of fields. Nothing is saved until "Connect & test";
// the guide owns just the fields it needs (provider, address, key, model) and the
// full settings stay behind "Show all settings" in the panel. Success ends on a
// lasting "ready" state with the next real step (open AI chat / index notes).

import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { openUrl } from '@tauri-apps/plugin-opener'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Check, Copy, ExternalLink } from 'lucide-react'
import type { AiConfig, AiProviderKind } from '../../types'
import { testAiConnection, withChatProviderDefaults, withEmbeddingProviderDefaults } from '../../core/ai'
import { toast } from '../../lib/toast'
import { showConfirmDialog } from '../../lib/dialog'
import { log } from '../../lib/logger'
import { SettingToggle } from '../settings/SettingControls'
import { SettingActions, SettingButton, SettingField, hintId, settingInputClass } from '../settings/SettingLayout'
import { connectionSignature, recordConnectionTest } from './connectionStatus'
import styles from './AiSettings.module.css'

type Where = 'local' | 'cloud'
type Step = 'where' | 'connect' | 'ready'

// Kept in step with the `ollama pull` commands shown below (the provider default may differ).
const LOCAL_CHAT_MODEL = 'llama3.2'
const LOCAL_EMBED_MODEL = 'nomic-embed-text'
/** Only names that are safe to paste into a terminal are shown as a command. */
const SAFE_MODEL = /^[\w.:/-]+$/
const VALID_URL = /^https?:\/\/\S+$/i

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await writeText(command)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      log.error('[ai-setup] copy failed', e)
      toast.error("Couldn't copy. Select the command and copy it by hand.")
    }
  }
  return (
    <span className={styles.command}>
      <code>{command}</code>
      <button type="button" className={styles.copyBtn} title="Copy command" aria-label={`Copy “${command}”`} onClick={() => void copy()}>
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
    </span>
  )
}

export function AiSetupGuide({
  config,
  onChange,
  onReindex,
  noteCount,
  onFinish,
  onSkip,
}: {
  config: AiConfig
  /** Resolves false when the save failed (the caller already toasted). */
  onChange: (c: AiConfig) => void | Promise<boolean>
  onReindex: () => void
  noteCount: number
  /** Leave the guide after success. */
  onFinish: () => void
  /** Leave the guide without setting up (remembered; re-runnable from the panel). */
  onSkip: () => void
}) {
  const uid = useId()
  const navigate = useNavigate()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState<Step>('where')
  const [where, setWhere] = useState<Where | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [embedToo, setEmbedToo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Config from before the first failed attempt, so a failed test can be undone. */
  const priorRef = useRef<AiConfig | null>(null)
  const [canRestore, setCanRestore] = useState(false)
  const [embedChanged, setEmbedChanged] = useState(false)
  const replacingKey = !!config.hasChatApiKey

  // Each step announces itself: focus its heading so keyboard + screen-reader users land in it.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const toConnect = () => {
    if (!where) return
    const provider: AiProviderKind = where === 'local' ? 'ollama' : 'openai'
    const d = withChatProviderDefaults(config, provider)
    setBaseUrl(d.chatBaseUrl)
    setModel(where === 'local' ? LOCAL_CHAT_MODEL : d.chatModel)
    setApiKey('')
    setError(null)
    setStep('connect')
  }

  const connect = async () => {
    if (!where) return
    const provider: AiProviderKind = where === 'local' ? 'ollama' : 'openai'
    const url = baseUrl.trim()
    const m = model.trim()
    if (!m) return setError('Enter a model name.')
    if (!VALID_URL.test(url)) return setError('Enter the address starting with http:// or https://, for example http://localhost:11434.')
    if (where === 'cloud' && !apiKey.trim() && !config.hasChatApiKey) return setError('Paste your API key first.')
    setBusy(true)
    setError(null)
    let next: AiConfig = { ...withChatProviderDefaults(config, provider), chatBaseUrl: url, chatModel: m }
    if (apiKey.trim()) next.chatApiKey = apiKey.trim()
    if (where === 'local') {
      next = { ...withEmbeddingProviderDefaults(next, 'ollama'), embeddingBaseUrl: url, embeddingModel: LOCAL_EMBED_MODEL }
    } else if (embedToo) {
      next = { ...withEmbeddingProviderDefaults(next, 'openai'), embeddingBaseUrl: url }
      if (apiKey.trim()) next.embeddingApiKey = apiKey.trim()
    }
    const changesEmbed =
      !!config.embeddingModel.trim() &&
      (next.embeddingModel !== config.embeddingModel || next.embeddingProvider !== config.embeddingProvider)
    if (changesEmbed && !priorRef.current) {
      const ok = await showConfirmDialog({
        title: 'Replace search model?',
        message: `This switches search by meaning from ${config.embeddingModel} to ${next.embeddingModel}. Your search index will need rebuilding.`,
        confirmLabel: 'Continue',
      })
      if (!ok) return setBusy(false)
    }
    priorRef.current ??= config
    const saved = await onChange(next)
    if (saved === false) {
      setBusy(false)
      return setError("Couldn't save these settings. Try again.")
    }
    const r = await testAiConnection('chat', provider, m)
    recordConnectionTest('chat', r.ok, connectionSignature(provider, url, m))
    setBusy(false)
    if (!r.ok) {
      setCanRestore(true)
      return setError(r.message)
    }
    priorRef.current = null
    setCanRestore(false)
    setEmbedChanged(changesEmbed)
    setApiKey('')
    setStep('ready')
  }

  const restore = async () => {
    const prior = priorRef.current
    if (!prior) return
    setBusy(true)
    const ok = await onChange(prior)
    setBusy(false)
    if (ok === false) return setError("Couldn't restore your previous settings. Try again.")
    priorRef.current = null
    setCanRestore(false)
    setError(null)
    // The address/provider/model come back, but a saved API key the attempt replaced
    // (or that Rust dropped when the address changed) can't — keys are never kept here.
    toast.success(
      prior.hasChatApiKey
        ? 'Previous settings restored. Re-enter your API key under Chat — it was replaced during setup.'
        : 'Previous settings restored.',
    )
  }

  const stepNo = step === 'where' ? 1 : step === 'connect' ? 2 : 3
  const title =
    step === 'where' ? 'Where should the AI run?' : step === 'connect' ? (where === 'local' ? 'Connect Ollama' : 'Connect your service') : 'Jnana’s AI is ready'

  return (
    <section className={styles.guide} aria-labelledby={`${uid}-title`}>
      <p className={styles.guideStep}>Step {stepNo} of 3</p>
      <h3 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className={styles.guideTitle}>
        {title}
      </h3>

      {step === 'where' && (
        <>
          <div role="radiogroup" aria-labelledby={`${uid}-title`} className={styles.quickChoices}>
            {(
              [
                ['local', 'On this computer', 'Free and private. Uses Ollama, an app that runs AI models on your machine — nothing leaves your computer.'],
                ['cloud', 'Cloud service', 'Faster on most laptops. Uses an OpenAI-compatible service; you’ll need an API key from it.'],
              ] as const
            ).map(([value, label, desc]) => (
              <label key={value} className={`${styles.quickChoice} ${where === value ? styles.quickChoiceOn : ''}`}>
                <input
                  type="radio"
                  name={`${uid}-where`}
                  className={styles.srOnly}
                  checked={where === value}
                  onChange={() => setWhere(value)}
                />
                <strong>{label}</strong>
                <span>{desc}</span>
              </label>
            ))}
          </div>
          {replacingKey && (
            <p className={styles.warn}>Continuing replaces your current chat setup and its saved API key.</p>
          )}
          <SettingActions>
            <SettingButton variant="primary" disabled={!where} onClick={toConnect}>
              Continue
            </SettingButton>
            <SettingButton onClick={onSkip}>Skip — I’ll set it up myself</SettingButton>
          </SettingActions>
        </>
      )}

      {step === 'connect' && (
        <>
          {where === 'local' ? (
            <ol className={styles.checklist}>
              <li>
                <span>Install Ollama and open it.</span>
                <SettingButton onClick={() => openUrl('https://ollama.com/download').catch((e) => log.error('[ai-setup] open url failed', e))}>
                  <ExternalLink size={14} aria-hidden /> Get Ollama
                </SettingButton>
              </li>
              <li>
                <span>Download a chat model — run this in a terminal (once, a few GB):</span>
                {SAFE_MODEL.test(model.trim()) ? (
                  <CopyCommand command={`ollama pull ${model.trim()}`} />
                ) : (
                  <span className={styles.statusLine}>Enter a valid model name below.</span>
                )}
              </li>
              <li>
                <span>Optional, for search by meaning:</span>
                <CopyCommand command={`ollama pull ${LOCAL_EMBED_MODEL}`} />
              </li>
            </ol>
          ) : (
            <SettingField
              label="Service address"
              htmlFor={`${uid}-url`}
              hint="Filled in for OpenAI. Using another service? Paste its address here."
              hintVisible
            >
              <input
                id={`${uid}-url`}
                className={settingInputClass}
                value={baseUrl}
                spellCheck={false}
                aria-describedby={hintId(`${uid}-url`)}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </SettingField>
          )}

          {where === 'cloud' && (
            <SettingField
              label="API key"
              htmlFor={`${uid}-key`}
              hint="Stored on this device only, and sent only to the address above."
              hintVisible
            >
              <input
                id={`${uid}-key`}
                type="password"
                autoComplete="off"
                className={settingInputClass}
                value={apiKey}
                placeholder={config.hasChatApiKey ? '•••••• saved — type to replace' : 'sk-…'}
                aria-describedby={hintId(`${uid}-key`)}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </SettingField>
          )}

          <SettingField label="Model" htmlFor={`${uid}-model`} hint={where === 'local' ? 'The model you downloaded above.' : 'Any chat model your service offers.'}>
            <input
              id={`${uid}-model`}
              className={settingInputClass}
              value={model}
              spellCheck={false}
              aria-describedby={hintId(`${uid}-model`)}
              onChange={(e) => setModel(e.target.value)}
            />
          </SettingField>

          {where === 'cloud' && (
            <SettingToggle
              checked={embedToo}
              onChange={setEmbedToo}
              label="Also use it for search by meaning"
              hint="indexes your notes with the same service so AI answers can quote them"
            />
          )}

          {error && (
            <p role="alert" className={styles.guideError}>
              {error}
            </p>
          )}

          <SettingActions>
            <SettingButton variant="primary" busy={busy} onClick={() => void connect()}>
              {busy ? 'Connecting…' : 'Connect & test'}
            </SettingButton>
            {canRestore && (
              <SettingButton disabled={busy} onClick={() => void restore()}>
                Restore previous settings
              </SettingButton>
            )}
            <SettingButton disabled={busy} onClick={() => setStep('where')}>
              Back
            </SettingButton>
          </SettingActions>
        </>
      )}

      {step === 'ready' && (
        <>
          <p className={styles.guideReady}>
            <Check size={16} aria-hidden /> Connected to <strong>{model.trim()}</strong>
            {where === 'local' ? ' on this computer.' : '.'} You can change any of this later under Show all settings.
          </p>
          <p className={styles.statusLine}>
            Next: ask the AI something in chat, or index your notes so answers can find and quote them.
            {where === 'local' && ' Indexing needs the nomic-embed-text model from step 2.'}
            {embedChanged && ' Your search model changed, so the search index needs rebuilding.'}
          </p>
          <SettingActions>
            <SettingButton
              variant={embedChanged && noteCount > 0 ? undefined : 'primary'}
              onClick={() => {
                onFinish()
                navigate('/ai')
              }}
            >
              Open AI chat
            </SettingButton>
            {noteCount > 0 && (
              <SettingButton
                variant={embedChanged ? 'primary' : undefined}
                onClick={() => {
                  onReindex()
                  onFinish()
                }}
              >
                Index my {noteCount} notes
              </SettingButton>
            )}
            <SettingButton onClick={onFinish}>Done</SettingButton>
          </SettingActions>
        </>
      )}
    </section>
  )
}
