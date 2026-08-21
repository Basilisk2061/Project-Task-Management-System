from pathlib import Path

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def load_environment() -> None:
    # Load backend credentials before routes and integrations are initialized.
    load_dotenv(BACKEND_ROOT / ".env", override=False)
