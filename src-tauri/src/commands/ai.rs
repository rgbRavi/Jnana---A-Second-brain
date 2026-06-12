use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{command, State};

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

    if !path.starts_with('/') || path.starts_with("//") || path.contains("..") {
        return Err(format!("Invalid AI endpoint path: {}", path));
    }

    let url = format!("{}{}", config.base_url.trim_end_matches('/'), path);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

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
        .map_err(|e| format!("AI request failed: {}", e))?;

    let status = resp.status().as_u16();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read AI response body: {}", e))?;

    Ok(AiFetchResponse { status, body: text })
}
