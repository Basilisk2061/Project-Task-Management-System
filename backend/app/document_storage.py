import shutil
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_UPLOAD_ROOT = (BACKEND_ROOT / "uploads" / "projects").resolve()


def get_project_upload_directory(project_id: int) -> Path:
    directory = (PROJECT_UPLOAD_ROOT / str(project_id)).resolve()
    directory.relative_to(PROJECT_UPLOAD_ROOT)
    return directory


def get_stored_document_path(stored_path: str) -> Path | None:
    relative_path = Path(stored_path)
    if relative_path.is_absolute():
        return None
    candidate = (BACKEND_ROOT / relative_path).resolve()
    try:
        candidate.relative_to(PROJECT_UPLOAD_ROOT)
    except ValueError:
        return None
    return candidate


def get_database_storage_path(path: Path) -> str:
    return path.resolve().relative_to(BACKEND_ROOT).as_posix()


def remove_empty_project_directory(project_id: int) -> None:
    directory = get_project_upload_directory(project_id)
    if directory.is_dir() and not any(directory.iterdir()):
        directory.rmdir()


def delete_project_storage(project_id: int) -> None:
    directory = get_project_upload_directory(project_id)
    if directory.exists():
        shutil.rmtree(directory)
