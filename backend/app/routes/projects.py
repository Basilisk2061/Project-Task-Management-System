from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.document_storage import delete_project_storage
from app.models import Comment, Document, Project, ProjectMember, Task, User
from app.rag.vector_store import delete_project_index
from app.schemas import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectUpdate,
    UserSearchResponse,
)


router = APIRouter(prefix="/api/projects", tags=["projects"])


def get_owned_project(project_id: int, user_id: int, db: Session) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.created_by == user_id)
        .first()
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def get_accessible_project(project_id: int, user_id: int, db: Session) -> Project:
    project = (
        db.query(Project)
        .filter(
            Project.id == project_id,
            or_(
                Project.created_by == user_id,
                Project.members.any(ProjectMember.user_id == user_id),
            ),
        )
        .first()
    )
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Project]:
    return (
        db.query(Project)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(
            or_(
                Project.created_by == current_user.id,
                ProjectMember.user_id == current_user.id,
            )
        )
        .distinct()
        .order_by(Project.created_at.desc())
        .all()
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = Project(
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        deadline=data.deadline,
        created_by=current_user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def read_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    return get_accessible_project(project_id, current_user.id, db)


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = get_owned_project(project_id, current_user.id, db)
    updates = data.model_dump(exclude_unset=True)

    updated_start_date = updates.get("start_date", project.start_date)
    updated_deadline = updates.get("deadline", project.deadline)
    if updated_start_date and updated_deadline and updated_deadline < updated_start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Deadline cannot be before start date",
        )

    for field, value in updates.items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    project = get_owned_project(project_id, current_user.id, db)
    try:
        delete_project_storage(project.id)
        delete_project_index(project.id)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete project files",
        ) from exc
    db.query(Document).filter(Document.project_id == project.id).delete(
        synchronize_session=False
    )
    task_ids = select(Task.id).where(Task.project_id == project.id)
    db.query(Comment).filter(Comment.task_id.in_(task_ids)).delete(
        synchronize_session=False
    )
    db.query(Task).filter(Task.project_id == project.id).delete(
        synchronize_session=False
    )
    db.query(ProjectMember).filter(ProjectMember.project_id == project.id).delete(
        synchronize_session=False
    )
    db.delete(project)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_project_members(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    project = get_accessible_project(project_id, current_user.id, db)
    members = (
        db.query(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .filter(ProjectMember.project_id == project.id)
        .order_by(User.name.asc())
        .all()
    )

    result = [{
        "membership_id": None,
        "user_id": project.creator.id,
        "name": project.creator.name,
        "email": project.creator.email,
        "role": "Owner",
    }]
    result.extend({
        "membership_id": membership.id,
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "role": "Member",
    } for membership, user in members)
    return result


@router.get("/{project_id}/users/search", response_model=list[UserSearchResponse])
def search_project_users(
    project_id: int,
    q: str = Query(min_length=2, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[User]:
    project = get_owned_project(project_id, current_user.id, db)
    cleaned_query = q.strip()
    if len(cleaned_query) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Search query must contain at least 2 characters",
        )
    search_term = f"%{cleaned_query}%"
    existing_member_ids = select(ProjectMember.user_id).where(
        ProjectMember.project_id == project.id
    )
    return (
        db.query(User)
        .filter(
            User.id != project.created_by,
            ~User.id.in_(existing_member_ids),
            or_(User.name.ilike(search_term), User.email.ilike(search_term)),
        )
        .order_by(User.name.asc())
        .limit(10)
        .all()
    )


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_project_member(
    project_id: int,
    data: ProjectMemberCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_owned_project(project_id, current_user.id, db)
    user = db.get(User, data.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == project.created_by:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project owner cannot be added as a member",
        )
    existing_member = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user.id,
        )
        .first()
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a project member",
        )

    membership = ProjectMember(project_id=project.id, user_id=user.id)
    db.add(membership)
    try:
        db.commit()
        db.refresh(membership)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a project member",
        )

    return {
        "membership_id": membership.id,
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "role": "Member",
    }


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_project_member(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    project = get_owned_project(project_id, current_user.id, db)
    if user_id == project.created_by:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project owner cannot be removed",
        )

    membership = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user_id,
        )
        .first()
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member not found",
        )

    db.query(Task).filter(
        Task.project_id == project.id,
        Task.assigned_to == user_id,
    ).update({Task.assigned_to: None}, synchronize_session=False)
    db.delete(membership)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
