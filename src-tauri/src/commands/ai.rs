use serde::Serialize;
use std::collections::HashMap;
use tauri::command;

/// Minimal HTTP response surfaced to the frontend AI providers.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFetchResponse {
    pub status: u16,
    pub body: String,
}

/// Thin HTTP proxy for the AI layer.
///
/// AI providers (OpenAI-compatible APIs, local Ollama, etc.) are called from
/// Rust rather than the WebView so requests aren't blocked by the WebView's
/// CORS policy, and so the API key never has to live in browser-reachable
/// state. The frontend `AiProvider` adapters build the URL/headers/body; this
/// command just performs the request and returns the raw response.
#[command]
pub async fn ai_fetch(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<AiFetchResponse, String> {
    let client = reqwest::Client::new();

    let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {}", e))?;

    let mut req = client.request(method, &url);
    for (key, value) in headers {
        req = req.header(key, value);
    }
    if let Some(b) = body {
        req = req.body(b);
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
