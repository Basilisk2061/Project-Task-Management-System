from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Comment, User
from app.project_lifecycle import ensure_project_active
from app.routes.tasks import get_accessible_task
from app.schemas import CommentCreate, CommentResponse


router = APIRouter(tags=["comments"])


@router.get(
    "/api/tasks/{task_id}/comments",
    response_model=list[CommentResponse],
)
def list_task_comments(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Comment]:
    task = get_accessible_task(task_id, current_user.id, db)
    return (
        db.query(Comment)
        .filter(Comment.task_id == task.id)
        .order_by(Comment.created_at.asc(), Comment.id.asc())
        .all()
    )


@router.post(
    "/api/tasks/{task_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task_comment(
    task_id: int,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Comment:
    task = get_accessible_task(task_id, current_user.id, db)
    ensure_project_active(task.project)
    comment = Comment(
        task_id=task.id,
        user_id=current_user.id,
        content=data.content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete(
    "/api/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    task = get_accessible_task(comment.task_id, current_user.id, db)
    ensure_project_active(task.project)
    if comment.user_id != current_user.id and task.project.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this comment",
        )

    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
