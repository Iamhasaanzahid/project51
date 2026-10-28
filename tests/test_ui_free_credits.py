"""Unit tests for the curated free-AI credits catalogue (no Streamlit runtime needed)."""
from __future__ import annotations

from ui.free_credits import FREE_AI_CATEGORIES, FREE_AI_CREDITS_URL, FREE_AI_PROVIDERS, FreeAiProvider


def test_catalogue_is_populated():
    assert FREE_AI_PROVIDERS
    assert len(FREE_AI_CATEGORIES) >= 1


def test_every_provider_has_required_fields():
    for provider in FREE_AI_PROVIDERS:
        assert isinstance(provider, FreeAiProvider)
        assert provider.name.strip()
        assert provider.category.strip()
        assert provider.blurb.strip()
        assert provider.free_allowance.strip()
        assert provider.url.startswith("http")


def test_catalogue_covers_expected_categories():
    assert set(FREE_AI_CATEGORIES) == {
        "Large Language Models (LLMs)",
        "Image Generation",
        "Audio & Speech",
        "Embeddings",
        "Multi-Modal & All-in-One",
        "Local Proxies & Gateways",
    }


def test_credits_source_url_is_the_awesome_list():
    assert FREE_AI_CREDITS_URL == "https://github.com/oniondas/Awesome-Hidden-AI-Credits-Free"
