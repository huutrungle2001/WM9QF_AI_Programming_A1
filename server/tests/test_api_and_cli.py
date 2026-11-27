"""Phase 4 TDD suite: FastAPI REST API (/api/v1) end-to-end tests and Thin CLI smoke tests."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.cli.formatting import render_table
from app.cli.main import main as cli_main
from app.cli.menu import InteractiveMenu
from app.config import AppSettings, BookingPolicyConfig
from app.database import DatabaseManager
from app.dependencies import build_service_container
from app.domain.enums import Role
from app.main import create_app
from app.schemas.actor import ActorContext
from database.scripts.seed_db import seed_database


def _ts(year: int, month: int, day: int, hour: int, minute: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, tzinfo=timezone.utc).timestamp())


@pytest.fixture()
def seeded_db(tmp_path: Path, repo_root: Path) -> DatabaseManager:
    """Create a fresh deterministically seeded SQLite DB in a temp directory."""
    db_path = tmp_path / "api_cli_test.db"
    seed_database(
        db_path=db_path,
        seed_data_path=repo_root / "database" / "seed_data.json",
        schema_path=repo_root / "database" / "schema.sql",
        reset=True,
        seed=42,
    )
    return DatabaseManager(db_path)


@pytest.fixture()
def api_client(seeded_db: DatabaseManager, tmp_path: Path) -> TestClient:
    """Build a FastAPI TestClient wired to the isolated seeded DB and temp charts dir."""
    app = create_app(
        db_manager=seeded_db,
        policy_config=BookingPolicyConfig(),
        charts_dir=tmp_path / "charts",
    )
    return TestClient(app)


# =============================================================================
# 1. Health, CORS & Authentication (401)
# =============================================================================


def test_health_endpoints_and_cors_headers(api_client: TestClient) -> None:
    r1 = api_client.get("/health")
    assert r1.status_code == 200
    assert r1.json() == {"status": "ok", "database": "ready"}

    r2 = api_client.get("/api/v1/health")
    assert r2.status_code == 200
    assert r2.json() == {"status": "ok", "database": "ready"}

    preflight = api_client.options(
        "/api/v1/resources",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Role, X-User-Id, Content-Type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_accepts_configured_loopback_client_port(
    seeded_db: DatabaseManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BOOKING_CLIENT_PORT", "13083")
    client = TestClient(create_app(db_manager=seeded_db))

    for origin, expected_status in (
        ("http://127.0.0.1:13083", 200),
        ("http://localhost:13083", 200),
        ("http://localhost:3000", 400),
        ("https://example.test:13083", 400),
    ):
        preflight = client.options(
            "/api/v1/bookings",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "X-Role, X-User-Id, Content-Type",
            },
        )
        assert preflight.status_code == expected_status
        assert preflight.headers.get("access-control-allow-origin") == (
            origin if expected_status == 200 else None
        )


def test_auth_errors_return_401_envelope(api_client: TestClient) -> None:
    r_missing = api_client.get("/api/v1/departments")
    assert r_missing.status_code == 401
    assert r_missing.json()["code"] == "unauthorized"

    r_invalid = api_client.get("/api/v1/departments", headers={"X-Role": "superuser"})
    assert r_invalid.status_code == 401
    assert r_invalid.json()["code"] == "unauthorized"

    r_no_uid = api_client.get("/api/v1/resources", headers={"X-Role": "member"})
    assert r_no_uid.status_code == 401
    assert r_no_uid.json()["code"] == "unauthorized"

    r_bad_uid = api_client.get(
        "/api/v1/resources", headers={"X-Role": "member", "X-User-Id": "NO_SUCH_USER"}
    )
    assert r_bad_uid.status_code == 401
    assert r_bad_uid.json()["code"] == "unauthorized"


# =============================================================================
# 2. Reference Catalogue & Users CRUD
# =============================================================================


def test_reference_and_user_crud_endpoints(api_client: TestClient) -> None:
    admin_h = {"X-Role": "admin", "X-User-Id": "ADMIN1"}
    member_h = {"X-Role": "member", "X-User-Id": "S1001"}

    depts = api_client.get("/api/v1/departments", headers=member_h)
    assert depts.status_code == 200
    assert len(depts.json()) >= 50

    r_forbid = api_client.post(
        "/api/v1/departments",
        headers=member_h,
        json={"department_id": "NEWD", "department_name": "New Dept", "faculty": "Arts"},
    )
    assert r_forbid.status_code == 403
    assert r_forbid.json()["code"] == "forbidden"

    r_create_dept = api_client.post(
        "/api/v1/departments",
        headers=admin_h,
        json={"department_id": "TESTD", "department_name": "Test Dept", "faculty": "SEM"},
    )
    assert r_create_dept.status_code == 201
    assert r_create_dept.json()["department_id"] == "TESTD"

    r_patch_dept = api_client.patch(
        "/api/v1/departments/TESTD",
        headers=admin_h,
        json={"department_name": "Updated Test Dept"},
    )
    assert r_patch_dept.status_code == 200
    assert r_patch_dept.json()["department_name"] == "Updated Test Dept"

    assert api_client.get("/api/v1/departments/DOES_NOT_EXIST", headers=admin_h).status_code == 404

    r_bld = api_client.post(
        "/api/v1/buildings",
        headers=admin_h,
        json={
            "building_id": "BLD-TEST-1",
            "building_name": "Test Annex",
            "zone": "Main Site",
            "lat": 52.38,
            "lon": -1.56,
            "floor_count": 2,
        },
    )
    assert r_bld.status_code == 201
    assert api_client.get("/api/v1/buildings/BLD-TEST-1", headers=member_h).status_code == 200
    assert (
        api_client.patch(
            "/api/v1/buildings/BLD-TEST-1", headers=admin_h, json={"floor_count": 3}
        ).json()["floor_count"]
        == 3
    )

    r_fac = api_client.post(
        "/api/v1/facilities",
        headers=admin_h,
        json={"facility_id": "FAC-TEST-4K", "facility_name": "4K Ultra Display"},
    )
    assert r_fac.status_code == 201
    assert any(
        f["facility_id"] == "FAC-TEST-4K"
        for f in api_client.get("/api/v1/facilities", headers=member_h).json()
    )

    statuses = api_client.get("/api/v1/booking-statuses", headers=member_h)
    assert statuses.status_code == 200
    assert {s["status_id"] for s in statuses.json()} >= {
        "pending",
        "confirmed",
        "cancelled",
        "rejected",
        "completed",
        "no_show",
    }

    r_usr = api_client.post(
        "/api/v1/users",
        headers=admin_h,
        json={
            "user_id": "S9999",
            "full_name": "Temp Student",
            "email": "temp.student.9999@warwick.ac.uk",
            "user_type": "ug_student",
            "role": "member",
            "course": "BSc Computer Science",
            "department_id": "CS",
        },
    )
    assert r_usr.status_code == 201
    assert api_client.get("/api/v1/users/S9999", headers=admin_h).status_code == 200
    assert (
        api_client.patch(
            "/api/v1/users/S9999", headers=admin_h, json={"full_name": "Temp Student Updated"}
        ).json()["full_name"]
        == "Temp Student Updated"
    )
    r_del = api_client.delete("/api/v1/users/S9999", headers=admin_h)
    assert r_del.status_code == 204

    r_inactive = api_client.get(
        "/api/v1/resources", headers={"X-Role": "member", "X-User-Id": "S9999"}
    )
    assert r_inactive.status_code == 401


# =============================================================================
# 3. Resources, Policy-to-SQL Pushdown & Availability
# =============================================================================


def test_resources_policy_pushdown_crud_and_availability(api_client: TestClient) -> None:
    admin_h = {"X-Role": "admin", "X-User-Id": "ADMIN1"}
    pg_h = {"X-Role": "member", "X-User-Id": "S1001"}

    pg_res = api_client.get("/api/v1/resources", headers=pg_h, params={"limit": 1000})
    assert pg_res.status_code == 200
    pg_eligibilities = {r["booking_eligibility"] for r in pg_res.json()}
    assert "staff_only" not in pg_eligibilities
    assert "disability_only" not in pg_eligibilities

    r_staff_room = api_client.get("/api/v1/resources/LIB-CCP", headers=pg_h)
    assert r_staff_room.status_code == 403
    assert r_staff_room.json()["code"] == "forbidden"

    r_create = api_client.post(
        "/api/v1/resources",
        headers=admin_h,
        json={
            "resource_id": "RM-API-TEST-1",
            "resource_name": "API Verification Study Pod",
            "resource_type": "group_space",
            "department_id": "LIB",
            "building_id": None,
            "location": "Library Floor 3",
            "requires_approval": False,
            "booking_eligibility": "all_users",
            "checkin_method": "pin",
            "facilities": [],
            "details": {"capacity": 6, "room_style": "study_pod"},
        },
    )
    assert r_create.status_code == 201
    assert r_create.json()["details"]["capacity"] == 6

    avail = api_client.get(
        "/api/v1/availability",
        headers=pg_h,
        params={
            "start_time": "2026-12-10T09:00:00Z",
            "end_time": "2026-12-10T11:00:00Z",
            "resource_type": "group_space",
        },
    )
    assert avail.status_code == 200
    ids = {slot["resource"]["resource_id"] for slot in avail.json()}
    assert "RM-API-TEST-1" in ids

    bad_avail = api_client.get(
        "/api/v1/availability",
        headers=pg_h,
        params={"start_time": "1796900000", "end_time": "1796800000"},
    )
    assert bad_avail.status_code == 422
    assert bad_avail.json()["code"] == "validation_error"

    r_retire = api_client.delete("/api/v1/resources/RM-API-TEST-1", headers=admin_h)
    assert r_retire.status_code == 204
    assert (
        api_client.get("/api/v1/resources/RM-API-TEST-1", headers=admin_h).json()["status"]
        == "retired"
    )


# =============================================================================
# 4. Bookings Lifecycle, Conflicts (409), Transitions, Soft Delete & Redaction
# =============================================================================


def test_bookings_lifecycle_conflicts_transitions_and_redaction(api_client: TestClient) -> None:
    admin_h = {"X-Role": "admin", "X-User-Id": "ADMIN1"}
    mgr_h = {"X-Role": "manager", "X-User-Id": "MGR-LIB"}
    ss_h = {"X-Role": "student_services", "X-User-Id": "SS1"}
    alice_h = {"X-Role": "member", "X-User-Id": "S1001"}
    benji_h = {"X-Role": "member", "X-User-Id": "S1002"}

    t1 = _ts(2026, 12, 11, 10, 0)
    t2 = _ts(2026, 12, 11, 12, 0)
    t3 = _ts(2026, 12, 11, 14, 0)

    r_b1 = api_client.post(
        "/api/v1/bookings",
        headers=alice_h,
        json={
            "resource_id": "LIB-GSR-6",
            "start_time": t1,
            "end_time": t2,
            "purpose": "Private dissertation prep",
            "notes": "Bring laptop charger",
            "group_size": 3,
        },
    )
    assert r_b1.status_code == 201
    b1 = r_b1.json()
    assert b1["status_id"] == "confirmed"
    b1_id = b1["booking_id"]

    r_clash = api_client.post(
        "/api/v1/bookings",
        headers=benji_h,
        json={"resource_id": "LIB-GSR-6", "start_time": t1 + 1800, "end_time": t2 + 1800},
    )
    assert r_clash.status_code == 409
    assert r_clash.json()["code"] == "conflict"

    assert api_client.get(f"/api/v1/bookings/{b1_id}", headers=benji_h).status_code == 403
    assert api_client.post(f"/api/v1/bookings/{b1_id}/cancel", headers=benji_h).status_code == 403

    r_ss = api_client.get(f"/api/v1/bookings/{b1_id}", headers=ss_h)
    assert r_ss.status_code == 200
    ss_data = r_ss.json()
    assert ss_data["user_id"].startswith("ANON-")
    assert ss_data["user_name"] is None
    assert ss_data["purpose"] == "[REDACTED]"
    assert ss_data["notes"] == "[REDACTED]"
    assert api_client.post(f"/api/v1/bookings/{b1_id}/cancel", headers=ss_h).status_code == 403

    r_patch = api_client.patch(
        f"/api/v1/bookings/{b1_id}",
        headers=alice_h,
        json={"start_time": t2, "end_time": t3, "purpose": "Rescheduled sprint"},
    )
    assert r_patch.status_code == 200
    assert r_patch.json()["start_time"] == t2

    r_cancel = api_client.post(
        f"/api/v1/bookings/{b1_id}/cancel",
        headers=alice_h,
        json={"notes": "Plans changed"},
    )
    assert r_cancel.status_code == 200
    assert r_cancel.json()["status_id"] == "cancelled"

    r_bad_trans = api_client.post(f"/api/v1/bookings/{b1_id}/complete", headers=mgr_h)
    assert r_bad_trans.status_code == 422
    assert r_bad_trans.json()["code"] == "validation_error"

    r_eq = api_client.post(
        "/api/v1/bookings",
        headers=alice_h,
        json={
            "resource_id": "EQ-IDG-LOAN-LAPTOP",
            "start_time": _ts(2026, 12, 12, 9, 0),
            "end_time": _ts(2026, 12, 13, 9, 0),
            "purpose": "Exam backup laptop",
        },
    )
    assert r_eq.status_code == 201
    assert r_eq.json()["status_id"] == "pending"
    eq_id = r_eq.json()["booking_id"]

    r_approve = api_client.post(
        f"/api/v1/bookings/{eq_id}/approve",
        headers=mgr_h,
        json={"notes": "Approved for collection"},
    )
    assert r_approve.status_code == 200
    assert r_approve.json()["status_id"] == "confirmed"

    r_complete = api_client.post(f"/api/v1/bookings/{eq_id}/complete", headers=mgr_h)
    assert r_complete.status_code == 200
    assert r_complete.json()["status_id"] == "completed"

    r_rej_bk = api_client.post(
        "/api/v1/bookings",
        headers=benji_h,
        json={
            "resource_id": "EQ-IDG-LOAN-LAPTOP",
            "start_time": _ts(2026, 12, 14, 9, 0),
            "end_time": _ts(2026, 12, 15, 9, 0),
        },
    )
    assert r_rej_bk.status_code == 201
    rej_id = r_rej_bk.json()["booking_id"]
    assert api_client.post(f"/api/v1/bookings/{rej_id}/reject", headers=mgr_h).json()["status_id"] == "rejected"

    r_ns_bk = api_client.post(
        "/api/v1/bookings",
        headers=benji_h,
        json={
            "resource_id": "LIB-GSR-7",
            "start_time": _ts(2026, 12, 14, 15, 0),
            "end_time": _ts(2026, 12, 14, 16, 0),
        },
    )
    assert r_ns_bk.status_code == 201
    ns_id = r_ns_bk.json()["booking_id"]
    assert api_client.post(f"/api/v1/bookings/{ns_id}/no-show", headers=mgr_h).json()["status_id"] == "no_show"

    assert api_client.delete(f"/api/v1/bookings/{ns_id}", headers=mgr_h).status_code == 403
    assert api_client.delete(f"/api/v1/bookings/{ns_id}", headers=admin_h).status_code == 204
    assert api_client.get(f"/api/v1/bookings/{ns_id}", headers=admin_h).status_code == 404


# =============================================================================
# 5. CSV Batch Import (All 3 Content Types + Sample CSVs)
# =============================================================================


def test_csv_import_supports_multipart_json_and_raw_csv(
    api_client: TestClient, repo_root: Path
) -> None:
    admin_h = {"X-Role": "admin", "X-User-Id": "ADMIN1"}
    clean_csv = (repo_root / "database" / "samples" / "sample_bookings.csv").read_text(
        encoding="utf-8"
    )
    err_csv = (repo_root / "database" / "samples" / "sample_bookings_with_errors.csv").read_text(
        encoding="utf-8"
    )

    r_multi = api_client.post(
        "/api/v1/bookings/import-csv",
        headers=admin_h,
        files={"file": ("sample_bookings.csv", clean_csv.encode("utf-8"), "text/csv")},
    )
    assert r_multi.status_code == 200
    s1 = r_multi.json()
    assert s1["total_rows"] == 5
    assert s1["imported_count"] == 5
    assert s1["failed_count"] == 0
    assert len(s1["created_booking_ids"]) == 5

    r_raw = api_client.post(
        "/api/v1/bookings/import-csv",
        headers={**admin_h, "Content-Type": "text/csv"},
        content=err_csv.encode("utf-8"),
    )
    assert r_raw.status_code == 200
    s2 = r_raw.json()
    assert s2["total_rows"] == 6
    assert s2["imported_count"] == 2
    assert s2["failed_count"] == 4
    assert [e["line_number"] for e in s2["errors"]] == [3, 4, 5, 7]

    mini_csv = (
        "user_id,resource_id,start_time,end_time,purpose\n"
        "S1001,LIB-OMR-1,2026-12-18T10:00:00Z,2026-12-18T11:00:00Z,JSON import check\n"
    )
    r_json = api_client.post(
        "/api/v1/bookings/import-csv",
        headers=admin_h,
        json={"csv_content": mini_csv},
    )
    assert r_json.status_code == 200
    assert r_json.json()["imported_count"] == 1


# =============================================================================
# 6. Analytics Endpoints & PNG Chart Export over HTTP
# =============================================================================


def test_analytics_and_chart_export_endpoints(api_client: TestClient, tmp_path: Path) -> None:
    ss_h = {"X-Role": "student_services", "X-User-Id": "SS1"}
    member_h = {"X-Role": "member", "X-User-Id": "S1001"}

    assert api_client.get("/api/v1/analytics/overview", headers=member_h).status_code == 403

    ov = api_client.get("/api/v1/analytics/overview", headers=ss_h)
    assert ov.status_code == 200
    assert ov.json()["total_bookings"] == 400
    assert ov.json()["total_resources"] == 531

    dm = api_client.get("/api/v1/analytics/demand", headers=ss_h, params={"limit": 5})
    assert dm.status_code == 200
    dm_data = dm.json()
    assert len(dm_data["most_booked"]) == 5
    assert dm_data["top_booked"] == dm_data["most_booked"]
    assert len(dm_data["underused"]) == 5

    hm = api_client.get("/api/v1/analytics/heatmap", headers=ss_h)
    assert hm.status_code == 200
    assert len(hm.json()) == 168
    assert sum(c["booking_count"] for c in hm.json()) == 400

    tr = api_client.get("/api/v1/analytics/trends", headers=ss_h)
    assert tr.status_code == 200
    assert len(tr.json()) == 8

    cn1 = api_client.get("/api/v1/analytics/cancellations", headers=ss_h)
    assert cn1.status_code == 200
    assert len(cn1.json()) > 0
    cn2 = api_client.get(
        "/api/v1/analytics/cancellations", headers=ss_h, params={"dimension": "department"}
    )
    assert cn2.status_code == 200
    assert all(row["dimension"] == "department_id" for row in cn2.json())

    fr = api_client.get("/api/v1/analytics/fairness", headers=ss_h)
    assert fr.status_code == 200
    assert any(r["is_suppressed"] and r["course"] == "Other (<5)" for r in fr.json())

    out_dir = tmp_path / "http_charts"
    ch = api_client.post(
        "/api/v1/analytics/charts", headers=ss_h, params={"output_dir": str(out_dir)}
    )
    assert ch.status_code == 200
    ch_data = ch.json()
    assert len(ch_data["generated_files"]) == 4
    for fname in ch_data["generated_files"]:
        png_path = out_dir / fname
        assert png_path.is_file()
        assert png_path.stat().st_size > 1000


# =============================================================================
# 7. Thin CLI Formatting, Subcommands & Interactive Menu Smoke Tests
# =============================================================================


def test_formatting_render_table_alignment_and_truncation() -> None:
    table = render_table(
        ["ID", "Name", "Active"],
        [["R1", "Short Room", True], ["R2", "A Very Long Resource Description Exceeding Limit", False]],
        max_col_width=20,
    )
    lines = table.splitlines()
    assert len(lines) == 4
    assert " | " in lines[0]
    assert "-+-" in lines[1]
    assert "..." in lines[3]

    empty_table = render_table(["A", "B"], [])
    assert "(no records)" in empty_table


def test_cli_subcommands_end_to_end(
    tmp_path: Path, repo_root: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    db_file = tmp_path / "cli_subcmd.db"
    charts_out = tmp_path / "cli_charts"
    sample_csv = repo_root / "database" / "samples" / "sample_bookings.csv"

    assert cli_main(["--db-path", str(db_file), "seed", "--reset"]) == 0
    out = capsys.readouterr().out
    assert "resources" in out and "531" in out

    assert (
        cli_main(
            [
                "--db-path",
                str(db_file),
                "--role",
                "member",
                "--user-id",
                "S1001",
                "resources",
                "--type",
                "group_space",
                "--limit",
                "5",
            ]
        )
        == 0
    )
    out = capsys.readouterr().out
    assert "group_space" in out
    assert "staff_only" not in out

    assert (
        cli_main(
            [
                "--db-path",
                str(db_file),
                "availability",
                "--start",
                "2026-12-20T09:00:00Z",
                "--end",
                "2026-12-20T11:00:00Z",
                "--type",
                "group_space",
                "--department",
                "LIB",
            ]
        )
        == 0
    )
    assert "LIB-GSR-6" in capsys.readouterr().out

    assert (
        cli_main(
            [
                "--db-path",
                str(db_file),
                "--role",
                "member",
                "--user-id",
                "S1001",
                "book",
                "--resource",
                "LIB-GSR-6",
                "--start",
                "2026-12-20T09:00:00Z",
                "--end",
                "2026-12-20T11:00:00Z",
                "--purpose",
                "CLI smoke booking",
            ]
        )
        == 0
    )
    book_out = capsys.readouterr().out
    assert "LIB-GSR-6" in book_out and "confirmed" in book_out

    assert (
        cli_main(
            [
                "--db-path",
                str(db_file),
                "--role",
                "student_services",
                "--user-id",
                "SS1",
                "bookings",
                "--resource",
                "LIB-GSR-6",
                "--limit",
                "5",
            ]
        )
        == 0
    )
    ss_out = capsys.readouterr().out
    assert "ANON-" in ss_out
    assert "[REDACTED]" in ss_out

    assert (
        cli_main(
            [
                "--db-path",
                str(db_file),
                "--role",
                "member",
                "--user-id",
                "S1001",
                "cancel",
                "401",
                "--notes",
                "Cancelled via CLI",
            ]
        )
        == 0
    )
    assert "cancelled" in capsys.readouterr().out

    assert (
        cli_main(["--db-path", str(db_file), "--role", "admin", "import-csv", str(sample_csv)])
        == 0
    )
    assert "imported=5, failed=0" in capsys.readouterr().out

    assert (
        cli_main(
            ["--db-path", str(db_file), "--role", "student_services", "analytics", "--report", "all"]
        )
        == 0
    )
    ana_out = capsys.readouterr().out
    assert "Overview KPIs" in ana_out
    assert "Other (<5)" in ana_out

    assert (
        cli_main(
            [
                "--db-path",
                str(db_file),
                "--role",
                "manager",
                "charts",
                "--output-dir",
                str(charts_out),
            ]
        )
        == 0
    )
    assert len(list(charts_out.glob("*.png"))) == 4


def test_interactive_menu_scripted_walkthrough(
    seeded_db: DatabaseManager, tmp_path: Path, repo_root: Path
) -> None:
    settings = AppSettings(
        schema_path=repo_root / "database" / "schema.sql",
        seed_data_path=repo_root / "database" / "seed_data.json",
        db_path=Path(seeded_db.db_path),
        charts_dir=tmp_path / "menu_charts",
    )
    container = build_service_container(db_manager=seeded_db, settings=settings)
    initial_actor = ActorContext(role=Role.ADMIN, user_id="ADMIN1")

    scripted_inputs = iter(
        [
            "1",
            "4",
            "2",
            "group_space",
            "",
            "5",
            "3",
            "2026-12-21T10:00:00Z",
            "2026-12-21T12:00:00Z",
            "group_space",
            "5",
            "LIB-GSR-6",
            "S1001",
            "2026-12-21T10:00:00Z",
            "2026-12-21T12:00:00Z",
            "Interactive menu booking",
            "",
            "3",
            "6",
            "401",
            "",
            "",
            "Updated interactive purpose",
            "",
            "7",
            "401",
            "cancel",
            "Done testing",
            "1",
            "1",
            "8",
            "9",
            str(tmp_path / "menu_charts"),
            "10",
            str(repo_root / "database" / "samples" / "sample_bookings.csv"),
            "0",
        ]
    )

    outputs: list[str] = []
    menu = InteractiveMenu(
        container,
        initial_actor,
        input_fn=lambda _prompt: next(scripted_inputs),
        output_fn=outputs.append,
    )
    rc = menu.run()
    assert rc == 0

    transcript = "\n".join(outputs)
    assert "Switched to: Active Actor: role=member | user_id=S1001" in transcript
    assert "Created booking #401" in transcript
    assert "Updated booking #401" in transcript
    assert "Booking #401 transitioned to 'cancelled'" in transcript
    assert "Course Fairness (k-Anonymised):" in transcript
    assert "Exported 4 charts" in transcript
    assert "imported=5, failed=0" in transcript
    assert len(list((tmp_path / "menu_charts").glob("*.png"))) == 4

