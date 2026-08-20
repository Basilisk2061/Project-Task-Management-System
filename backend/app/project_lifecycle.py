from fastapi import HTTPException, status

from app.models import Project


COMPLETED_PROJECT_DETAIL = "This project is completed. Reopen it to make changes."


def ensure_project_active(project: Project) -> None:
    """Reject operational writes to completed projects at the API boundary."""
    if project.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=COMPLETED_PROJECT_DETAIL,
        )
