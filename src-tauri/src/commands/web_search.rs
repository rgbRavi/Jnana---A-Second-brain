// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

//! Web search through Brave / Tavily / a self-hosted SearXNG. Only returns
//! result URLs — never fetches them. Error strings reach the UI and logs, so
//! they are fixed messages that never embed the key, request URL or query.

use serde::Serialize;
use serde_json::Value;
use tauri::{command, State};

use super::ai::AiState;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

const MSG_UNREADABLE: &str = "The web search provider returned an unreadable response.";
const MSG_UNREACHABLE: &str = "Couldn't reach the web search provider.";

fn hits(items: Option<&Vec<Value>>, snippet_key: &str) -> Vec<SearchHit> {
    let s = |v: &Value, k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    items
        .into_iter()
        .flatten()
        .map(|r| SearchHit { title: s(r, "title"), url: s(r, "url"), snippet: s(r, snippet_key) })
        .filter(|h| h.url.starts_with("http://") || h.url.starts_with("https://"))
        .collect()
}

fn parse_brave(json: &str) -> Result<Vec<SearchHit>, String> {
    let v: Value = serde_json::from_str(json).map_err(|_| MSG_UNREADABLE.to_string())?;
    Ok(hits(v.pointer("/web/results").and_then(|x| x.as_array()), "description"))
}

fn parse_tavily(json: &str) -> Result<Vec<SearchHit>, String> {
    let v: Value = serde_json::from_str(json).map_err(|_| MSG_UNREADABLE.to_string())?;
    Ok(hits(v.get("results").and_then(|x| x.as_array()), "content"))
}

fn parse_searxng(json: &str) -> Result<Vec<SearchHit>, String> {
    parse_tavily(json) // same shape: results[] -> title, url, content
}

/// Status -> fixed user-facing message (None = success).
fn status_error(status: u16) -> Option<String> {
    match status {
        200..=299 => None,
        401 | 403 => Some("The web search provider rejected the API key.".into()),
        429 => Some("Web search rate limit reached — try again later.".into()),
        _ => Some(format!("The web search provider returned an error (HTTP {status}).")),
    }
}

#[command]
pub async fn web_search(
    state: State<'_, AiState>,
    query: String,
    count: u32,
) -> Result<Vec<SearchHit>, String> {
    // Clone out and drop the guard before any await.
    let cfg = state.0.lock().map_err(|_| "AI config lock error".to_string())?.clone();
    let provider = if cfg.web_search_provider.is_empty() { "brave" } else { cfg.web_search_provider.as_str() };
    let key = cfg.web_search_api_key.as_str();
    let count = count.clamp(1, 10);
    let client = super::web::public_client(15)?;

    let req = match provider {
        "brave" | "tavily" => {
            if key.is_empty() {
                return Err("Add a web search API key in Settings → AI.".into());
            }
            if provider == "brave" {
                client
                    .get("https://api.search.brave.com/res/v1/web/search")
                    .query(&[("q", query.as_str()), ("count", &count.to_string())])
                    .header("Accept", "application/json")
                    .header("X-Subscription-Token", key)
            } else {
                client
                    .post("https://api.tavily.com/search")
                    .header("Authorization", format!("Bearer {key}"))
                    .header("Content-Type", "application/json")
                    .body(serde_json::json!({ "query": query, "max_results": count }).to_string())
            }
        }
        "searxng" => {
            // The one request that may target localhost/LAN by design; http(s) only.
            let base = searxng_base(&cfg.web_search_base_url);
            if !(base.starts_with("http://") || base.starts_with("https://")) {
                return Err("Set an http(s) SearXNG URL in Settings → AI.".into());
            }
            client
                .get(format!("{base}/search"))
                .query(&[("q", query.as_str()), ("format", "json")])
                .header("Accept", "application/json")
        }
        _ => return Err("Unknown web search provider.".into()),
    };

    let resp = req.send().await.map_err(|_| MSG_UNREACHABLE.to_string())?;
    if let Some(msg) = status_error(resp.status().as_u16()) {
        return Err(msg);
    }
    let body = resp.text().await.map_err(|_| MSG_UNREADABLE.to_string())?;
    let mut out = match provider {
        "brave" => parse_brave(&body)?,
        "tavily" => parse_tavily(&body)?,
        _ => parse_searxng(&body)?,
    };
    out.truncate(count as usize);
    Ok(out)
}

/// The SearXNG instance root. Users often paste the search page itself (`…/search`),
/// which Jnana appends on its own.
pub(crate) fn searxng_base(raw: &str) -> String {
    let s = raw.trim().trim_end_matches('/');
    let s = s.strip_suffix("/search").unwrap_or(s);
    s.trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn searxng_base_accepts_a_pasted_search_url() {
        assert_eq!(searxng_base("http://localhost:8888"), "http://localhost:8888");
        assert_eq!(searxng_base(" http://localhost:8888/ "), "http://localhost:8888");
        assert_eq!(searxng_base("http://localhost:8888/search"), "http://localhost:8888");
        assert_eq!(searxng_base("https://sx.example/searx/search/"), "https://sx.example/searx");
    }

    const BRAVE: &str = r#"{"web":{"results":[
      {"title":"A","url":"https://a.example/x","description":"da"},
      {"title":"B","url":"http://b.example","description":"db"}]}}"#;
    const TAVILY: &str = r#"{"results":[
      {"title":"A","url":"https://a.example/x","content":"da"},
      {"title":"B","url":"http://b.example","content":"db"}]}"#;

    fn expected() -> Vec<SearchHit> {
        vec![
            SearchHit { title: "A".into(), url: "https://a.example/x".into(), snippet: "da".into() },
            SearchHit { title: "B".into(), url: "http://b.example".into(), snippet: "db".into() },
        ]
    }

    #[test]
    fn parse_brave_maps_results() {
        assert_eq!(parse_brave(BRAVE).unwrap(), expected());
    }

    #[test]
    fn parse_tavily_maps_results() {
        assert_eq!(parse_tavily(TAVILY).unwrap(), expected());
    }

    #[test]
    fn parse_searxng_maps_results() {
        assert_eq!(parse_searxng(TAVILY).unwrap(), expected());
    }

    #[test]
    fn parsers_drop_non_http_urls() {
        let bad = r#"{"results":[
          {"title":"x","url":"javascript:alert(1)","content":""},
          {"title":"y","url":"ftp://h/f","content":""},
          {"title":"ok","url":"https://ok.example","content":"c"}]}"#;
        assert_eq!(parse_tavily(bad).unwrap().len(), 1);
        assert_eq!(parse_searxng(bad).unwrap().len(), 1);
        let bad_brave = r#"{"web":{"results":[{"title":"x","url":"javascript:1","description":""}]}}"#;
        assert!(parse_brave(bad_brave).unwrap().is_empty());
    }

    #[test]
    fn parse_brave_tolerates_missing_web_key() {
        assert!(parse_brave("{}").unwrap().is_empty());
    }

    #[test]
    fn parse_errors_are_fixed_and_leak_nothing() {
        assert_eq!(parse_brave("not json SECRETKEY").unwrap_err(), MSG_UNREADABLE);
    }

    #[test]
    fn status_messages_are_fixed() {
        assert_eq!(status_error(200), None);
        assert_eq!(status_error(401).unwrap(), "The web search provider rejected the API key.");
        assert_eq!(status_error(403).unwrap(), "The web search provider rejected the API key.");
        assert_eq!(status_error(429).unwrap(), "Web search rate limit reached — try again later.");
        assert!(!status_error(500).unwrap().contains("://"));
    }
}
