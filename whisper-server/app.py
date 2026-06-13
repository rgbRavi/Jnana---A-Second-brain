import os
import tempfile

from fastapi import FastAPI, File, UploadFile
from faster_whisper import WhisperModel

app = FastAPI()

# Model + device come from env so the same code runs on CPU or GPU:
#   WHISPER_MODEL         tiny | base | small | medium | large-v3
#   WHISPER_DEVICE        cpu | cuda
#   WHISPER_COMPUTE_TYPE  int8 (cpu) | float16 (cuda)
print("Loading Whisper model…")
model = WhisperModel(
    os.environ.get("WHISPER_MODEL", "small"),
    device=os.environ.get("WHISPER_DEVICE", "cpu"),
    compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
)
print("Model loaded")


# Jnana POSTs the audio to {baseUrl}/audio/transcriptions, so with a base URL of
# http://127.0.0.1:8000/v1 this route is the match. The multipart field is `file`
# and the response is {"text": ...} — the OpenAI-compatible contract.
@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        temp_path = tmp.name

    try:
        segments, info = model.transcribe(temp_path)
        text = " ".join(segment.text for segment in segments).strip()
        return {"text": text, "language": info.language}
    finally:
        os.remove(temp_path)
