# GPU image — fast enough for lecture-length audio (~1–2 min for 20 min of audio).
# Requires an NVIDIA GPU + current driver, and `docker run --gpus all`.
# faster-whisper's ctranslate2 backend needs CUDA 12 + cuDNN 8, which this base provides.
FROM nvidia/cuda:12.2.2-cudnn8-runtime-ubuntu22.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

ENV WHISPER_MODEL=small \
    WHISPER_DEVICE=cuda \
    WHISPER_COMPUTE_TYPE=float16

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
