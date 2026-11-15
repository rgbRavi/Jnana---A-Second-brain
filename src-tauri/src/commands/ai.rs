// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{command, State};

/// Mask anything in a provider's error body that looks like a credential before
/// it is logged: some gateways echo the key back ("invalid key sk-…"). A token is
/// a run of letters, digits and `_-~+/=` at least 20 long that mixes letters and digits —
/// broad on purpose (it also hides long ids), since this text only feeds logs.
pub fn redact_secrets(s: &str) -> String {
    fn is_tok(c: char) -> bool {
        c.is_ascii_alphanumeric() || "_-~+/=".contains(c)
    }
    let mut out = String::with_capacity(s.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        let secret = run.len() >= 20
            && run.chars().any(|c| c.is_ascii_digit())
            && run.chars().any(|c| c.is_ascii_alphabetic());
        out.push_str(if secret { "[redacted]" } else { run.as_str() });
        run.clear();
    };
    for c in s.chars() {
        if is_tok(c) {
            run.push(c);
        } else {
            flush(&mut run, &mut out);
            out.push(c);
        }
    }
    flush(&mut run, &mut out);
    out
}

/// Render an error with its full source chain, so a generic reqwest message
/// like "error sending request" surfaces the real cause (Connection refused,
/// proxy failure, dns error, …).
fn err_chain(e: &dyn std::error::Error) -> String {
    let mut msg = e.to_string();
    let mut src = e.source();
    while let Some(s) = src {
        msg.push_str(" → ");
        msg.push_str(&s.to_string());
        src = s.source();
    }
    msg
}

/// Build an HTTP client. For loopback hosts we bypass any system/env proxy — a
/// proxy can't reach the caller's own localhost, which otherwise turns a local
/// request into a confusing "error sending request".
fn http_client(timeout_secs: u64, is_loopback: bool) -> Result<reqwest::Client, String> {
    let mut builder =
        reqwest::Client::builder().timeout(std::time::Duration::from_secs(timeout_secs));
    if is_loopback {
        builder = builder.no_proxy();
    }
    builder
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// User-facing AI settings, persisted on the Rust side (`ai_config.json` in
/// the app data dir) so the API key never lives in browser-reachable storage.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AiConfig {
    pub enabled: bool,
    pub auto_index: bool,
    // Chat and embeddings are configured independently, so you can run a local
    // embedding model (Ollama) while using an online chat API (and vice-versa).
    pub chat_provider: String,
    pub chat_base_url: String,
    pub chat_api_key: String,
    pub chat_model: String,
    pub embedding_provider: String,
    pub embedding_base_url: String,
    pub embedding_api_key: String,
    pub embedding_model: String,
    // Transcription is configured separately too: the chat provider may be
    // OpenRouter (no STT endpoint), so transcription gets its own OpenAI-compatible
    // base URL + key + model. "local" just points base_url at a local Whisper
    // server (e.g. speaches/faster-whisper-server), mirroring Ollama.
    pub transcription_provider: String,
    pub transcription_base_url: String,
    pub transcription_api_key: String,
    pub transcription_model: String,
    pub transcribe_on_record: bool,
    // Deep research is configured separately too: it may need a different model
    // (e.g. a reasoning/research model) or a different OpenAI-compatible host than
    // ordinary chat. When `deep_research_model` is set the "Deep research" toggle
    // routes there; otherwise it falls back to a system-prompt directive.
    pub deep_research_provider: String,
    pub deep_research_base_url: String,
    pub deep_research_api_key: String,
    pub deep_research_model: String,
    // Web search (quiz-from-web): "brave" | "tavily" | "searxng"; empty = brave.
    pub web_search_provider: String,
    pub web_search_base_url: String,
    pub web_search_api_key: String,
    // System prompts (chat-only / global) and saved provider presets per section.
    // Presets hold their own keys; they never leave Rust (see `AiPresetPublic`).
    pub chat_system_prompt: String,
    pub global_system_prompt: String,
    pub chat_presets: Vec<AiPreset>,
    pub embedding_presets: Vec<AiPreset>,
    pub transcription_presets: Vec<AiPreset>,
    pub deep_research_presets: Vec<AiPreset>,
    pub web_search_presets: Vec<AiPreset>,
    /// section -> id of the preset last saved/applied for it.
    pub active_presets: HashMap<String, String>,
}

/// A saved provider configuration for one section. `system_prompt` is chat-only.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AiPreset {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub system_prompt: String,
}

/// A preset as exposed to the frontend: no key, only its presence.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiPresetPublic {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub system_prompt: String,
    pub has_api_key: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetsPublic {
    pub chat: Vec<AiPresetPublic>,
    pub embedding: Vec<AiPresetPublic>,
    pub transcription: Vec<AiPresetPublic>,
    pub deep_research: Vec<AiPresetPublic>,
    pub web_search: Vec<AiPresetPublic>,
}

fn presets_public(v: &[AiPreset]) -> Vec<AiPresetPublic> {
    v.iter()
        .map(|p| AiPresetPublic {
            id: p.id.clone(),
            name: p.name.clone(),
            provider: p.provider.clone(),
            base_url: p.base_url.clone(),
            model: p.model.clone(),
            system_prompt: p.system_prompt.clone(),
            has_api_key: !p.api_key.is_empty(),
        })
        .collect()
}

/// Managed-state wrapper holding the live AI config.
pub struct AiState(pub Mutex<AiConfig>);

/// The config as exposed to the frontend: the key itself is redacted and
/// only its presence is reported.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigPublic {
    pub enabled: bool,
    pub auto_index: bool,
    pub chat_provider: String,
    pub chat_base_url: String,
    pub chat_model: String,
    pub has_chat_api_key: bool,
    pub embedding_provider: String,
    pub embedding_base_url: String,
    pub embedding_model: String,
    pub has_embedding_api_key: bool,
    pub transcription_provider: String,
    pub transcription_base_url: String,
    pub transcription_model: String,
    pub transcribe_on_record: bool,
    pub has_transcription_api_key: bool,
    pub deep_research_provider: String,
    pub deep_research_base_url: String,
    pub deep_research_model: String,
    pub has_deep_research_api_key: bool,
    pub web_search_provider: String,
    pub web_search_base_url: String,
    pub has_web_search_api_key: bool,
    pub chat_system_prompt: String,
    pub global_system_prompt: String,
    pub active_presets: HashMap<String, String>,
    pub presets: PresetsPublic,
}

impl From<&AiConfig> for AiConfigPublic {
    fn from(c: &AiConfig) -> Self {
        AiConfigPublic {
            enabled: c.enabled,
            auto_index: c.auto_index,
            chat_provider: c.chat_provider.clone(),
            chat_base_url: c.chat_base_url.clone(),
            chat_model: c.chat_model.clone(),
            has_chat_api_key: !c.chat_api_key.is_empty(),
            embedding_provider: c.embedding_provider.clone(),
            embedding_base_url: c.embedding_base_url.clone(),
            embedding_model: c.embedding_model.clone(),
            has_embedding_api_key: !c.embedding_api_key.is_empty(),
            transcription_provider: c.transcription_provider.clone(),
            transcription_base_url: c.transcription_base_url.clone(),
            transcription_model: c.transcription_model.clone(),
            transcribe_on_record: c.transcribe_on_record,
            has_transcription_api_key: !c.transcription_api_key.is_empty(),
            deep_research_provider: c.deep_research_provider.clone(),
            deep_research_base_url: c.deep_research_base_url.clone(),
            deep_research_model: c.deep_research_model.clone(),
            has_deep_research_api_key: !c.deep_research_api_key.is_empty(),
            web_search_provider: c.web_search_provider.clone(),
            web_search_base_url: c.web_search_base_url.clone(),
            has_web_search_api_key: !c.web_search_api_key.is_empty(),
            chat_system_prompt: c.chat_system_prompt.clone(),
            global_system_prompt: c.global_system_prompt.clone(),
            active_presets: c.active_presets.clone(),
            presets: PresetsPublic {
                chat: presets_public(&c.chat_presets),
                embedding: presets_public(&c.embedding_presets),
                transcription: presets_public(&c.transcription_presets),
                deep_research: presets_public(&c.deep_research_presets),
                web_search: presets_public(&c.web_search_presets),
            },
        }
    }
}

fn config_path() -> std::path::PathBuf {
    crate::db::data_dir().join("ai_config.json")
}

/// One-time migration from the old single-provider config (provider/baseUrl/
/// apiKey shared by chat + embeddings) to the split chat_*/embedding_* shape.
fn migrate_legacy(mut cfg: AiConfig, raw: &str) -> AiConfig {
    if !cfg.chat_base_url.is_empty() || !cfg.embedding_base_url.is_empty() {
        return cfg; // already migrated
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        let (provider, base, key) = (s("provider"), s("baseUrl"), s("apiKey"));
        if !base.is_empty() {
            cfg.chat_provider = provider.clone();
            cfg.chat_base_url = base.clone();
            cfg.chat_api_key = key.clone();
            cfg.embedding_provider = provider;
            cfg.embedding_base_url = base;
            cfg.embedding_api_key = key;
        }
    }
    cfg
}

/// Load the persisted config at startup (missing/corrupt file → defaults).
pub fn load_config_from_disk() -> AiConfig {
    let raw = match std::fs::read_to_string(config_path()) {
        Ok(raw) => raw,
        Err(_) => return AiConfig::default(),
    };
    match serde_json::from_str::<AiConfig>(&raw) {
        Ok(cfg) => migrate_legacy(cfg, &raw),
        Err(_) => AiConfig::default(),
    }
}

pub(crate) fn persist(config: &AiConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(crate::db::data_dir()).ok();
    std::fs::write(config_path(), json).map_err(|e| format!("Failed to save AI config: {}", e))
}

#[command]
pub fn get_ai_config(state: State<'_, AiState>) -> Result<AiConfigPublic, String> {
    let config = state.0.lock().map_err(|e| format!("AI config lock error: {}", e))?;
    Ok(AiConfigPublic::from(&*config))
}

/// Pure core of `set_ai_config`: normalise base URLs and apply the write-only key rules.
/// Presets and `active_presets` are owned by Rust (the WebView never carries their keys),
/// so they are always kept from `current`.
pub(crate) fn merge_config(current: &AiConfig, incoming: AiConfig) -> AiConfig {
    let mut next = incoming;
    // Store base URLs without a pasted endpoint path, so the settings show what's actually
    // used and "did the base URL change?" below compares like with like.
    next.chat_base_url = normalize_base_url(&next.chat_base_url);
    next.embedding_base_url = normalize_base_url(&next.embedding_base_url);
    next.transcription_base_url = normalize_base_url(&next.transcription_base_url);
    next.deep_research_base_url = normalize_base_url(&next.deep_research_base_url);
    let same = |a: &str, b: &str| normalize_base_url(a) == normalize_base_url(b);
    // Keys are write-only: an empty key keeps the stored one, unless that
    // provider's base URL/provider changed (then it's dropped so a key can't be
    // redirected to a host it wasn't entered for).
    if next.chat_api_key.is_empty()
        && same(&next.chat_base_url, &current.chat_base_url)
        && next.chat_provider == current.chat_provider
    {
        next.chat_api_key = current.chat_api_key.clone();
    }
    if next.embedding_api_key.is_empty()
        && same(&next.embedding_base_url, &current.embedding_base_url)
        && next.embedding_provider == current.embedding_provider
    {
        next.embedding_api_key = current.embedding_api_key.clone();
    }
    if next.transcription_api_key.is_empty()
        && same(&next.transcription_base_url, &current.transcription_base_url)
        && next.transcription_provider == current.transcription_provider
    {
        next.transcription_api_key = current.transcription_api_key.clone();
    }
    if next.deep_research_api_key.is_empty()
        && same(&next.deep_research_base_url, &current.deep_research_base_url)
        && next.deep_research_provider == current.deep_research_provider
    {
        next.deep_research_api_key = current.deep_research_api_key.clone();
    }
    if next.web_search_api_key.is_empty()
        && crate::commands::web_search::searxng_base(&next.web_search_base_url)
            == crate::commands::web_search::searxng_base(&current.web_search_base_url)
        && next.web_search_provider == current.web_search_provider
    {
        next.web_search_api_key = current.web_search_api_key.clone();
    }
    next.chat_presets = current.chat_presets.clone();
    next.embedding_presets = current.embedding_presets.clone();
    next.transcription_presets = current.transcription_presets.clone();
    next.deep_research_presets = current.deep_research_presets.clone();
    next.web_search_presets = current.web_search_presets.clone();
    next.active_presets = current.active_presets.clone();
    next
}

/// Update the config. The API key is write-only: an empty `apiKey` keeps the
/// stored key — unless the base URL or provider changed, in which case the key
/// is dropped so it can never be redirected to a different host than the one
/// it was entered for.
#[command]
pub fn set_ai_config(
    state: State<'_, AiState>,
    config: AiConfig,
) -> Result<AiConfigPublic, String> {
    let mut current = state.0.lock().map_err(|e| format!("AI config lock error: {}", e))?;
    let next = merge_config(&current, config);
    persist(&next)?;
    *current = next;
    Ok(AiConfigPublic::from(&*current))
}

/// Minimal HTTP response surfaced to the frontend AI providers.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFetchResponse {
    pub status: u16,
    pub body: String,
}

/// Resolve a request target (chat/embedding) to its full URL + key, applying
/// the same URL/path/cleartext-key validation for both the one-shot `ai_request`
/// and the streaming `ai_chat_stream`. Returns (url, api_key, is_loopback).
/// Endpoint paths Jnana appends itself. Users often paste the full endpoint from a
/// provider's docs (`…/api/v1/chat/completions`); strip it so the request isn't sent to
/// `…/chat/completions/chat/completions` (a 404).
const ENDPOINT_SUFFIXES: &[&str] = &[
    "/chat/completions",
    "/completions",
    "/embeddings",
    "/audio/transcriptions",
    "/api/chat",
    "/api/embed",
    "/api/embeddings",
    "/api/generate",
];

/// A base URL with surrounding whitespace, trailing slashes and any pasted endpoint path removed.
pub(crate) fn normalize_base_url(raw: &str) -> String {
    let mut s = raw.trim().trim_end_matches('/').to_string();
    loop {
        let lower = s.to_ascii_lowercase();
        match ENDPOINT_SUFFIXES.iter().find(|suf| lower.ends_with(*suf)) {
            Some(suf) => {
                s.truncate(s.len() - suf.len());
                s = s.trim_end_matches('/').to_string();
            }
            None => return s,
        }
    }
}

fn resolve_target(config: &AiConfig, target: &str, path: &str) -> Result<(String, String, bool), String> {
    // Pick the provider's base URL + key based on the call site.
    let (base_url, api_key) = match target {
        "embedding" => (config.embedding_base_url.clone(), config.embedding_api_key.clone()),
        "deepResearch" => (config.deep_research_base_url.clone(), config.deep_research_api_key.clone()),
        _ => (config.chat_base_url.clone(), config.chat_api_key.clone()),
    };
    // Also covers a config saved before normalisation existed.
    let base_url = normalize_base_url(&base_url);

    let base = reqwest::Url::parse(&base_url).map_err(|e| format!("Invalid AI base URL: {}", e))?;
    if base.scheme() != "http" && base.scheme() != "https" {
        return Err("AI base URL must be http(s)".into());
    }

    // Don't transmit an API key in cleartext to a remote host. Local providers
    // (e.g. Ollama on localhost over http) are exempt; everything else must use
    // https when a key is set.
    let host = base.host_str().unwrap_or("");
    let is_loopback = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if !api_key.is_empty() && base.scheme() == "http" && !is_loopback {
        return Err("Refusing to send the API key over http to a non-local host — use https.".into());
    }

    if !path.starts_with('/') || path.starts_with("//") || path.contains("..") {
        return Err(format!("Invalid AI endpoint path: {}", path));
    }

    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    Ok((url, api_key, is_loopback))
}

/// HTTP bridge for the AI layer.
///
/// Provider calls go through Rust rather than the WebView so requests aren't
/// blocked by the WebView's CORS policy. The frontend only supplies the
/// endpoint *path* and JSON body — the host comes from the stored config and
/// the Authorization header is injected here, so WebView code (including any
/// future plugin) can neither read the key nor send it to an arbitrary URL.
#[command]
pub async fn ai_request(
    state: State<'_, AiState>,
    target: String,
    path: String,
    body: String,
) -> Result<AiFetchResponse, String> {
    let config = state
        .0
        .lock()
        .map_err(|e| format!("AI config lock error: {}", e))?
        .clone();

    if !config.enabled {
        return Err("AI is disabled in settings".into());
    }

    let (url, api_key, is_loopback) = resolve_target(&config, &target, &path)?;

    let client = http_client(120, is_loopback)?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("AI request failed: {}", err_chain(&e)))?;

    let status = resp.status().as_u16();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read AI response body: {}", e))?;

    if status >= 400 {
        // Status + a truncated body for diagnosis. The API key lives in headers,
        // never the body, so this can't leak it.
        log::warn!(
            "ai_request: provider returned {} — {}",
            status,
            redact_secrets(&text.chars().take(300).collect::<String>())
        );
    }

    Ok(AiFetchResponse { status, body: text })
}

fn audio_mime(ext: &str) -> &'static str {
    match ext {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "flac" => "audio/flac",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
}

/// Transcribe an audio asset via an OpenAI-compatible `/audio/transcriptions`
/// endpoint. The host/key/model come from the Rust-side transcription config,
/// so this works against OpenAI (cloud) or a local Whisper server (e.g.
/// speaches / faster-whisper-server) by just pointing `transcriptionBaseUrl`
/// at it. Returns the transcript text.
#[command]
pub async fn transcribe_audio(state: State<'_, AiState>, filename: String) -> Result<String, String> {
    let config = state
        .0
        .lock()
        .map_err(|e| format!("AI config lock error: {}", e))?
        .clone();

    let base = reqwest::Url::parse(&config.transcription_base_url)
        .map_err(|_| "Transcription is not configured (set a base URL in AI settings).".to_string())?;
    if base.scheme() != "http" && base.scheme() != "https" {
        return Err("Transcription base URL must be http(s)".into());
    }
    let host = base.host_str().unwrap_or("");
    let is_loopback = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if !config.transcription_api_key.is_empty() && base.scheme() == "http" && !is_loopback {
        return Err(
            "Refusing to send the transcription key over http to a non-local host — use https."
                .into(),
        );
    }

    let path = crate::db::safe_asset_file(&filename)?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read audio asset: {}", e))?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone())
        .mime_str(audio_mime(ext))
        .map_err(|e| format!("Invalid audio mime: {}", e))?;
    let form = reqwest::multipart::Form::new()
        .text("model", config.transcription_model.clone())
        .part("file", part);

    let url = format!("{}/audio/transcriptions", normalize_base_url(&config.transcription_base_url));
    // Transcription is inherently long-running (a lecture on a CPU model can take
    // many minutes), so allow up to an hour before giving up.
    let client = http_client(3600, is_loopback)?;

    let mut req = client.post(&url).multipart(form);
    if !config.transcription_api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", config.transcription_api_key));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Transcription request failed: {}", err_chain(&e)))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read transcription response: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Transcription provider returned {}: {}",
            status.as_u16(),
            text.chars().take(500).collect::<String>()
        ));
    }

    // OpenAI-compatible APIs return { "text": "..." }.
    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| format!("Unexpected transcription response: {}", text.chars().take(300).collect::<String>()))?;
    Ok(parsed.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string())
}

// ─── Streaming chat ─────────────────────────────────────────────────────────

/// Registry of in-flight stream cancellation flags, keyed by the request id the
/// frontend generates. `ai_chat_cancel` flips the flag; the streaming loop polls it.
#[derive(Default)]
pub struct StreamCancels(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

/// One event pushed to the frontend over the per-request Channel. Serialized as
/// `{ "type": "chunk" | "done" | "error", ... }`.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamMsg {
    /// A raw slice of the provider's HTTP response body (SSE or NDJSON). The
    /// frontend buffers and parses provider-specific framing.
    Chunk { text: String },
    Done,
    Error { message: String },
}

/// Stream a chat completion. Identical auth/validation to `ai_request`, but the
/// response body is forwarded to the frontend in chunks over `on_event` instead
/// of being buffered — so tokens render live. The caller must set `stream: true`
/// in `body`; provider-specific delta parsing stays on the TS side.
#[command]
pub async fn ai_chat_stream(
    state: State<'_, AiState>,
    cancels: State<'_, StreamCancels>,
    target: String,
    path: String,
    body: String,
    request_id: String,
    on_event: Channel<StreamMsg>,
) -> Result<(), String> {
    let config = state
        .0
        .lock()
        .map_err(|e| format!("AI config lock error: {}", e))?
        .clone();

    if !config.enabled {
        return Err("AI is disabled in settings".into());
    }

    let (url, api_key, is_loopback) = resolve_target(&config, &target, &path)?;

    // Register a cancellation flag for this request.
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut map) = cancels.0.lock() {
        map.insert(request_id.clone(), flag.clone());
    }

    let outcome = stream_body(&url, &api_key, is_loopback, body, &flag, &on_event).await;

    // Always drop the registry entry, however we left the loop.
    if let Ok(mut map) = cancels.0.lock() {
        map.remove(&request_id);
    }

    match outcome {
        Ok(()) => {
            let _ = on_event.send(StreamMsg::Done);
        }
        Err(message) => {
            let _ = on_event.send(StreamMsg::Error { message });
        }
    }
    Ok(())
}

/// Do the actual streaming POST + forwarding. Returns the error message to emit
/// on failure; chunks are sent through `on_event` as they arrive.
async fn stream_body(
    url: &str,
    api_key: &str,
    is_loopback: bool,
    body: String,
    flag: &Arc<AtomicBool>,
    on_event: &Channel<StreamMsg>,
) -> Result<(), String> {
    // Generation can be slow; allow up to 10 minutes.
    let client = http_client(600, is_loopback)?;
    let mut req = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body);
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("AI request failed: {}", err_chain(&e)))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        log::warn!(
            "ai_chat_stream: provider returned {} — {}",
            status.as_u16(),
            redact_secrets(&text.chars().take(300).collect::<String>())
        );
        return Err(format!(
            "AI provider returned {}: {}",
            status.as_u16(),
            text.chars().take(500).collect::<String>()
        ));
    }

    // Forward decoded text, keeping any partial trailing UTF-8 sequence in the
    // buffer so a multi-byte char split across chunks is never corrupted.
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(item) = stream.next().await {
        if flag.load(Ordering::Relaxed) {
            break; // cancelled from the frontend
        }
        let bytes = item.map_err(|e| format!("Stream error: {}", err_chain(&e)))?;
        buf.extend_from_slice(&bytes);
        let text = match std::str::from_utf8(&buf) {
            Ok(s) => {
                let out = s.to_string();
                buf.clear();
                out
            }
            Err(e) => {
                let valid_len = e.valid_up_to();
                let out = String::from_utf8_lossy(&buf[..valid_len]).to_string();
                buf.drain(..valid_len);
                out
            }
        };
        if !text.is_empty() {
            let _ = on_event.send(StreamMsg::Chunk { text });
        }
    }

    Ok(())
}

/// Signal a running `ai_chat_stream` (by request id) to stop early.
#[command]
pub fn ai_chat_cancel(cancels: State<'_, StreamCancels>, request_id: String) -> Result<(), String> {
    if let Ok(map) = cancels.0.lock() {
        if let Some(flag) = map.get(&request_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{normalize_base_url, redact_secrets, resolve_target, AiConfig};

    #[test]
    fn base_url_accepts_the_full_endpoint_users_paste() {
        let want = "https://openrouter.ai/api/v1";
        for raw in [
            "https://openrouter.ai/api/v1",
            "https://openrouter.ai/api/v1/",
            " https://openrouter.ai/api/v1/chat/completions ",
            "https://openrouter.ai/api/v1/chat/completions/",
            "https://openrouter.ai/api/v1/embeddings",
            "https://api.openai.com/v1/audio/transcriptions",
        ] {
            let got = normalize_base_url(raw);
            if raw.contains("openai.com") {
                assert_eq!(got, "https://api.openai.com/v1", "{raw}");
            } else {
                assert_eq!(got, want, "{raw}");
            }
        }
        // Ollama endpoints pasted in full come back to the server root.
        assert_eq!(normalize_base_url("http://localhost:11434/api/chat"), "http://localhost:11434");
        assert_eq!(normalize_base_url("http://localhost:11434/api/embed"), "http://localhost:11434");
        // A path that merely contains an endpoint word is left alone.
        assert_eq!(normalize_base_url("https://host/chat/completions-proxy/v1"), "https://host/chat/completions-proxy/v1");
    }

    #[test]
    fn a_pasted_endpoint_is_not_doubled_in_the_request_url() {
        let cfg = AiConfig {
            chat_base_url: "https://openrouter.ai/api/v1/chat/completions".into(),
            ..Default::default()
        };
        let (url, _, _) = resolve_target(&cfg, "chat", "/chat/completions").unwrap();
        assert_eq!(url, "https://openrouter.ai/api/v1/chat/completions");
    }

    #[test]
    fn redacts_key_like_tokens_only() {
        let out = redact_secrets("Incorrect API key provided: sk-proj-AbC123xyz987QweRty456. See docs.");
        assert!(!out.contains("AbC123xyz987"), "{out}");
        assert!(out.contains("Incorrect API key provided: [redacted]. See docs."), "{out}");
        assert_eq!(redact_secrets("model gpt-4o not found (404)"), "model gpt-4o not found (404)");
    }
}
