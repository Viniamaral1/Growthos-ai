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
