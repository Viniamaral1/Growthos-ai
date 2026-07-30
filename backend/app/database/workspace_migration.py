from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


WORKSPACE_COLUMNS: dict[str, str] = {
    "business_idea": "TEXT",
    "problem_statement": "TEXT",
    "proposed_solution": "TEXT",
    "country": "VARCHAR(100)",
    "region": "VARCHAR(150)",
    "city": "VARCHAR(150)",
    "business_model": "VARCHAR(150)",
    "launch_budget": "NUMERIC(14, 2)",
    "budget_currency": "VARCHAR(3)",
    "primary_goal": "VARCHAR(150)",
    "development_stage": "VARCHAR(50)",
    "business_plan_json": "TEXT",
    "business_plan_model": "VARCHAR(150)",
    "business_plan_generated_at": "DATETIME",
    "updated_at": "DATETIME",
}


def migrate_company_to_workspace(engine: Engine) -> None:
    """Add nullable workspace columns without deleting current SQLite data."""

    inspector = inspect(engine)

    if "companies" not in inspector.get_table_names():
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns("companies")
    }

    with engine.begin() as connection:
        for column_name, column_type in WORKSPACE_COLUMNS.items():
            if column_name in existing_columns:
                continue

            connection.execute(
                text(
                    "ALTER TABLE companies "
                    f"ADD COLUMN {column_name} {column_type}"
                )
            )

        connection.execute(
            text(
                "UPDATE companies "
                "SET updated_at = created_at "
                "WHERE updated_at IS NULL"
            )
        )



def migrate_chat_message_executive_role(
    engine: Engine,
) -> None:
    """Add executive identity without deleting existing chat history."""

    inspector = inspect(engine)

    if "chat_messages" not in inspector.get_table_names():
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns(
            "chat_messages"
        )
    }

    if "executive_role" in existing_columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE chat_messages "
                "ADD COLUMN executive_role VARCHAR(40)"
            )
        )



CHAT_MESSAGE_MEMORY_COLUMNS: dict[str, str] = {
    "confidence_level": "VARCHAR(20)",
    "confidence_score": "INTEGER",
    "confidence_reason": "TEXT",
}


def migrate_chat_message_confidence(
    engine: Engine,
) -> None:
    """Add confidence metadata without deleting chat history."""

    inspector = inspect(engine)

    if "chat_messages" not in inspector.get_table_names():
        return

    existing_columns = {
        column["name"]
        for column in inspector.get_columns(
            "chat_messages"
        )
    }

    with engine.begin() as connection:
        for column_name, column_type in (
            CHAT_MESSAGE_MEMORY_COLUMNS.items()
        ):
            if column_name in existing_columns:
                continue

            connection.execute(
                text(
                    "ALTER TABLE chat_messages "
                    f"ADD COLUMN {column_name} {column_type}"
                )
            )


def migrate_research_chat_integration(engine: Engine) -> None:
    """Link conversations to guided research without deleting existing data."""
    inspector = inspect(engine)
    if "conversations" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("conversations")}
    if "active_research_project_id" not in existing:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE conversations ADD COLUMN active_research_project_id INTEGER"
            ))
