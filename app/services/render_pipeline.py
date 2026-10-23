"""GPU render pipeline (ControlNet SDXL).

Models are loaded lazily on first use, pinned to a CUDA device, and shared by a
single worker process. The worker container is non-root, read-only and has no
network access except to the model cache and Redis/S3 endpoints.
"""
from __future__ import annotations

import hashlib
import io
import logging
import threading

from PIL import Image

from app.core.config import settings

logger = logging.getLogger("aifabric.render_pipeline")

DEFAULT_PROMPT = (
    "high fidelity fashion fabric texture, studio lighting, seamless pattern, "
    "photorealistic, 8k, product photography"
)


class RenderPipelineUnavailable(RuntimeError):
    pass


class FabricRenderPipeline:
    _instance: FabricRenderPipeline | None = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._pipe = None

    @classmethod
    def instance(cls) -> FabricRenderPipeline:
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    # ------------------------------------------------------------------ load
    def _load(self) -> None:
        if self._pipe is not None:
            return
        try:
            import torch
            from diffusers import ControlNetModel, StableDiffusionXLControlNetPipeline
        except ImportError as exc:  # pragma: no cover
            raise RenderPipelineUnavailable("diffusers/torch not installed in this image") from exc

        if not torch.cuda.is_available():
            raise RenderPipelineUnavailable("CUDA device not available")

        logger.info("Loading ControlNet SDXL pipeline")
        controlnet = ControlNetModel.from_pretrained(
            settings.CONTROLNET_MODEL_ID,
            torch_dtype=torch.float16,
            variant="fp16",
            use_safetensors=True,
        )
        pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
            settings.SDXL_MODEL_ID,
            controlnet=controlnet,
            torch_dtype=torch.float16,
            variant="fp16",
            use_safetensors=True,
        )
        pipe.to("cuda")
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except Exception as exc:  # xformers optional; plain attention still works
            logger.debug("xformers unavailable, using default attention: %s", exc)
        pipe.enable_vae_slicing()
        pipe.set_progress_bar_config(disable=True)
        self._pipe = pipe
        logger.info("Render pipeline ready")

    # ---------------------------------------------------------------- render
    def render(
        self,
        fabric_bytes: bytes,
        prompt: str = "",
        steps: int = 30,
        guidance: float = 5.5,
        controlnet_scale: float = 0.8,
    ) -> bytes:
        import torch

        self._load()
        assert self._pipe is not None

        steps = max(10, min(int(steps), settings.RENDER_MAX_STEPS))
        prompt = (prompt or DEFAULT_PROMPT)[: settings.RENDER_MAX_PROMPT_CHARS]

        with Image.open(io.BytesIO(fabric_bytes)) as src:
            control = src.convert("RGB").resize((1024, 1024))

        seed = int(hashlib.sha256(fabric_bytes + prompt.encode()).hexdigest()[:8], 16)
        generator = torch.Generator(device="cuda").manual_seed(seed)

        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
            result = self._pipe(
                prompt=prompt,
                image=control,
                num_inference_steps=steps,
                guidance_scale=guidance,
                controlnet_conditioning_scale=controlnet_scale,
                generator=generator,
            ).images[0]

        out = io.BytesIO()
        result.save(out, format="PNG", optimize=True)
        return out.getvalue()


pipeline = FabricRenderPipeline.instance()
