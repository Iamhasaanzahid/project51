"""Curated catalogue of hidden AI platforms with generous free token allowances.

Mirrors the community list at:
https://github.com/oniondas/Awesome-Hidden-AI-Credits-Free

Every entry points to a platform / API that hands out massive free token
allowances, daily credits or generous free tiers (the catalogue totals to
~10 Billion free tokens per month).
"""
from __future__ import annotations

from dataclasses import dataclass

FREE_AI_CREDITS_URL = "https://github.com/oniondas/Awesome-Hidden-AI-Credits-Free"


@dataclass(frozen=True)
class FreeAiProvider:
    """One hidden AI platform / API from the curated free-credits list."""

    name: str
    category: str
    blurb: str
    url: str
    free_allowance: str


FREE_AI_PROVIDERS: tuple[FreeAiProvider, ...] = (
    # ------------------------------------------------------------------ LLMs
    FreeAiProvider(
        name="Flint",
        category="Large Language Models (LLMs)",
        blurb="Flint 40B Free — open-weight reasoning model served free via OpenCode with a strong balance of speed and intelligence.",
        url="https://opencode.ai",
        free_allowance="40B free tokens",
    ),
    FreeAiProvider(
        name="OmniRush",
        category="Large Language Models (LLMs)",
        blurb="Desktop app + CLI giving instant access to GPT 6 Astra, GPT 6 Sol and GPT-5.6 Sol without an API key.",
        url="https://omnirush.ai/console?ref=D633FH86",
        free_allowance="5M tokens/day (15M weekly cap)",
    ),
    FreeAiProvider(
        name="Aerolink",
        category="Large Language Models (LLMs)",
        blurb="API proxy giving Claude access (Opus 4.8, Sonnet 4.6, Haiku) with a $35 signup bonus plus $140 rolling credits.",
        url="https://aerolink.lat/register?ref=7KR4BGK",
        free_allowance="$175 total credits",
    ),
    FreeAiProvider(
        name="AgentRouter",
        category="Large Language Models (LLMs)",
        blurb="API aggregator giving instant access to Claude Opus 4.8 / Opus 5, DeepSeek V4 and GLM 5.1.",
        url="https://agentrouter.org/register?aff=qwl4",
        free_allowance="$175 starting bonus",
    ),
    FreeAiProvider(
        name="FreeLLMAPI",
        category="Large Language Models (LLMs)",
        blurb="Access 81 different free models and 114 endpoints with a huge allowance of ~1.7B free tokens per month.",
        url="https://freellmapi.co/",
        free_allowance="~1.7B tokens/mo",
    ),
    FreeAiProvider(
        name="Freebuff",
        category="Large Language Models (LLMs)",
        blurb="Ad-supported CLI for free access to DeepSeek V4, MiMo 2.5, Kimi K2.6 and MiniMax M3. Unlimited usage.",
        url="https://freebuff.com/",
        free_allowance="Unlimited (terminal text ads)",
    ),
    FreeAiProvider(
        name="Groq",
        category="Large Language Models (LLMs)",
        blurb="Super fast LPU engine for open-source models. Free tier: 30 requests/min, 14,400 requests/day.",
        url="https://console.groq.com/keys",
        free_allowance="14,400 requests/day",
    ),
    FreeAiProvider(
        name="Cohere",
        category="Large Language Models (LLMs)",
        blurb="Enterprise LLMs and embeddings, totally free for non-commercial prototyping (up to 1,000 calls/month).",
        url="https://dashboard.cohere.com/",
        free_allowance="1,000 calls/mo",
    ),
    FreeAiProvider(
        name="Mistral AI",
        category="Large Language Models (LLMs)",
        blurb="Free 'Experiment' tier on La Plateforme. Strict rate limits; data may be used for training.",
        url="https://console.mistral.ai/",
        free_allowance="Free experiment tier",
    ),
    FreeAiProvider(
        name="Google AI Studio",
        category="Large Language Models (LLMs)",
        blurb="Really solid free tier for Gemini models. Up to 15 requests and 1M tokens per minute for free.",
        url="https://aistudio.google.com/",
        free_allowance="1M tokens/min",
    ),
    FreeAiProvider(
        name="Sarvam AI",
        category="Large Language Models (LLMs)",
        blurb="Indian AI startup with great Indic language LLMs. New users get a ₹1000 free credit bonus.",
        url="https://sarvam.ai/",
        free_allowance="₹1000 credit bonus",
    ),
    FreeAiProvider(
        name="Zenmux",
        category="Large Language Models (LLMs)",
        blurb="Provides free access to models such as deepseek/deepseek-v4-flash-vision-exp-free and z-ai/glm-5.3-free.",
        url="https://zenmux.ai/invite/DG81MD",
        free_allowance="Free model access",
    ),
    FreeAiProvider(
        name="OpenRouter",
        category="Large Language Models (LLMs)",
        blurb="Unified model gateway offering free access to models including stealth/space-bunny-alpha and qwen/qwen3.8-27b:free.",
        url="https://openrouter.ai/",
        free_allowance="Free tier models",
    ),
    FreeAiProvider(
        name="TokenRouter",
        category="Large Language Models (LLMs)",
        blurb="API aggregator providing free access to models including qwen/qwen3.8-max-free.",
        url="https://www.tokenrouter.com/models/",
        free_allowance="Free models",
    ),
    # ----------------------------------------------------------- Image Gen
    FreeAiProvider(
        name="Tensor.art",
        category="Image Generation",
        blurb="Free platform for image generation and hosting models. 50 free generation credits every day.",
        url="https://tensor.art/",
        free_allowance="50 credits/day",
    ),
    FreeAiProvider(
        name="Leonardo.ai",
        category="Image Generation",
        blurb="Image generation tool giving 150 fast tokens daily on its free tier.",
        url="https://leonardo.ai/",
        free_allowance="150 tokens/day",
    ),
    FreeAiProvider(
        name="Stability AI",
        category="Image Generation",
        blurb="Company behind Stable Diffusion. 25 free starting credits for the API, enough for about 25 image generations.",
        url="https://platform.stability.ai/",
        free_allowance="25 credits",
    ),
    FreeAiProvider(
        name="Google Flow",
        category="Image Generation",
        blurb="Free creative studio using Imagen 3 with a daily credit allowance for high-quality images.",
        url="https://labs.google/fx/tools/flow",
        free_allowance="Daily credits",
    ),
    # --------------------------------------------------------- Audio & Speech
    FreeAiProvider(
        name="Deepgram",
        category="Audio & Speech",
        blurb="Fast speech-to-text API. $200 in free credits on signup, covering over 45,000 minutes of transcription.",
        url="https://deepgram.com/",
        free_allowance="$200 credits",
    ),
    FreeAiProvider(
        name="Fish Audio",
        category="Audio & Speech",
        blurb="Free unlimited S2.1 Pro TTS API (valid until 31st Aug).",
        url="https://fish.audio/?aff=5L4U4NBNLNSEC",
        free_allowance="Unlimited TTS",
    ),
    FreeAiProvider(
        name="Sarvam AI",
        category="Audio & Speech",
        blurb="Indian AI startup providing Indic Speech-to-Text and Text-to-Speech APIs with a ₹1000 free credit bonus.",
        url="https://sarvam.ai/",
        free_allowance="₹1000 credit bonus",
    ),
    # ------------------------------------------------------------- Embeddings
    FreeAiProvider(
        name="Voyage AI",
        category="Embeddings",
        blurb="Embedding models optimised for RAG with a very generous free tier of 50M tokens per month.",
        url="https://dash.voyageai.com/",
        free_allowance="50M tokens/mo",
    ),
    FreeAiProvider(
        name="Jina AI",
        category="Embeddings",
        blurb="Embedding API giving 10M free tokens to test things out.",
        url="https://jina.ai/embeddings",
        free_allowance="10M tokens",
    ),
    # --------------------------------------------------- Multi-Modal & All-in-One
    FreeAiProvider(
        name="Pollinations.ai",
        category="Multi-Modal & All-in-One",
        blurb="Single API for text, image, audio and video generation, featuring GPT 5.6 Luna, Tera and Sol.",
        url="https://pollinations.ai/",
        free_allowance="Generous free tier",
    ),
    FreeAiProvider(
        name="Hugging Face",
        category="Multi-Modal & All-in-One",
        blurb="Main hub for ML models. Free Serverless Inference API to test models (limits around 5M tokens/month).",
        url="https://huggingface.co/settings/tokens",
        free_allowance="~5M tokens/mo",
    ),
    FreeAiProvider(
        name="Sarvam AI",
        category="Multi-Modal & All-in-One",
        blurb="Unified platform for Indian language LLMs, speech and document digitisation. ₹1000 in starting credits.",
        url="https://sarvam.ai/",
        free_allowance="₹1000 credit bonus",
    ),
    # --------------------------------------------------- Local Proxies & Gateways
    FreeAiProvider(
        name="OmniRoute",
        category="Local Proxies & Gateways",
        blurb="Free MIT AI gateway: one endpoint, 375 providers (150+ free), 1,400+ models. Quota-aware auto-fallback, RTK+Caveman compression saves 15-95% tokens.",
        url="https://omniroute.online",
        free_allowance="~$1.62B free tokens/mo",
    ),
    FreeAiProvider(
        name="gaca-core",
        category="Local Proxies & Gateways",
        blurb="Universal AI proxy. Clone the repo, add your free API keys (like Gemini, Groq, Mistral) and use it as a local OpenAI-compatible endpoint.",
        url="https://github.com/gacabartosz/gaca-core",
        free_allowance="Uses your free keys",
    ),
    FreeAiProvider(
        name="LiteLLM",
        category="Local Proxies & Gateways",
        blurb="Run a local server to combine all your free API keys into one OpenAI-compatible endpoint.",
        url="https://github.com/BerriAI/litellm",
        free_allowance="Uses your free keys",
    ),
)

FREE_AI_CATEGORIES: tuple[str, ...] = tuple(dict.fromkeys(p.category for p in FREE_AI_PROVIDERS))
