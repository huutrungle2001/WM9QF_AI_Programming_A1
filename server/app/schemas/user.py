"""Pydantic v2 DTOs for user management."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import Role, UserType


class UserCreate(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    full_name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=254)
    user_type: UserType
    role: Role = Role.MEMBER
    course: str | None = Field(default=None, max_length=200)
    department_id: str = Field(..., min_length=1, max_length=32)
    has_accessibility_access: bool = False
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=3, max_length=254)
    user_type: UserType | None = None
    role: Role | None = None
    course: str | None = Field(default=None, max_length=200)
    department_id: str | None = Field(default=None, min_length=1, max_length=32)
    has_accessibility_access: bool | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    full_name: str
    email: str
    user_type: UserType
    role: Role
    course: str | None = None
    department_id: str
    has_accessibility_access: bool
    is_active: bool
