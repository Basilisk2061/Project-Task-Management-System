from sqlalchemy import Engine, inspect, text

from app.constants import DEFAULT_DOCUMENT_TYPE


LEGACY_ASSISTANT_CONVERSATION_TITLE = "Previous Project Assistant Chat"


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

        assistant_message_columns = {
            column["name"]
            for column in inspect(connection).get_columns("assistant_messages")
        }
        if "conversation_id" not in assistant_message_columns:
            connection.execute(text(
                "ALTER TABLE assistant_messages ADD COLUMN conversation_id INTEGER "
                "REFERENCES assistant_conversations(id)"
            ))

        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_assistant_messages_conversation_created "
            "ON assistant_messages (conversation_id, created_at, id)"
        ))

        legacy_projects = connection.execute(text(
            "SELECT am.project_id, p.created_by, MIN(am.created_at), MAX(am.created_at) "
            "FROM assistant_messages am "
            "JOIN projects p ON p.id = am.project_id "
            "WHERE am.conversation_id IS NULL "
            "GROUP BY am.project_id, p.created_by"
        )).all()
        for project_id, created_by, created_at, updated_at in legacy_projects:
            conversation_id = connection.execute(text(
                "SELECT id FROM assistant_conversations "
                "WHERE project_id = :project_id AND title = :title "
                "ORDER BY id LIMIT 1"
            ), {
                "project_id": project_id,
                "title": LEGACY_ASSISTANT_CONVERSATION_TITLE,
            }).scalar_one_or_none()
            if conversation_id is None:
                result = connection.execute(text(
                    "INSERT INTO assistant_conversations "
                    "(project_id, created_by, title, created_at, updated_at) "
                    "VALUES (:project_id, :created_by, :title, :created_at, :updated_at)"
                ), {
                    "project_id": project_id,
                    "created_by": created_by,
                    "title": LEGACY_ASSISTANT_CONVERSATION_TITLE,
                    "created_at": created_at,
                    "updated_at": updated_at,
                })
                conversation_id = result.lastrowid
            connection.execute(text(
                "UPDATE assistant_messages SET conversation_id = :conversation_id "
                "WHERE project_id = :project_id AND conversation_id IS NULL"
            ), {
                "conversation_id": conversation_id,
                "project_id": project_id,
            })
