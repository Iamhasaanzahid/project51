from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKey


class RenderJob(Base, UUIDPrimaryKey, TimestampMixin):
    """GPU render job. Only sanitised, metadata-free assets may be referenced."""

    __tablename__ = "render_jobs"

    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)

    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False, index=True)
    # queued | processing | completed | failed | rejected

    source_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    result_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    pipeline: Mapped[str] = mapped_column(String(64), default="idm_vton_sdxl", nullable=False)
    prompt: Mapped[str] = mapped_column(String(2000), default="", nullable=False)
    gpu_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
