# Sample local plugin catalog

A tiny **offline** catalog for testing Settings → Plugins → **Browse** and
**Updates** without hosting anything. `catalog.json` lists one plugin
(`sample-checklist`) whose `downloadUrl` is the local `sample-checklist.zip` in
this folder (repackaged from `../sample-plugin`).

## Use it

1. Settings → Plugins → **Browse**.
2. Paste this absolute path into the **Catalog URL** box and press **Fetch**:
   `C:/Jnana-project/Jnana---A-Second-brain/examples/sample-catalog/catalog.json`
   (the loader reads http(s) URLs *or* local paths).
3. Click **Install** on "Sample Checklist" → approve consent → it loads and appears
   in **Installed**. Ctrl/⌘-K → **New Checklist**.

## Test Updates

After installing v1.0.0, bump `"version"` in `catalog.json` to `1.1.0`, then open the
**Updates** tab — the plugin shows as upgradable. (Installing re-fetches the same
zip; to ship a genuinely newer build, rebuild `../sample-plugin` with a higher
version and repackage.)

## Repackage the zip

From `../sample-plugin` (after `npm run build`):

```powershell
Compress-Archive -Path .\manifest.json, .\dist -DestinationPath ..\sample-catalog\sample-checklist.zip -Force
```
