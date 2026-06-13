# Jnana local Whisper server

A tiny OpenAI-compatible transcription server (FastAPI + faster-whisper) for
Jnana's "Local Whisper server" transcription backend. Jnana POSTs audio to
`{baseUrl}/audio/transcriptions`; this exposes `/v1/audio/transcriptions` and
returns `{ "text": ... }`.

## GPU (recommended for lectures)

Needs an NVIDIA GPU, a current driver, and Docker with GPU support (Docker
Desktop + WSL2 on Windows). ~1–2 min for a 20-minute lecture.

```bash
docker build -t jnana-whisper .
docker run --gpus all -p 8000:8000 -v whisper-cache:/root/.cache jnana-whisper
```

## CPU (works anywhere)

Fine for short clips; long audio is slow (roughly real-time). Use a smaller
model (`base`/`tiny`) to speed it up.

```bash
docker build -f Dockerfile.cpu -t jnana-whisper-cpu .
docker run -p 8000:8000 -v whisper-cache:/root/.cache jnana-whisper-cpu
```

## Config (env vars)

| Var | Default | Notes |
|---|---|---|
| `WHISPER_MODEL` | `small` | `tiny` · `base` · `small` · `medium` · `large-v3` |
| `WHISPER_DEVICE` | `cpu` | `cpu` or `cuda` (the Dockerfiles set this) |
| `WHISPER_COMPUTE_TYPE` | `int8` | `int8` for CPU, `float16` for GPU |

Override at run time, e.g. a faster CPU model:

```bash
docker run -p 8000:8000 -e WHISPER_MODEL=base jnana-whisper-cpu
```

## Point Jnana at it

AI Quick Settings → Transcription:
- Backend: **Local Whisper server**
- Base URL: `http://127.0.0.1:8000/v1`  (use `127.0.0.1`, not `localhost`)
- API key: blank

Check it's reachable: `curl http://127.0.0.1:8000/docs`
