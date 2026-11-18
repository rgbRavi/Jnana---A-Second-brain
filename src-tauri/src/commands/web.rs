// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Web link previews — fetch Open-Graph / <title> metadata for an embedded web
// page (the `![webpage](url)` note embed + canvas link nodes) and cache it by
// URL. All HTTP runs Rust-side (bypasses WebView CORS); parsing is lightweight
// string scanning (no HTML-parser crate).

use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv6Addr, ToSocketAddrs};
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

/// SSRF guard: is this address one we must never fetch (loopback / private /
/// link-local / unique-local / CGNAT / metadata / unspecified)?
fn ip_is_blocked(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local() // 169.254/16, incl. cloud metadata 169.254.169.254
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                || v4.octets()[0] == 0
                // CGNAT 100.64.0.0/10 (Ipv4Addr::is_shared is still unstable)
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 64)
        }
        IpAddr::V6(v6) => ipv6_is_blocked(v6),
    }
}

fn ipv6_is_blocked(v6: &Ipv6Addr) -> bool {
    if v6.is_loopback() || v6.is_unspecified() {
        return true;
    }
    // IPv4-mapped (::ffff:a.b.c.d) — apply the IPv4 rules to the embedded address.
    if let Some(v4) = v6.to_ipv4_mapped() {
        return ip_is_blocked(&IpAddr::V4(v4));
    }
    let seg = v6.segments();
    // fc00::/7 unique-local, fe80::/10 link-local (both accessors are unstable).
    (seg[0] & 0xfe00) == 0xfc00 || (seg[0] & 0xffc0) == 0xfe80
}

/// Reject a URL before we fetch it if it isn't http(s) or resolves to a private/
/// loopback/metadata address — so a `![webpage](url)` embed can't make the app
/// probe localhost, the LAN, or a cloud metadata endpoint (SSRF). Applied to the
/// initial URL and re-checked on every redirect hop.
///
/// This resolves the hostname and checks the results; it does not fully close a
/// DNS-rebinding race (reqwest re-resolves at connect time), which is a
/// proportionate mitigation for a local, single-user app.
fn validate_public_url(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(format!("Blocked non-http(s) URL ({}:)", url.scheme()));
    }
    let host = url.host_str().ok_or_else(|| "URL has no host".to_string())?;

    // IP literal → check directly, no DNS.
    if let Ok(ip) = host.parse::<IpAddr>() {
        return if ip_is_blocked(&ip) {
            Err(format!("Blocked private/loopback address: {}", host))
        } else {
            Ok(())
        };
    }

    // Hostname → block if ANY resolved address is private.
    let port = url.port_or_known_default().unwrap_or(80);
    let mut resolved = false;
    for addr in (host, port)
        .to_socket_addrs()
        .map_err(|e| format!("DNS resolution failed for {}: {}", host, e))?
    {
        resolved = true;
        if ip_is_blocked(&addr.ip()) {
            return Err(format!("Blocked host resolving to a private address: {}", host));
        }
    }
    if !resolved {
        return Err(format!("Host did not resolve: {}", host));
    }
    Ok(())
}

/// A fixed message for a failed page request. reqwest's own text embeds the full
/// URL ("… for url (…)"), and IPC failures reach the developer log, so it never
/// leaves this module.
fn fetch_err(e: reqwest::Error) -> String {
    if e.is_timeout() { "That page took too long to load." } else { "Couldn't load that page." }.to_string()
}

/// HTTP client for fetching untrusted public pages: bot UA, timeout, and a
/// redirect policy that re-validates every hop (<=5) against `validate_public_url`
/// so a public URL can't 30x-bounce us to localhost / the LAN / metadata.
pub(crate) fn public_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; JnanaBot/1.0; +https://jnana.local)")
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error("too many redirects");
            }
            match validate_public_url(attempt.url()) {
                Ok(()) => attempt.follow(),
                Err(_) => attempt.stop(),
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageText {
    pub url: String,
    pub title: String,
    pub text: String,
}

const PAGE_MAX_BYTES: usize = 3 * 1024 * 1024;
const PAGE_MAX_CHARS: usize = 200_000;

/// Fetch a public web page and return its readable text (used for quiz generation
/// from the web; quotes are verified against this same text).
#[command]
pub async fn fetch_page_text(url: String) -> Result<PageText, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    validate_public_url(&parsed)?;

    let mut resp = public_client(15)?
        .get(parsed)
        .send()
        .await
        .map_err(fetch_err)?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if !["text/html", "application/xhtml+xml", "text/plain"]
        .iter()
        .any(|t| ctype.starts_with(t))
    {
        return Err(format!("Unsupported content type: {}", ctype));
    }
    let final_url = resp.url().to_string();

    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(fetch_err)? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() >= PAGE_MAX_BYTES {
            bytes.truncate(PAGE_MAX_BYTES);
            break;
        }
    }
    let html = String::from_utf8_lossy(&bytes);
    let title = title_tag(&html).unwrap_or_default();
    let text: String = extract_readable_text(&html).chars().take(PAGE_MAX_CHARS).collect();
    Ok(PageText { url: final_url, title, text })
}

/// Elements dropped together with their contents.
const SKIP_TAGS: [&str; 9] = ["script", "style", "noscript", "svg", "nav", "header", "footer", "form", "template"];
/// Elements whose open/close boundary becomes a line break.
const BLOCK_TAGS: [&str; 12] = ["p", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "div", "tr", "hr"];

/// Plain text of an HTML page. Scans an ASCII-lowercased copy (same byte length,
/// so offsets stay valid for non-ASCII input); never panics on malformed markup.
fn extract_readable_text(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len() / 2);
    let mut i = 0;
    while i < html.len() {
        let Some(rel) = html[i..].find('<') else {
            out.push_str(&html[i..]);
            break;
        };
        let lt = i + rel;
        out.push_str(&html[i..lt]);
        if html[lt..].starts_with("<!--") {
            match html[lt + 4..].find("-->") {
                Some(e) => i = lt + 4 + e + 3,
                None => break,
            }
            continue;
        }
        let name_start = lt + if html[lt + 1..].starts_with('/') { 2 } else { 1 };
        let name_len = lower[name_start..].bytes().take_while(|b| b.is_ascii_alphanumeric()).count();
        if name_len == 0 {
            // not a tag (`a < b`, `<!doctype>`, `<?xml`): keep '<' only for plain text
            if !html[lt + 1..].starts_with(['!', '?']) {
                out.push('<');
                i = lt + 1;
                continue;
            }
        }
        let name = &lower[name_start..name_start + name_len];
        let Some(gt) = html[lt..].find('>') else { break };
        let tag_end = lt + gt + 1;
        i = tag_end;
        if !lower[lt + 1..].starts_with('/') && SKIP_TAGS.contains(&name) {
            let close = format!("</{}", name);
            match lower[tag_end..].find(&close) {
                Some(c) => match html[tag_end + c..].find('>') {
                    Some(g) => i = tag_end + c + g + 1,
                    None => break,
                },
                None => break,
            }
        } else if BLOCK_TAGS.contains(&name) {
            out.push('\n');
        }
    }
    decode_entities(&out)
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

async fn fetch_preview(url: &str) -> Result<LinkPreview, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    // Guard the initial target before touching the network.
    validate_public_url(&parsed)?;

    let client = public_client(10)?;
    let resp = client.get(parsed).send().await.map_err(fetch_err)?;
    let base = resp.url().clone();
    let body = resp.text().await.map_err(fetch_err)?;
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
    let lower = html.to_ascii_lowercase();
    let key_lower = key.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<meta") {
        let start = from + rel;
        let end = lower[start..].find('>').map(|e| start + e + 1).unwrap_or(html.len());
        let tag = &html[start..end];
        let tlow = tag.to_ascii_lowercase();
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
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let gt = lower[start..].find('>')? + start + 1;
    let end = lower[gt..].find("</title>")? + gt;
    let t = decode_entities(html[gt..end].trim());
    if t.is_empty() { None } else { Some(t) }
}

/// Value of an HTML attribute within a single tag (quoted or unquoted).
fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
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
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<link") {
        let start = from + rel;
        let end = lower[start..].find('>').map(|e| start + e + 1).unwrap_or(html.len());
        let tag = &html[start..end];
        let tlow = tag.to_ascii_lowercase();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_drops_scripts_styles_and_nav() {
        let t = extract_readable_text("<nav>Menu</nav><script>evil()</script><style>p{}</style><p>Kakashi leads Team 7.</p>");
        assert!(t.contains("Kakashi leads Team 7."));
        assert!(!t.contains("evil") && !t.contains("Menu") && !t.contains("p{}"));
    }

    #[test]
    fn extract_decodes_entities_and_breaks_blocks() {
        assert_eq!(extract_readable_text("<p>Naruto &amp; Sasuke</p><p>Rivals</p>").trim(), "Naruto & Sasuke\nRivals");
    }

    #[test]
    fn extract_handles_unclosed_tags_without_panicking() {
        assert_eq!(extract_readable_text("<p>a<script>never closed"), "a");
        assert_eq!(extract_readable_text("<p>a<b"), "a");
        assert_eq!(extract_readable_text("x <!-- open"), "x");
    }

    #[test]
    fn extract_handles_non_ascii() {
        assert_eq!(extract_readable_text("<p>ナルト — Café</p><script>İ</script><p>İstanbul</p>"), "ナルト — Café\nİstanbul");
    }

    #[test]
    fn metadata_helpers_survive_length_changing_lowercase() {
        assert_eq!(title_tag("<p>İİİ</p><title>X</title>"), Some("X".to_string()));
        assert_eq!(
            meta("<p>İİİ</p><meta property=\"og:title\" content=\"Y\">", "og:title"),
            Some("Y".to_string())
        );
        assert_eq!(attr("<a İ href=\"z\">", "href"), Some("z".to_string()));
        assert!(favicon("İİ<link rel=\"icon\" href=\"/f.png\">", &reqwest::Url::parse("http://e.com/").unwrap()).ends_with("/f.png"));
    }

    #[test]
    fn fetch_errors_never_carry_the_url() {
        let err = tauri::async_runtime::block_on(async {
            reqwest::Client::new().get("http://127.0.0.1:1/private?token=s3cret").send().await.unwrap_err()
        });
        assert!(err.to_string().contains("s3cret"), "precondition: reqwest embeds the URL");
        let msg = fetch_err(err);
        assert!(!msg.contains("s3cret") && !msg.contains("127.0.0.1"), "{}", msg);
        assert!(validate_public_url(&reqwest::Url::parse("ftp://e.com/s3cret").unwrap()).unwrap_err().find("s3cret").is_none());
    }

    #[test]
    fn public_url_guard_blocks_localhost() {
        assert!(validate_public_url(&reqwest::Url::parse("http://127.0.0.1/").unwrap()).is_err());
    }
}
