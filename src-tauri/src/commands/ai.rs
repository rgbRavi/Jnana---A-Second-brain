use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{command, State};

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
    pub provider: String,
    pub api_key: String,
    pub auto_index: bool,
    pub base_url: String,
    pub embedding_model: String,
    pub chat_model: String,
    // Transcription is configured separately from chat: the chat provider may be
    // OpenRouter/Ollama (no STT endpoint), so transcription gets its own
    // OpenAI-compatible base URL + key + model. "local" just points base_url at a
    // local Whisper server (e.g. speaches/faster-whisper-server), mirroring Ollama.
    pub transcription_provider: String,
    pub transcription_base_url: String,
    pub transcription_api_key: String,
    pub transcription_model: String,
    pub transcribe_on_record: bool,
}

/// Managed-state wrapper holding the live AI config.
pub struct AiState(pub Mutex<AiConfig>);

/// The config as exposed to the frontend: the key itself is redacted and
/// only its presence is reported.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigPublic {
    pub enabled: bool,
    pub provider: String,
    pub auto_index: bool,
    pub base_url: String,
    pub embedding_model: String,
    pub chat_model: String,
    pub has_api_key: bool,
    pub transcription_provider: String,
    pub transcription_base_url: String,
    pub transcription_model: String,
    pub transcribe_on_record: bool,
    pub has_transcription_api_key: bool,
}

impl From<&AiConfig> for AiConfigPublic {
    fn from(c: &AiConfig) -> Self {
        AiConfigPublic {
            enabled: c.enabled,
            provider: c.provider.clone(),
            auto_index: c.auto_index,
            base_url: c.base_url.clone(),
            embedding_model: c.embedding_model.clone(),
            chat_model: c.chat_model.clone(),
            has_api_key: !c.api_key.is_empty(),
            transcription_provider: c.transcription_provider.clone(),
            transcription_base_url: c.transcription_base_url.clone(),
            transcription_model: c.transcription_model.clone(),
            transcribe_on_record: c.transcribe_on_record,
            has_transcription_api_key: !c.transcription_api_key.is_empty(),
        }
    }
}

fn config_path() -> std::path::PathBuf {
    crate::db::data_dir().join("ai_config.json")
}

/// Load the persisted config at startup (missing/corrupt file → defaults).
pub fn load_config_from_disk() -> AiConfig {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn persist(config: &AiConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(crate::db::data_dir()).ok();
    std::fs::write(config_path(), json).map_err(|e| format!("Failed to save AI config: {}", e))
}

#[command]
pub fn get_ai_config(state: State<'_, AiState>) -> Result<AiConfigPublic, String> {
    let config = state.0.lock().map_err(|e| format!("AI config lock error: {}", e))?;
    Ok(AiConfigPublic::from(&*config))
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

    let mut next = config;
    if next.api_key.is_empty() {
        let same_target = next.base_url == current.base_url && next.provider == current.provider;
        if same_target {
            next.api_key = current.api_key.clone();
        }
    }
    // Same write-only rule for the transcription key.
    if next.transcription_api_key.is_empty() {
        let same_target = next.transcription_base_url == current.transcription_base_url
            && next.transcription_provider == current.transcription_provider;
        if same_target {
            next.transcription_api_key = current.transcription_api_key.clone();
        }
    }

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

    let base = reqwest::Url::parse(&config.base_url)
        .map_err(|e| format!("Invalid AI base URL: {}", e))?;
    if base.scheme() != "http" && base.scheme() != "https" {
        return Err("AI base URL must be http(s)".into());
    }

    // Don't transmit an API key in cleartext to a remote host. Local providers
    // (e.g. Ollama on localhost over http) are exempt; everything else must use
    // https when a key is set.
    let host = base.host_str().unwrap_or("");
    let is_loopback = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    if !config.api_key.is_empty() && base.scheme() == "http" && !is_loopback {
        return Err(
            "Refusing to send the API key over http to a non-local host — use https.".into(),
        );
    }

    if !path.starts_with('/') || path.starts_with("//") || path.contains("..") {
        return Err(format!("Invalid AI endpoint path: {}", path));
    }

    let url = format!("{}{}", config.base_url.trim_end_matches('/'), path);

    let client = http_client(120, is_loopback)?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body);
    if !config.api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", config.api_key));
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

    let url = format!(
        "{}/audio/transcriptions",
        config.transcription_base_url.trim_end_matches('/')
    );
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
