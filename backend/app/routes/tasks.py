from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Comment, Project, ProjectMember, Task, User
from app.project_lifecycle import ensure_project_active
from app.routes.projects import get_accessible_project
from app.schemas import TaskCreate, TaskResponse, TaskStatusUpdate, TaskUpdate


router = APIRouter(tags=["tasks"])


def get_accessible_task(task_id: int, user_id: int, db: Session) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    get_accessible_project(task.project_id, user_id, db)
    return task


def validate_assignee(project: Project, assignee_id: int | None, db: Session) -> None:
    if assignee_id is None:
        return
    is_participant = assignee_id == project.created_by or db.query(ProjectMember).filter(
        ProjectMember.project_id == project.id,
        ProjectMember.user_id == assignee_id,
    ).first() is not None
    if not is_participant:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assignee must be the project owner or a project member",
        )


@router.get("/api/projects/{project_id}/tasks", response_model=list[TaskResponse])
def list_project_tasks(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Task]:
    get_accessible_project(project_id, current_user.id, db)
    return db.query(Task).filter(Task.project_id == project_id).order_by(Task.created_at.desc()).all()


@router.post(
    "/api/projects/{project_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    project_id: int,
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    project = get_accessible_project(project_id, current_user.id, db)
    ensure_project_active(project)
    validate_assignee(project, data.assigned_to, db)
    task = Task(
        project_id=project.id,
        title=data.title,
        description=data.description,
        assigned_to=data.assigned_to,
        created_by=current_user.id,
        priority=data.priority,
        status="todo",
        due_date=data.due_date,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/api/tasks/my", response_model=list[TaskResponse])
def list_my_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Task]:
    return db.query(Task).filter(Task.assigned_to == current_user.id).order_by(Task.created_at.desc()).all()


@router.get("/api/tasks/{task_id}", response_model=TaskResponse)
def read_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    return get_accessible_task(task_id, current_user.id, db)


@router.put("/api/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    task = get_accessible_task(task_id, current_user.id, db)
    ensure_project_active(task.project)
    if task.project.created_by != current_user.id and task.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit this task")
    updates = data.model_dump(exclude_unset=True)
    if "assigned_to" in updates:
        validate_assignee(task.project, updates["assigned_to"], db)
    for field, value in updates.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/api/tasks/{task_id}/status", response_model=TaskResponse)
def update_task_status(
    task_id: int,
    data: TaskStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    task = get_accessible_task(task_id, current_user.id, db)
    ensure_project_active(task.project)
    allowed = (
        task.project.created_by == current_user.id
        or task.created_by == current_user.id
        or task.assigned_to == current_user.id
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this task status")
    task.status = data.status
    db.commit()
    db.refresh(task)
    return task


@router.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    task = get_accessible_task(task_id, current_user.id, db)
    ensure_project_active(task.project)
    if task.project.created_by != current_user.id and task.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this task")
    db.query(Comment).filter(Comment.task_id == task.id).delete(synchronize_session=False)
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
