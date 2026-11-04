"""Converts database rows to API views."""

from app.db.models import SessionRow
from app.domain.session import SessionView


def session_view(row: SessionRow) -> SessionView:
    return SessionView.model_validate(
        {
            "id": row.id,
            "status": row.status,
            "product": row.product,
            "photos": [
                {"id": p.id, "width": p.width, "height": p.height, "quality": p.quality}
                for p in row.photos
            ],
            "coverage": row.coverage,
            "reconstruction": row.reconstruction,
            "clarifications": row.clarifications or [],
            "answers": row.answers,
            "scene": row.scene,
            "placement": row.placement,
            "renders": row.renders or [],
            "error": row.error,
        }
    )
