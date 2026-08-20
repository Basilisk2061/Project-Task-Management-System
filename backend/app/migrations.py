from sqlalchemy import Engine, inspect, text

from app.constants import DEFAULT_DOCUMENT_TYPE


def apply_additive_schema_updates(engine: Engine) -> None:
    """Add Phase 12 columns to existing SQLite databases without replacing data."""
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        inspector = inspect(connection)
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "professional_role" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN professional_role VARCHAR"))

        document_columns = {
            column["name"] for column in inspect(connection).get_columns("documents")
        }
        if "document_type" not in document_columns:
            connection.execute(text(
                "ALTER TABLE documents ADD COLUMN document_type VARCHAR "
                f"NOT NULL DEFAULT '{DEFAULT_DOCUMENT_TYPE}'"
            ))
