// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

//! Saved provider presets per AI section. Presets (and their API keys) live only in
//! `ai_config.json` on the Rust side; the WebView sees `AiPresetPublic` (no key).

use super::ai::{normalize_base_url, persist, AiConfig, AiConfigPublic, AiPreset, AiState};
use super::web_search::searxng_base;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{command, State};

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn new_id() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{}-{:x}", ms, COUNTER.fetch_add(1, Ordering::Relaxed))
}

const UNKNOWN: &str = "Unknown preset.";

fn presets_mut<'a>(cfg: &'a mut AiConfig, s: &str) -> Result<&'a mut Vec<AiPreset>, String> {
    match s {
        "chat" => Ok(&mut cfg.chat_presets),
        "embedding" => Ok(&mut cfg.embedding_presets),
        "transcription" => Ok(&mut cfg.transcription_presets),
        "deepResearch" => Ok(&mut cfg.deep_research_presets),
        "webSearch" => Ok(&mut cfg.web_search_presets),
        _ => Err(UNKNOWN.into()),
    }
}

/// The live section as a preset (id/name left empty).
fn section_view(cfg: &AiConfig, s: &str) -> Result<AiPreset, String> {
    let mut p = AiPreset::default();
    match s {
        "chat" => {
            p.provider = cfg.chat_provider.clone();
            p.base_url = cfg.chat_base_url.clone();
            p.model = cfg.chat_model.clone();
            p.api_key = cfg.chat_api_key.clone();
            p.system_prompt = cfg.chat_system_prompt.clone();
        }
        "embedding" => {
            p.provider = cfg.embedding_provider.clone();
            p.base_url = cfg.embedding_base_url.clone();
            p.model = cfg.embedding_model.clone();
            p.api_key = cfg.embedding_api_key.clone();
        }
        "transcription" => {
            p.provider = cfg.transcription_provider.clone();
            p.base_url = cfg.transcription_base_url.clone();
            p.model = cfg.transcription_model.clone();
            p.api_key = cfg.transcription_api_key.clone();
        }
        "deepResearch" => {
            p.provider = cfg.deep_research_provider.clone();
            p.base_url = cfg.deep_research_base_url.clone();
            p.model = cfg.deep_research_model.clone();
            p.api_key = cfg.deep_research_api_key.clone();
        }
        "webSearch" => {
            p.provider = cfg.web_search_provider.clone();
            p.base_url = cfg.web_search_base_url.clone();
            p.api_key = cfg.web_search_api_key.clone();
        }
        _ => return Err(UNKNOWN.into()),
    }
    Ok(p)
}

/// Write a preset's fields (including its key) into the live section.
fn write_section(cfg: &mut AiConfig, s: &str, p: &AiPreset) {
    match s {
        "chat" => {
            cfg.chat_provider = p.provider.clone();
            cfg.chat_base_url = p.base_url.clone();
            cfg.chat_model = p.model.clone();
            cfg.chat_api_key = p.api_key.clone();
            cfg.chat_system_prompt = p.system_prompt.clone();
        }
        "embedding" => {
            cfg.embedding_provider = p.provider.clone();
            cfg.embedding_base_url = p.base_url.clone();
            cfg.embedding_model = p.model.clone();
            cfg.embedding_api_key = p.api_key.clone();
        }
        "transcription" => {
            cfg.transcription_provider = p.provider.clone();
            cfg.transcription_base_url = p.base_url.clone();
            cfg.transcription_model = p.model.clone();
            cfg.transcription_api_key = p.api_key.clone();
        }
        "deepResearch" => {
            cfg.deep_research_provider = p.provider.clone();
            cfg.deep_research_base_url = p.base_url.clone();
            cfg.deep_research_model = p.model.clone();
            cfg.deep_research_api_key = p.api_key.clone();
        }
        "webSearch" => {
            cfg.web_search_provider = p.provider.clone();
            cfg.web_search_base_url = p.base_url.clone();
            cfg.web_search_api_key = p.api_key.clone();
        }
        _ => {}
    }
}

fn clean_name(name: &str) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty() {
        Err("Give the preset a name.".into())
    } else {
        Ok(n.to_string())
    }
}

fn same_host(section: &str, a: &AiPreset, b: &AiPreset) -> bool {
    a.provider == b.provider
        && if section == "webSearch" {
            searxng_base(&a.base_url) == searxng_base(&b.base_url)
        } else {
            normalize_base_url(&a.base_url) == normalize_base_url(&b.base_url)
        }
}

fn do_save(cfg: &mut AiConfig, section: &str, name: &str) -> Result<(), String> {
    let name = clean_name(name)?;
    let mut p = section_view(cfg, section)?;
    p.id = new_id();
    p.name = name;
    let id = p.id.clone();
    presets_mut(cfg, section)?.push(p);
    cfg.active_presets.insert(section.into(), id);
    Ok(())
}

fn do_update(cfg: &mut AiConfig, section: &str, id: &str) -> Result<(), String> {
    let mut live = section_view(cfg, section)?;
    let list = presets_mut(cfg, section)?;
    let p = list.iter_mut().find(|p| p.id == id).ok_or(UNKNOWN)?;
    // An empty live key (write-only field) keeps the preset's key only for the same host.
    if live.api_key.is_empty() && same_host(section, p, &live) {
        live.api_key = p.api_key.clone();
    }
    live.id = p.id.clone();
    live.name = p.name.clone();
    *p = live;
    Ok(())
}

fn do_apply(cfg: &mut AiConfig, section: &str, id: &str) -> Result<(), String> {
    let mut p = presets_mut(cfg, section)?
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or(UNKNOWN)?;
    // A preset saved without a key must not erase a live key for the same host (never moves hosts).
    let live = section_view(cfg, section)?;
    if p.api_key.is_empty() && same_host(section, &p, &live) {
        p.api_key = live.api_key;
    }
    write_section(cfg, section, &p);
    cfg.active_presets.insert(section.into(), id.into());
    Ok(())
}

fn do_rename(cfg: &mut AiConfig, section: &str, id: &str, name: &str) -> Result<(), String> {
    let name = clean_name(name)?;
    presets_mut(cfg, section)?
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or(UNKNOWN)?
        .name = name;
    Ok(())
}

fn do_delete(cfg: &mut AiConfig, section: &str, id: &str) -> Result<(), String> {
    let list = presets_mut(cfg, section)?;
    let before = list.len();
    list.retain(|p| p.id != id);
    if list.len() == before {
        return Err(UNKNOWN.into());
    }
    if cfg.active_presets.get(section).map(String::as_str) == Some(id) {
        cfg.active_presets.remove(section);
    }
    Ok(())
}

/// Lock, mutate a clone, persist, then commit — a failed write leaves the live config untouched.
fn run(
    state: &State<'_, AiState>,
    f: impl FnOnce(&mut AiConfig) -> Result<(), String>,
) -> Result<AiConfigPublic, String> {
    let mut cur = state.0.lock().map_err(|e| format!("AI config lock error: {}", e))?;
    let mut next = cur.clone();
    f(&mut next)?;
    persist(&next)?;
    *cur = next;
    Ok(AiConfigPublic::from(&*cur))
}

#[command]
pub fn save_ai_preset(state: State<'_, AiState>, section: String, name: String) -> Result<AiConfigPublic, String> {
    run(&state, |c| do_save(c, &section, &name))
}

#[command]
pub fn update_ai_preset(state: State<'_, AiState>, section: String, id: String) -> Result<AiConfigPublic, String> {
    run(&state, |c| do_update(c, &section, &id))
}

#[command]
pub fn apply_ai_preset(state: State<'_, AiState>, section: String, id: String) -> Result<AiConfigPublic, String> {
    run(&state, |c| do_apply(c, &section, &id))
}

#[command]
pub fn rename_ai_preset(
    state: State<'_, AiState>,
    section: String,
    id: String,
    name: String,
) -> Result<AiConfigPublic, String> {
    run(&state, |c| do_rename(c, &section, &id, &name))
}

#[command]
pub fn delete_ai_preset(state: State<'_, AiState>, section: String, id: String) -> Result<AiConfigPublic, String> {
    run(&state, |c| do_delete(c, &section, &id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::ai::merge_config;

    fn preset(id: &str, base: &str, key: &str) -> AiPreset {
        AiPreset {
            id: id.into(),
            name: "P".into(),
            provider: "openai".into(),
            base_url: base.into(),
            model: "m".into(),
            api_key: key.into(),
            system_prompt: String::new(),
        }
    }

    #[test]
    fn merge_keeps_presets_and_their_keys() {
        let cur = AiConfig { chat_presets: vec![preset("a", "https://a/v1", "k")], ..Default::default() };
        let merged = merge_config(&cur, AiConfig::default());
        assert_eq!(merged.chat_presets.len(), 1);
        assert_eq!(merged.chat_presets[0].api_key, "k");
    }

    #[test]
    fn apply_carries_the_preset_key_across_a_url_change() {
        let mut cfg = AiConfig {
            chat_provider: "openai".into(),
            chat_base_url: "https://a/v1".into(),
            chat_api_key: "live".into(),
            chat_presets: vec![preset("p1", "https://openrouter.ai/api/v1", "or")],
            ..Default::default()
        };
        do_apply(&mut cfg, "chat", "p1").unwrap();
        assert_eq!(cfg.chat_base_url, "https://openrouter.ai/api/v1");
        assert_eq!(cfg.chat_api_key, "or");
        assert_eq!(cfg.active_presets["chat"], "p1");
    }

    #[test]
    fn apply_empty_key_keeps_same_host_live_key_but_clears_other_host() {
        let mk = |live_base: &str| AiConfig {
            chat_provider: "openai".into(),
            chat_base_url: live_base.into(),
            chat_api_key: "live".into(),
            chat_presets: vec![preset("p1", "https://a/v1", "")],
            ..Default::default()
        };
        let mut same = mk("https://a/v1/");
        do_apply(&mut same, "chat", "p1").unwrap();
        assert_eq!(same.chat_api_key, "live");
        let mut other = mk("https://b/v1");
        do_apply(&mut other, "chat", "p1").unwrap();
        assert_eq!(other.chat_api_key, "");
        let mut keyed = AiConfig { chat_presets: vec![preset("p1", "https://a/v1", "pk")], chat_api_key: "live".into(), ..Default::default() };
        do_apply(&mut keyed, "chat", "p1").unwrap();
        assert_eq!(keyed.chat_api_key, "pk");
    }

    #[test]
    fn update_keeps_old_key_only_for_same_host() {
        let mk = |live_base: &str| AiConfig {
            chat_provider: "openai".into(),
            chat_base_url: live_base.into(),
            chat_model: "new".into(),
            chat_presets: vec![preset("p1", "https://a/v1", "old")],
            ..Default::default()
        };
        let mut same = mk("https://a/v1/");
        do_update(&mut same, "chat", "p1").unwrap();
        assert_eq!(same.chat_presets[0].api_key, "old");
        assert_eq!(same.chat_presets[0].model, "new");
        assert_eq!(same.chat_presets[0].name, "P");
        let mut other = mk("https://b/v1");
        do_update(&mut other, "chat", "p1").unwrap();
        assert_eq!(other.chat_presets[0].api_key, "");
    }

    #[test]
    fn save_snapshots_the_live_section_and_web_search_has_no_model() {
        let mut cfg = AiConfig {
            chat_model: "gpt".into(),
            chat_system_prompt: "be brief".into(),
            web_search_provider: "brave".into(),
            web_search_api_key: "wk".into(),
            ..Default::default()
        };
        do_save(&mut cfg, "chat", "  Mine ").unwrap();
        let p = &cfg.chat_presets[0];
        assert_eq!((p.name.as_str(), p.model.as_str(), p.system_prompt.as_str()), ("Mine", "gpt", "be brief"));
        assert_eq!(cfg.active_presets["chat"], p.id);
        do_save(&mut cfg, "webSearch", "W").unwrap();
        let w = &cfg.web_search_presets[0];
        assert_eq!((w.model.as_str(), w.api_key.as_str()), ("", "wk"));
        assert!(do_save(&mut cfg, "chat", "  ").is_err());
        assert_eq!(do_apply(&mut cfg, "nope", "x").unwrap_err(), "Unknown preset.");
    }

    #[test]
    fn apply_does_not_touch_transcribe_on_record() {
        let mut cfg = AiConfig {
            transcribe_on_record: true,
            transcription_presets: vec![preset("t", "http://localhost:8000/v1", "")],
            ..Default::default()
        };
        do_apply(&mut cfg, "transcription", "t").unwrap();
        assert!(cfg.transcribe_on_record);
    }

    #[test]
    fn delete_clears_active_and_leaves_live_config() {
        let mut cfg = AiConfig {
            chat_base_url: "https://a/v1".into(),
            chat_presets: vec![preset("p1", "https://a/v1", "k")],
            ..Default::default()
        };
        cfg.active_presets.insert("chat".into(), "p1".into());
        do_delete(&mut cfg, "chat", "p1").unwrap();
        assert!(cfg.chat_presets.is_empty() && !cfg.active_presets.contains_key("chat"));
        assert_eq!(cfg.chat_base_url, "https://a/v1");
        assert!(do_delete(&mut cfg, "chat", "p1").is_err());
    }

    #[test]
    fn old_config_json_loads_with_empty_presets() {
        let c = serde_json::from_str::<AiConfig>("{\"chatProvider\":\"openai\"}").unwrap();
        assert!(c.chat_presets.is_empty() && c.web_search_presets.is_empty());
        assert!(c.chat_system_prompt.is_empty() && c.global_system_prompt.is_empty());
        assert!(c.active_presets.is_empty());
    }

    #[test]
    fn public_view_never_contains_keys() {
        let cfg = AiConfig {
            chat_api_key: "SECRET-LIVE".into(),
            chat_presets: vec![preset("p", "https://a", "SECRET-PRESET")],
            ..Default::default()
        };
        let json = serde_json::to_string(&AiConfigPublic::from(&cfg)).unwrap();
        assert!(!json.contains("SECRET"));
        assert!(json.contains("\"hasApiKey\":true") && json.contains("\"deepResearch\":[]"));
    }
}
