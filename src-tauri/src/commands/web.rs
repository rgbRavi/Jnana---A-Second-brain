// Web link previews — fetch Open-Graph / <title> metadata for an embedded web
// page (the `![webpage](url)` note embed + canvas link nodes) and cache it by
// URL. All HTTP runs Rust-side (bypasses WebView CORS); parsing is lightweight
// string scanning (no HTML-parser crate).

use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Re-fetch a cached preview after this many ms.
const TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreview {
    pub url: String,
    pub title: String,
    pub description: String,
    pub image: String,
    pub favicon: String,
    pub site_name: String,
}

#[command]
pub async fn fetch_link_preview(state: State<'_, DbState>, url: String) -> Result<LinkPreview, String> {
    // Serve a fresh cached preview without hitting the network.
    {
        let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
        if let Some((preview, fetched_at)) =
            queries::get_link_preview(&conn, &url).map_err(|e| format!("cache read: {}", e))?
        {
            if now_ms() - fetched_at < TTL_MS {
                return Ok(preview);
            }
        }
    } // drop the guard before awaiting

    let preview = fetch_preview(&url).await.unwrap_or_else(|_| LinkPreview {
        url: url.clone(),
        title: String::new(),
        description: String::new(),
        image: String::new(),
        favicon: String::new(),
        site_name: domain_of(&url),
    });

    {
        let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let _ = queries::upsert_link_preview(&conn, &preview, now_ms());
    }
    Ok(preview)
}

async fn fetch_preview(url: &str) -> Result<LinkPreview, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; JnanaBot/1.0; +https://jnana.local)")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    let base = resp.url().clone();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    // Only the head region carries the metadata we need.
    let head = &body[..body.len().min(80_000)];

    let title = meta(head, "og:title")
        .or_else(|| meta(head, "twitter:title"))
        .or_else(|| title_tag(head))
        .unwrap_or_default();
    let description = meta(head, "og:description")
        .or_else(|| meta(head, "twitter:description"))
        .or_else(|| meta(head, "description"))
        .unwrap_or_default();
    let image = abs_url(&base, &meta(head, "og:image").or_else(|| meta(head, "twitter:image")).unwrap_or_default());
    let site_name = meta(head, "og:site_name").unwrap_or_else(|| domain_of(url));

    Ok(LinkPreview {
        url: url.to_string(),
        title,
        description,
        image,
        favicon: favicon(head, &base),
        site_name,
    })
}

/// Content of the first `<meta property|name="key" ... content="...">` matching key.
fn meta(html: &str, key: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let key_lower = key.to_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<meta") {
        let start = from + rel;
        let end = lower[start..].find('>').map(|e| start + e + 1).unwrap_or(html.len());
        let tag = &html[start..end];
        let tlow = tag.to_lowercase();
        // The key must appear as a property/name attribute value, not inside content.
        let matches_key = tlow.contains(&format!("\"{}\"", key_lower))
            || tlow.contains(&format!("'{}'", key_lower))
            || tlow.contains(&format!("={}", key_lower)); // unquoted
        if matches_key {
            if let Some(content) = attr(tag, "content") {
                if !content.trim().is_empty() {
                    return Some(content.trim().to_string());
                }
            }
        }
        from = end;
    }
    None
}

fn title_tag(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let gt = lower[start..].find('>')? + start + 1;
    let end = lower[gt..].find("</title>")? + gt;
    let t = decode_entities(html[gt..end].trim());
    if t.is_empty() { None } else { Some(t) }
}

/// Value of an HTML attribute within a single tag (quoted or unquoted).
fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let key = format!("{}=", name);
    let pos = lower.find(&key)?;
    let after = tag[pos + key.len()..].trim_start();
    let mut chars = after.chars();
    let first = chars.next()?;
    if first == '"' || first == '\'' {
        let rest = &after[1..];
        let endq = rest.find(first)?;
        Some(decode_entities(&rest[..endq]))
    } else {
        let endq = after.find(|c: char| c.is_whitespace() || c == '>').unwrap_or(after.len());
        Some(decode_entities(&after[..endq]))
    }
}

fn favicon(html: &str, base: &reqwest::Url) -> String {
    let lower = html.to_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<link") {
        let start = from + rel;
        let end = lower[start..].find('>').map(|e| start + e + 1).unwrap_or(html.len());
        let tag = &html[start..end];
        let tlow = tag.to_lowercase();
        if tlow.contains("rel=") && tlow.contains("icon") {
            if let Some(href) = attr(tag, "href") {
                if !href.trim().is_empty() {
                    return abs_url(base, &href);
                }
            }
        }
        from = end;
    }
    base.join("/favicon.ico").map(|u| u.to_string()).unwrap_or_default()
}

fn abs_url(base: &reqwest::Url, raw: &str) -> String {
    if raw.trim().is_empty() {
        return String::new();
    }
    base.join(raw.trim()).map(|u| u.to_string()).unwrap_or_else(|_| raw.trim().to_string())
}

fn domain_of(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_default()
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}
