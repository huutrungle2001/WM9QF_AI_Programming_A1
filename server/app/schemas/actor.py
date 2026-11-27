"""Actor context DTO threaded through all services and PolicyGuard."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.domain.enums import Role, UserType


class ActorContext(BaseModel):
    """Authenticated caller context derived from API headers or CLI active role."""

    model_config = ConfigDict(from_attributes=True)

    role: Role
    user_id: str | None = None
    user_type: UserType | None = None
    department_id: str | None = None
    has_accessibility_access: bool = False
