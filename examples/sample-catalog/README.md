# Sample local plugin catalog

An **offline** catalog for testing Settings → Plugins → **Browse** and **Updates**
without hosting anything. It lists all three sample plugins, with real `sha256`
hashes, so a catalog install exercises every check on that path: checksum,
manifest-id agreement, permission and host agreement, runtime and **type**
agreement, the **Sandboxed** badge, and the consent prompt built from the
package's own manifest.

That matters because those checks only run for a *catalog* install — a local
folder or a `.zip` import skips most of them, and the curated registry is still
empty.

## Rebuild it

```
node examples/sample-catalog/build.mjs
```

Zips each sample (manifest + its code), hashes it, and regenerates `catalog.json`
with each manifest's real `runtime`, `type`, `homepage`, `permissions` and `hosts`.
Dependency-free — it writes the zips itself. Re-run it after editing either
sample, or the checksum stops matching and the app will (correctly) refuse to
install.

## Use it

1. Settings → Plugins → **Browse**.
2. Paste the absolute path to `catalog.json` in the **Catalog URL** box and press
   **Fetch** (the loader reads http(s) URLs *or* local paths). The script prints
   the path to use.
3. All three appear. **Sample Worker** and **Dusk & Parchment** should carry a
   green **Sandboxed** badge and a **Source** link; Dusk & Parchment is a theme,
   so its consent prompt should say it asks for nothing else.
4. **Install** → the consent prompt shows what that package declares → it loads and
   appears under **Installed**.

## What to try

**A tampered download is refused.** Edit any file inside one of the zips (or just
bump a byte), without re-running the build script, then Install: the app refuses
with a checksum error instead of running it.

**A lying listing is refused.** Set `"runtime": "worker"` on the Sample Checklist
entry and Install: refused, because that package runs on the main thread. The
badge can't overstate what you're installing.

**A mislabelled type is refused.** Set `"type": "theme"` on the Sample Checklist
entry and Install: refused, because that package says `utility`. The type is what
the Installed list groups by and what the consent prompt reasons about, so a
listing cannot claim one thing and ship another.

**Undeclared permissions are refused.** Remove `"notes"` from the Sample Worker
entry's `permissions` (leaving it in the package's manifest) and Install: refused,
because the package asks for more than the listing advertised.

**Updates.** Install v1.0.0, then bump `"version"` in `catalog.json` to `1.1.0`
and open the **Updates** tab — it shows as upgradable. If the newer version's
package declares a capability the installed one didn't, the update re-prompts
instead of quietly widening what the plugin may do.

## Note

`sample-plugin.zip`, `sample-worker-plugin.zip` and `sample-theme.zip` are
generated — don't edit them by hand, edit the sample folders and re-run the build
script.
