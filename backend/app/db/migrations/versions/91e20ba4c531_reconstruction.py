"""Persist reconstruction jobs and their confirmed input identity."""

import sqlalchemy as sa
from alembic import op

revision = "91e20ba4c531"
down_revision = "f0eca7d75635"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("reconstruction", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("sessions", "reconstruction")
