import os
import logging
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

import httpx
import jwt
from cryptography.fernet import Fernet, InvalidToken
from jwt.exceptions import InvalidTokenError

from app.auth import JWT_ALGORITHM, JWT_SECRET_KEY


GITHUB_API_URL = "https://api.github.com"
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_TIMEOUT_SECONDS = 12.0
MAX_COMMIT_LIMIT = 30
TASK_REFERENCE_PATTERN = re.compile(r"\bTASK-(\d+)\b", re.IGNORECASE)
logger = logging.getLogger(__name__)


class GitHubIntegrationError(Exception):
    def __init__(self, detail: str, status_code: int = 502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _required_setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        logger.error("GitHub OAuth configuration missing setting=%s", name)
        raise GitHubIntegrationError(
            "GitHub integration is not configured.",
            status_code=503,
        )
    return value


def get_frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")


def create_oauth_state(user_id: int, project_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    return jwt.encode(
        {
            "purpose": "github_oauth",
            "user_id": user_id,
            "project_id": project_id,
            "exp": expires_at,
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def read_oauth_state(state: str) -> tuple[int, int]:
    try:
        payload = jwt.decode(state, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if payload.get("purpose") != "github_oauth":
            raise ValueError
        return int(payload["user_id"]), int(payload["project_id"])
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        logger.warning("GitHub OAuth callback failed stage=state_validation exception=%s", type(exc).__name__)
        raise GitHubIntegrationError("Invalid or expired GitHub authorization state.", 400) from exc


def build_authorization_url(user_id: int, project_id: int) -> str:
    query = urlencode({
        "client_id": _required_setting("GITHUB_CLIENT_ID"),
        "redirect_uri": _required_setting("GITHUB_OAUTH_REDIRECT_URI"),
        "scope": "read:user repo",
        "state": create_oauth_state(user_id, project_id),
    })
    return f"{GITHUB_AUTHORIZE_URL}?{query}"


def exchange_authorization_code(code: str) -> str:
    try:
        response = httpx.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": _required_setting("GITHUB_CLIENT_ID"),
                "client_secret": _required_setting("GITHUB_CLIENT_SECRET"),
                "code": code,
                "redirect_uri": _required_setting("GITHUB_OAUTH_REDIRECT_URI"),
            },
            headers={"Accept": "application/json"},
            timeout=GITHUB_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        logger.warning("GitHub OAuth callback failed stage=token_exchange exception=%s", type(exc).__name__)
        raise GitHubIntegrationError("GitHub authorization is temporarily unavailable.") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        logger.warning(
            "GitHub OAuth callback failed stage=token_exchange status=%s error=invalid_json",
            response.status_code,
        )
        raise GitHubIntegrationError("GitHub authorization returned an invalid response.") from exc
    token = payload.get("access_token")
    provider_error = payload.get("error")
    if response.status_code >= 400 or provider_error or not isinstance(token, str) or not token:
        safe_error = str(provider_error or "missing_access_token")[:80].replace("\r", " ").replace("\n", " ")
        safe_description = str(payload.get("error_description") or "none")[:240].replace("\r", " ").replace("\n", " ")
        logger.warning(
            "GitHub OAuth callback failed stage=token_exchange status=%s error=%s description=%s",
            response.status_code,
            safe_error,
            safe_description,
        )
        raise GitHubIntegrationError("GitHub authorization failed.")
    return token


def _github_request(
    access_token: str,
    path: str,
    params: dict | None = None,
    empty_on_conflict: bool = False,
):
    try:
        response = httpx.get(
            f"{GITHUB_API_URL}{path}",
            params=params,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {access_token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "TaskFlow-University-Project",
            },
            timeout=GITHUB_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        logger.warning("GitHub API request failed stage=provider_request exception=%s", type(exc).__name__)
        raise GitHubIntegrationError("GitHub is temporarily unavailable.") from exc
    if response.status_code == 409 and empty_on_conflict:
        return []
    if response.status_code >= 400:
        logger.warning(
            "GitHub API request failed stage=provider_request status=%s endpoint_type=%s",
            response.status_code,
            "account" if path == "/user" else "repository",
        )
    if response.status_code == 401:
        raise GitHubIntegrationError("GitHub authorization has expired. Authorize again.", 401)
    if response.status_code == 404:
        raise GitHubIntegrationError("GitHub repository was not found or is not accessible.", 404)
    if response.status_code in (403, 429):
        raise GitHubIntegrationError("GitHub access is temporarily unavailable. Try again later.", 503)
    if response.status_code >= 400:
        raise GitHubIntegrationError("GitHub request failed.")
    try:
        return response.json()
    except ValueError as exc:
        raise GitHubIntegrationError("GitHub returned an invalid response.") from exc


def get_authenticated_account(access_token: str) -> dict:
    payload = _github_request(access_token, "/user")
    if not payload.get("id") or not payload.get("login"):
        raise GitHubIntegrationError("GitHub returned an invalid account response.")
    return {"id": str(payload["id"]), "login": str(payload["login"])}


def _safe_repository(payload: dict) -> dict:
    owner = payload.get("owner", {}).get("login")
    name = payload.get("name")
    html_url = payload.get("html_url")
    default_branch = payload.get("default_branch") or "main"
    if not owner or not name or not isinstance(html_url, str) or not html_url.startswith("https://github.com/"):
        raise GitHubIntegrationError("GitHub returned invalid repository information.")
    return {
        "owner": str(owner),
        "name": str(name),
        "full_name": f"{owner}/{name}",
        "html_url": html_url,
        "default_branch": str(default_branch),
        "private": bool(payload.get("private")),
    }


def list_repositories(access_token: str, query: str = "") -> list[dict]:
    payload = _github_request(
        access_token,
        "/user/repos",
        params={
            "affiliation": "owner,collaborator,organization_member",
            "sort": "updated",
            "direction": "desc",
            "per_page": 100,
        },
    )
    cleaned_query = query.strip().lower()
    repositories = [_safe_repository(repository) for repository in payload]
    if cleaned_query:
        repositories = [
            repository for repository in repositories
            if cleaned_query in repository["full_name"].lower()
        ]
    return repositories[:30]


def get_repository(access_token: str, owner: str, name: str) -> dict:
    safe_owner = quote(owner, safe="")
    safe_name = quote(name, safe="")
    return _safe_repository(_github_request(access_token, f"/repos/{safe_owner}/{safe_name}"))


def extract_task_references(message: str) -> set[int]:
    return {int(match) for match in TASK_REFERENCE_PATTERN.findall(message)}


def _safe_commit(payload: dict) -> dict:
    sha = payload.get("sha")
    html_url = payload.get("html_url")
    commit = payload.get("commit") or {}
    author_details = commit.get("author") or {}
    committer_details = commit.get("committer") or {}
    github_author = payload.get("author") or {}
    message = commit.get("message")
    committed_at = author_details.get("date") or committer_details.get("date")
    if (
        not isinstance(sha, str)
        or len(sha) < 7
        or not isinstance(message, str)
        or not isinstance(committed_at, str)
        or not isinstance(html_url, str)
        or not html_url.startswith("https://github.com/")
    ):
        raise GitHubIntegrationError("GitHub returned invalid commit information.")
    avatar_url = github_author.get("avatar_url")
    if not isinstance(avatar_url, str) or not avatar_url.startswith("https://"):
        avatar_url = None
    clean_message = message.replace("\x00", "").strip()[:2000]
    return {
        "sha": sha,
        "short_sha": sha[:7],
        "message": clean_message,
        "author_name": str(author_details.get("name") or committer_details.get("name") or "Unknown author")[:200],
        "github_username": str(github_author["login"])[:100] if github_author.get("login") else None,
        "author_avatar_url": avatar_url,
        "committed_at": committed_at,
        "html_url": html_url,
        "referenced_task_ids": sorted(extract_task_references(clean_message)),
    }


def list_commits(
    access_token: str,
    owner: str,
    name: str,
    default_branch: str,
    limit: int = 10,
) -> list[dict]:
    bounded_limit = max(1, min(limit, MAX_COMMIT_LIMIT))
    safe_owner = quote(owner, safe="")
    safe_name = quote(name, safe="")
    payload = _github_request(
        access_token,
        f"/repos/{safe_owner}/{safe_name}/commits",
        params={"sha": default_branch, "per_page": bounded_limit},
        empty_on_conflict=True,
    )
    if not isinstance(payload, list):
        raise GitHubIntegrationError("GitHub returned an invalid commit response.")
    return [_safe_commit(commit) for commit in payload[:bounded_limit]]


def _fernet() -> Fernet:
    try:
        return Fernet(_required_setting("GITHUB_TOKEN_ENCRYPTION_KEY").encode("utf-8"))
    except (TypeError, ValueError) as exc:
        logger.error("GitHub OAuth callback failed stage=token_encryption exception=%s", type(exc).__name__)
        raise GitHubIntegrationError("GitHub token encryption is not configured correctly.", 503) from exc


def encrypt_access_token(access_token: str) -> str:
    return _fernet().encrypt(access_token.encode("utf-8")).decode("utf-8")


def decrypt_access_token(encrypted_token: str) -> str:
    try:
        return _fernet().decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise GitHubIntegrationError("Stored GitHub authorization is unavailable. Authorize again.", 401) from exc
