"""Domain enumerations matching the canonical 11-table schema."""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    STUDENT_SERVICES = "student_services"
    MEMBER = "member"


class UserType(StrEnum):
    UG_STUDENT = "ug_student"
    PG_STUDENT = "pg_student"
    PGR_STUDENT = "pgr_student"
    STAFF = "staff"


class ResourceType(StrEnum):
    STUDY_ROOM = "study_room"
    GROUP_SPACE = "group_space"
    COMPUTER_LAB = "computer_lab"
    SPECIALIST_EQUIPMENT = "specialist_equipment"
    ACADEMIC_SUPPORT = "academic_support"


class RoomStyle(StrEnum):
    SEMINAR = "seminar"
    LECTURE = "lecture"
    BOARDROOM = "boardroom"
    STUDY_POD = "study_pod"
    FLEXIBLE = "flexible"
    STANDARD = "standard"


class BookingEligibility(StrEnum):
    ALL_USERS = "all_users"
    STUDENTS_ONLY = "students_only"
    STAFF_ONLY = "staff_only"
    PG_ONLY = "pg_only"
    PGR_AND_STAFF = "pgr_and_staff"
    DISABILITY_ONLY = "disability_only"


class CheckinMethod(StrEnum):
    NONE = "none"
    PIN = "pin"
    CARD_SWIPE = "card_swipe"


class ResourceStatus(StrEnum):
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"


class BookingStatusId(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


class CampusZone(StrEnum):
    MAIN_SITE = "Main Site"
    GIBBET_HILL = "Gibbet Hill Site"
    WESTWOOD = "Westwood Site"
    INNOVATION_CAMPUS = "Innovation Campus"
