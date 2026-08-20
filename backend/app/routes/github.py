from datetime import datetime
import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.auth import get_current_user
from app.database import get_db
from app.integrations.github import (
    GitHubIntegrationError,
    build_authorization_url,
    decrypt_access_token,
    encrypt_access_token,
    exchange_authorization_code,
    get_authenticated_account,
    get_frontend_url,
    get_repository,
    list_commits,
    list_repositories,
    read_oauth_state,
)
from app.models import GitHubCredential, Project, Task, User
from app.project_lifecycle import ensure_project_active
from app.routes.projects import get_accessible_project, get_owned_project
from app.schemas import (
    GitHubOAuthStartResponse,
    GitHubCommitResponse,
    GitHubRepositoryConnect,
    GitHubRepositoryResponse,
    ProjectResponse,
)


router = APIRouter(tags=["github"])
logger = logging.getLogger(__name__)
RECENT_COMMIT_LIMIT = 10


def raise_github_error(exc: GitHubIntegrationError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def get_owner_credential(user_id: int, db: Session) -> GitHubCredential:
    credential = db.query(GitHubCredential).filter(GitHubCredential.user_id == user_id).first()
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="GitHub authorization is required.",
        )
    return credential


def get_project_commits(project: Project, db: Session) -> list[dict]:
    if not project.github_repo_owner or not project.github_repo_name:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No GitHub repository is connected to this project.",
        )
    credential = get_owner_credential(project.created_by, db)
    try:
        commits = list_commits(
            decrypt_access_token(credential.access_token_encrypted),
            project.github_repo_owner,
            project.github_repo_name,
            project.github_default_branch or "main",
            RECENT_COMMIT_LIMIT,
        )
    except GitHubIntegrationError as exc:
        raise_github_error(exc)

    referenced_ids = {
        task_id
        for commit in commits
        for task_id in commit["referenced_task_ids"]
    }
    valid_task_ids = set()
    if referenced_ids:
        valid_task_ids = {
            task_id for (task_id,) in db.query(Task.id).filter(
                Task.project_id == project.id,
                Task.id.in_(referenced_ids),
            ).all()
        }
    return [
        {
            **{key: value for key, value in commit.items() if key != "referenced_task_ids"},
            "task_ids": [
                task_id for task_id in commit["referenced_task_ids"]
                if task_id in valid_task_ids
            ],
        }
        for commit in commits
    ]


@router.get(
    "/api/projects/{project_id}/github/commits",
    response_model=list[GitHubCommitResponse],
)
def read_project_github_commits(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    project = get_accessible_project(project_id, current_user.id, db)
    return get_project_commits(project, db)


@router.get(
    "/api/projects/{project_id}/tasks/{task_id}/github/commits",
    response_model=list[GitHubCommitResponse],
)
def read_task_github_commits(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    project = get_accessible_project(project_id, current_user.id, db)
    task = db.query(Task).filter(Task.id == task_id, Task.project_id == project.id).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return [
        commit for commit in get_project_commits(project, db)
        if task.id in commit["task_ids"]
    ]


@router.post(
    "/api/projects/{project_id}/github/oauth/start",
    response_model=GitHubOAuthStartResponse,
)
def start_github_oauth(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_owned_project(project_id, current_user.id, db)
    ensure_project_active(project)
    try:
        return {"authorization_url": build_authorization_url(current_user.id, project.id)}
    except GitHubIntegrationError as exc:
        raise_github_error(exc)


@router.get("/api/github/oauth/callback")
def finish_github_oauth(
    code: str | None = Query(default=None),
    state: str = Query(...),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    try:
        user_id, project_id = read_oauth_state(state)
        project = get_owned_project(project_id, user_id, db)
        ensure_project_active(project)
        if error or not code:
            return RedirectResponse(
                f"{get_frontend_url()}/app/projects/{project.id}?{urlencode({'github': 'cancelled'})}",
                status_code=status.HTTP_303_SEE_OTHER,
            )
        access_token = exchange_authorization_code(code)
        account = get_authenticated_account(access_token)
        encrypted_token = encrypt_access_token(access_token)
    except GitHubIntegrationError as exc:
        raise_github_error(exc)

    credential = db.query(GitHubCredential).filter(GitHubCredential.user_id == user_id).first()
    if credential is None:
        credential = GitHubCredential(
            user_id=user_id,
            github_user_id=account["id"],
            github_login=account["login"],
            access_token_encrypted=encrypted_token,
        )
        db.add(credential)
    else:
        credential.github_user_id = account["id"]
        credential.github_login = account["login"]
        credential.access_token_encrypted = encrypted_token
        credential.updated_at = datetime.utcnow()
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error(
            "GitHub OAuth callback failed stage=credential_persistence exception=%s",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save GitHub authorization.",
        ) from exc
    return RedirectResponse(
        f"{get_frontend_url()}/app/projects/{project.id}?{urlencode({'github': 'select'})}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


@router.get(
    "/api/projects/{project_id}/github/repositories",
    response_model=list[GitHubRepositoryResponse],
)
def read_github_repositories(
    project_id: int,
    q: str | None = Query(default=None, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    project = get_owned_project(project_id, current_user.id, db)
    ensure_project_active(project)
    credential = get_owner_credential(current_user.id, db)
    try:
        return list_repositories(
            decrypt_access_token(credential.access_token_encrypted),
            q or "",
        )
    except GitHubIntegrationError as exc:
        raise_github_error(exc)


@router.put(
    "/api/projects/{project_id}/github",
    response_model=ProjectResponse,
)
def connect_github_repository(
    project_id: int,
    data: GitHubRepositoryConnect,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = get_owned_project(project_id, current_user.id, db)
    ensure_project_active(project)
    credential = get_owner_credential(current_user.id, db)
    try:
        repository = get_repository(
            decrypt_access_token(credential.access_token_encrypted),
            data.owner,
            data.name,
        )
    except GitHubIntegrationError as exc:
        raise_github_error(exc)
    project.github_repo_owner = repository["owner"]
    project.github_repo_name = repository["name"]
    project.github_repo_url = repository["html_url"]
    project.github_default_branch = repository["default_branch"]
    project.github_connected_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    return project


@router.delete(
    "/api/projects/{project_id}/github",
    response_model=ProjectResponse,
)
def disconnect_github_repository(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = get_owned_project(project_id, current_user.id, db)
    ensure_project_active(project)
    project.github_repo_owner = None
    project.github_repo_name = None
    project.github_repo_url = None
    project.github_default_branch = None
    project.github_connected_at = None
    db.commit()
    db.refresh(project)
    return project
