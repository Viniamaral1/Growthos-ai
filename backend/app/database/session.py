from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


DATABASE_URL = "sqlite:///./growthos.db"


class Base(DeclarativeBase):
    """
    Base class inherited by every SQLAlchemy database model.
    """

    pass


engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,
    },
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """
    Create a database session for one API request.

    The session is closed automatically when the request finishes.
    """

    database = SessionLocal()

    try:
        yield database
    finally:
        database.close()