#!/usr/bin/env python3
"""Adapter script normalizing raw Warwick snapshots into the 11-table domain-pure catalog.json.

Maps external Warwick portal snapshots into the canonical 3NF CTI schema defined in
docs/design/models.md (zero external-portal column leakage, zero JSON columns):
  - departments, buildings, booking_statuses (6 lifecycle states)
  - resources (11-column supertype: location, description, policy/status)
  - rooms (capacity, room_style, noise_zone, min_group_size)
  - equipment_items (category, quantity, specifications)
  - support_services (support_area, session_kind, delivery_mode, max_attendees, host_user_id)
  - facilities, resource_facilities (N:M lookup)
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_DIR = Path(__file__).resolve().parent.parent
DEFAULT_RAW_DIR = DB_DIR / "raw"
DEFAULT_OUT_PATH = DB_DIR / "catalog.json"

BOOKING_STATUSES = [
    {"status_id": "pending", "description": "Awaiting staff/manager approval; holds slot", "blocks_slot": 1},
    {"status_id": "confirmed", "description": "Approved and active reservation", "blocks_slot": 1},
    {"status_id": "cancelled", "description": "Cancelled by user or staff prior to use; slot released", "blocks_slot": 0},
    {"status_id": "rejected", "description": "Pending request declined by manager/admin; slot released", "blocks_slot": 0},
    {"status_id": "completed", "description": "Session or equipment loan completed", "blocks_slot": 0},
    {"status_id": "no_show", "description": "User failed to attend or check in; slot released", "blocks_slot": 0},
]

KNOWN_DEPT_CODES: dict[str, str] = {
    "Warwick Manufacturing Group (WMG)": "WMG",
    "Computer Science": "CS",
    "Engineering": "ENG",
    "Mathematics": "MATH",
    "Statistics": "STAT",
    "Chemistry": "CHEM",
    "Physics": "PHYS",
    "Psychology": "PSYC",
    "Life Sciences": "LIFESCI",
    "Systems Biology": "SYSBIO",
    "Warwick Medical School": "WMS",
    "Warwick Business School": "WBS",
    "Economics": "ECON",
    "Law": "LAW",
    "Philosophy": "PHIL",
    "Politics and International Studies": "PAIS",
    "Sociology": "SOC",
    "Applied Linguistics": "APPLING",
    "Centre for Education Studies": "CES",
    "Centre for Lifelong Learning": "CLL",
    "Centre for Teacher Education": "CTE",
    "Institute for Employment Research": "IER",
    "Warwick Foundation Studies": "WFS",
    "History": "HIST",
    "History of Art": "HISTART",
    "Liberal Arts": "LIBARTS",
    "Global Sustainable Development": "GSD",
    "Film and Television Studies": "FILM",
    "Design Studies": "DESIGN",
    "English and Comparative Literary Studies": "ENGL",
    "Classics and Ancient History": "CLASSICS",
    "Comparative American Studies": "CAS",
    "Cultural Media Policy Studies": "CMPS",
    "Digital Arts & Humanities Lab": "DAHL",
    "Centre for the Study of the Renaissance": "CSR",
    "School for Cross-faculty Studies": "SCFS",
    "School of Creative Arts, Performance and Visual Cultures": "SCAPVC",
    "School of Modern Languages and Cultures": "SMLC",
    "Theatre and Performance Studies": "THEATRE",
    "Warwick Writing Programme": "WWP",
    "Arts Faculty": "ARTSFAC",
    "Science, Engineering and Medicine Faculty": "SEMFAC",
    "Dean of Students Office": "DOSO",
    "Education Policy and Quality": "EPQ",
    "Information and Digital Group (IDG)": "IDG",
    "Library": "LIB",
    "Student Experience": "STUEXP",
    "Widening Participation": "WP",
    "WIHEA": "WIHEA",
    "Cross faculty": "CROSSFAC",
    "Academic Development Centre": "ADC",
    "Institute for Advanced Teaching and Learning (IATL)": "IATL",
}

EXTRA_DEPARTMENTS: list[dict[str, str]] = [
    {"department_id": "CENTRAL", "department_name": "Central Timetabling Office", "faculty": "Services"},
    {"department_id": "CAREERS", "department_name": "Student Opportunity & Careers", "faculty": "Services"},
    {"department_id": "ESTATES", "department_name": "Estates Office", "faculty": "Services"},
    {"department_id": "SPORT", "department_name": "Warwick Sport", "faculty": "Services"},
    {"department_id": "HR", "department_name": "Human Resources", "faculty": "Services"},
    {"department_id": "MUSIC", "department_name": "Music Centre", "faculty": "Services"},
]

LOCAL_DEPT_ALIAS: dict[str, str] = {
    "Chemistry": "CHEM",
    "Computer Science": "CS",
    "Cultural & Media Policy Studies": "CMPS",
    "Economics": "ECON",
    "Engineering": "ENG",
    "Estates": "ESTATES",
    "Faculty of Arts": "ARTSFAC",
    "Film & TV": "FILM",
    "Library": "LIB",
    "Mathematics and Statistics": "MATH",
    "PAIS": "PAIS",
    "Physics": "PHYS",
    "Psychology": "PSYC",
    "Ramphal": "CENTRAL",
    "Rootes Learning Grid": "LIB",
    "School of Law": "LAW",
    "SELCS": "SMLC",
    "Senate House": "CENTRAL",
    "Social Sciences": "SOC",
    "Sociology": "SOC",
    "Sports And Wellness Hub": "SPORT",
    "Sports Pavillion": "SPORT",
    "The Beehive": "ESTATES",
    "Warwick Writing Programme": "WWP",
    "University House - Human Resources": "HR",
    "University House - Learning Grid": "LIB",
    "Gibbet Hill - Biotechnology": "LIFESCI",
    "Gibbet Hill - Clinical Trials": "WMS",
    "Gibbet Hill - Medical School": "WMS",
    "Gibbet Hill - Medical Teaching Centre": "WMS",
    "Gibbet Hill - Interdisciplinary Biomedical Research": "WMS",
    "Westwood - Engineering Management Building": "WMG",
    "Westwood - Lifelong Learning": "CLL",
    "Westwood - New Education Building": "CES",
}

BUILDING_ALIAS_TO_MAZEMAP: dict[str, str] = {
    "Arts Centre": "Warwick Arts Centre",
    "Faculty of Arts": "Faculty of Arts",
    "Faculty of Arts Building": "Faculty of Arts",
    "Humanities": "Humanities Building",
    "International Manufacturing Centre": "International Manufacturing Centre (IMC)",
    "IT Access Areas": "Library",
    "Junction": "Junction",
    "Library": "Library",
    "Main Library": "Library",
    "Library 20 Min PCs": "Library",
    "Library (Floor 1)": "Library",
    "Library (Floor 2)": "Library",
    "Library (Floor 3)": "Library",
    "Library (Floor 5)": "Library",
    "Lib Ground Floor (R039)": "Library",
    "Lib Ground Floor (R041)": "Library",
    "Mathematical Sciences": "Zeeman",
    "Mathematics and Statistics": "Zeeman",
    "Zeeman": "Zeeman",
    "Zeeman (A001)": "Zeeman",
    "A002": "Zeeman",
    "A003": "Zeeman",
    "Millburn House": "Millburn House",
    "Ramphal": "Ramphal Building",
    "Rootes": "Rootes",
    "Rootes Learning Grid": "Rootes",
    "Senate House": "Senate House",
    "Social Sciences": "Social Sciences North and South",
    "Sciences": "Physical Sciences",
    "The Oculus": "The Oculus",
    "Gibbet Hill - Biotechnology": "Life Sciences",
    "Gibbet Hill - Medical Teaching Centre": "Medical Teaching Centre",
    "Gibbet Hill - Warwick Medical School": "Medical Teaching Centre",
    "Gibbet Hill - Medical School": "Medical Teaching Centre",
    "Warwick Medical School": "Medical Teaching Centre",
    "Gibbet Hill - Interdisciplinary Biomedical Research": "Interdisciplinary Biomedical Research Building (IBRB)",
    "Gibbet Hill - Clinical Trials": "Clinical Trials Unit",
    "Westwood - Avon Building": "Avon",
    "Avon Multimedia Centre": "Avon",
    "Westwood - Cafe Aroma": "Westwood Teaching Centre",
    "Westwood - Lifelong Learning": "Westwood Teaching Centre",
    "Westwood - Music Centre": "Music Centre",
    "Westwood - Westwood Teaching Centre": "Westwood Teaching Centre",
    "Westwood - Engineering Management Building": "Engineering Management Building",
    "Westwood - New Education Building": "New Education",
    "Argent Court": "Argent Court",
    "Swallow House": "Swallow House",
    "University House - MR": "University House",
    "University House - Annex": "University House Annex",
    "University House - Consultation Rooms": "University House",
    "University House - Other Locations & Pods": "University House",
    "University House - Human Resources": "University House",
    "University House - Learning Grid": "University House",
    "Chemistry": "Science Block A (Engineering & Chemistry)",
    "Computer Science": "Computer Science Building",
    "Engineering": "Engineering Block",
    "Physics": "Physics",
    "Psychology": "Psychology Building",
    "Sports And Wellness Hub": "Sports Hub",
    "Sports Pavillion": "Cryfield Sports Pavilion",
    "PAIS": "Social Sciences North and South",
    "School of Law": "Social Sciences North and South",
    "Economics": "Social Sciences North and South",
    "Sociology": "Social Sciences North and South",
    "Film & TV": "Faculty of Arts",
    "Cultural & Media Policy Studies": "Faculty of Arts",
    "SELCS": "Faculty of Arts",
    "Warwick Writing Programme": "Faculty of Arts",
    "Estates": "Estates Stores",
    "The Beehive": "The Beehive",
}

SUPPORT_EVENT_TYPES = {
    "Careers workshops",
    "Departmental Careers Workshops",
    "Development",
    "Student Support",
    "Student Visa Online Workshops",
    "Work Experience Placements and Internships",
    "WMG Careers",
    "Careers Webinar",
    "Intercultural Skills workshops",
    "Mock interview",
    "Job sector events",
}


def slugify(text: str, max_len: int = 24) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", text.strip()).strip("-").upper()
    return cleaned[:max_len] or "ITEM"


def infer_zone(name: str, campus: str, lat: float | None, lon: float | None) -> str:
    low = name.lower()
    if "innovation" in campus.lower():
        return "Innovation Campus"
    if any(k in low for k in ("gibbet hill", "medical", "biomedical", "life sciences", "clinical trials", "ibrb")):
        return "Gibbet Hill Site"
    if any(k in low for k in ("westwood", "avon", "new education", "engineering management", "aroma")):
        return "Westwood Site"
    if lat is not None and lat < 52.3755:
        return "Gibbet Hill Site"
    if lon is not None and lon < -1.573:
        return "Westwood Site"
    return "Main Site"


def infer_room_style(raw_type: str, rtype: str) -> str:
    low = (raw_type or "").lower()
    if rtype == "computer_lab":
        return "computer_lab"
    if "boardroom" in low:
        return "boardroom"
    if "tiered" in low:
        return "lecture"
    if "teaching" in low:
        return "seminar"
    if rtype == "study_room":
        return "individual_study"
    return "study_pod"


def infer_support_area(text: str) -> str:
    low = text.lower()
    if any(k in low for k in ("disability", "neurodiverg")):
        return "disability_advice"
    if any(k in low for k in ("writing", "statement", "essay")):
        return "writing"
    if any(k in low for k in ("math", "stat", "data")):
        return "maths_stats"
    if any(k in low for k in ("career", "job", "interview", "placement", "work experience", "cv")):
        return "careers"
    if any(k in low for k in ("skill", "study", "assessment", "library")):
        return "study_skills"
    return "general"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_departments(raw_dir: Path) -> list[dict[str, str]]:
    off = load_json(raw_dir / "warwick_rooms" / "official_departments.json")
    by_code: dict[str, dict[str, str]] = {}
    used_names: set[str] = set()

    for entry in off.get("departments", []):
        if ":" in entry:
            faculty, name = [p.strip() for p in entry.split(":", 1)]
        elif entry.startswith("Sci., Eng. and Med."):
            faculty = "Sci., Eng. and Med."
            name = entry.replace("Sci., Eng. and Med.", "").strip()
        else:
            faculty = "Cross faculty"
            name = entry.strip()

        code = KNOWN_DEPT_CODES.get(name) or slugify(name, max_len=12).replace("-", "")[:12]
        if code in by_code or name in used_names:
            continue
        by_code[code] = {"department_id": code, "department_name": name, "faculty": faculty}
        used_names.add(name)

    for extra in EXTRA_DEPARTMENTS:
        if extra["department_id"] not in by_code:
            by_code[extra["department_id"]] = dict(extra)

    return sorted(by_code.values(), key=lambda x: x["department_id"])


def normalize_buildings(raw_dir: Path) -> tuple[list[dict[str, Any]], dict[str, str]]:
    mm = load_json(raw_dir / "mazemap" / "buildings.json")
    buildings: list[dict[str, Any]] = []
    name_to_id: dict[str, str] = {}

    seen_ids: set[str] = set()
    for b in mm.get("buildings", []):
        bid = f"MM-{b['building_id']}"
        if bid in seen_ids:
            continue
        seen_ids.add(bid)
        name = b["name"].strip()
        campus = b.get("campus_name", "Central Campus").strip()
        lat = b.get("lat")
        lon = b.get("lon")
        floors = [str(f.get("name", "")).strip() for f in b.get("floors", []) if str(f.get("name", "")).strip()]

        buildings.append(
            {
                "building_id": bid,
                "building_name": name,
                "zone": infer_zone(name, campus, lat, lon),
                "lat": lat,
                "lon": lon,
                "floor_count": len(floors) if floors else 1,
            }
        )
        key = name.lower()
        if key not in name_to_id or campus == "Central Campus":
            name_to_id[key] = bid

    buildings.sort(key=lambda x: x["building_name"].lower())
    return buildings, name_to_id


def resolve_building_id(label: str, name_to_id: dict[str, str]) -> str | None:
    clean = label.strip()
    if not clean:
        return None
    target = BUILDING_ALIAS_TO_MAZEMAP.get(clean, clean)
    if target.lower() in name_to_id:
        return name_to_id[target.lower()]
    t_low = target.lower()
    for k, bid in name_to_id.items():
        if t_low in k or k in t_low:
            return bid
    return None


def normalize_resources(
    raw_dir: Path,
    name_to_building_id: dict[str, str],
    valid_department_ids: set[str],
) -> dict[str, list[dict[str, Any]]]:
    resources: list[dict[str, Any]] = []
    rooms: list[dict[str, Any]] = []
    equipment_items: list[dict[str, Any]] = []
    support_services: list[dict[str, Any]] = []
    facilities_by_name: dict[str, str] = {}
    resource_facilities: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    def register_facilities(resource_id: str, facility_names: list[str]) -> None:
        seen_for_res: set[str] = set()
        for raw_name in facility_names:
            fname = raw_name.strip()
            if not fname:
                continue
            fid = facilities_by_name.get(fname)
            if fid is None:
                fid = slugify(fname, max_len=28)
                if fid in facilities_by_name.values():
                    n = 2
                    while f"{fid}-{n}" in facilities_by_name.values():
                        n += 1
                    fid = f"{fid}-{n}"
                facilities_by_name[fname] = fid
            if fid not in seen_for_res:
                seen_for_res.add(fid)
                resource_facilities.append({"resource_id": resource_id, "facility_id": fid})

    def add_resource(
        parent: dict[str, Any],
        subtype_kind: str,
        subtype_row: dict[str, Any],
        facility_names: list[str],
    ) -> None:
        rid = parent["resource_id"]
        if rid in seen_ids:
            suffix = 2
            while f"{rid}-{suffix}" in seen_ids:
                suffix += 1
            rid = f"{rid}-{suffix}"
            parent["resource_id"] = rid
        seen_ids.add(rid)
        if parent["department_id"] not in valid_department_ids:
            raise ValueError(f"Invalid department_id {parent['department_id']} on {rid}")
        resources.append(parent)

        sub = {"resource_id": rid, **subtype_row}
        if subtype_kind == "room":
            rooms.append(sub)
        elif subtype_kind == "equipment":
            equipment_items.append(sub)
        elif subtype_kind == "support":
            support_services.append(sub)
        else:
            raise ValueError(f"Unknown subtype_kind: {subtype_kind}")

        register_facilities(rid, facility_names)

    central_av = {
        r["slug"].lower(): r["facilities"]
        for r in load_json(raw_dir / "warwick_rooms" / "central_av_tags.json").get("rooms", [])
    }
    meeting_av = {
        r["slug"].lower(): r["facilities"]
        for r in load_json(raw_dir / "warwick_rooms" / "meeting_av_tags.json").get("rooms", [])
    }
    wrb_rooms = load_json(raw_dir / "wrb" / "student_rooms.json").get("rooms", [])
    wrb_slugs = {
        (wr.get("info_url") or "").rstrip("/").split("/")[-1].lower()
        for wr in wrb_rooms
        if wr.get("info_url")
    }

    # 1. Central Rooms & IT Access Areas -> rooms
    central = load_json(raw_dir / "warwick_rooms" / "central_rooms.json")
    for bld in central.get("buildings", []):
        b_name = bld["name"].strip()
        bid = resolve_building_id(b_name, name_to_building_id)
        for rm in bld.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 10), 1)
            is_lab = b_name == "IT Access Areas"
            is_student_bookable = slug in wrb_slugs
            if is_lab:
                rtype, dept, elig, checkin = "computer_lab", "IDG", "staff_only", "card_swipe"
                min_grp, noise = 1, "quiet"
            elif cap <= 16:
                rtype, dept, elig, checkin = "study_room", "CENTRAL", ("all_users" if is_student_bookable else "staff_only"), "none"
                min_grp, noise = 1, "quiet"
            else:
                rtype, dept, elig, checkin = "group_space", "CENTRAL", ("all_users" if is_student_bookable else "staff_only"), "none"
                min_grp, noise = min(4, cap), "collaborative"

            facs = list(central_av.get(slug, []))
            if is_lab and "Desktop PCs" not in facs:
                facs.append("Desktop PCs")

            add_resource(
                {
                    "resource_id": f"CTR-{slugify(slug, 18)}",
                    "resource_name": rm["name"].strip(),
                    "resource_type": rtype,
                    "department_id": dept,
                    "building_id": bid,
                    "location": rm["name"].strip(),
                    "description": f"Central campus {rtype.replace('_', ' ')} in {b_name} ({rm.get('type', 'flat')}). Open 09:00-22:00. No food or drink permitted.",
                    "requires_approval": 1,
                    "booking_eligibility": elig,
                    "checkin_method": checkin,
                    "status": "active",
                },
                subtype_kind="room",
                subtype_row={
                    "capacity": cap,
                    "room_style": infer_room_style(rm.get("type", ""), rtype),
                    "noise_zone": noise,
                    "min_group_size": min_grp,
                },
                facility_names=facs,
            )

    # 2. Meeting & Consultation Rooms -> rooms (study_room)
    meeting = load_json(raw_dir / "warwick_rooms" / "meeting_rooms.json")
    for bld in meeting.get("buildings", []):
        b_name = bld["name"].strip()
        bid = resolve_building_id(b_name, name_to_building_id)
        for rm in bld.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 4), 1)
            add_resource(
                {
                    "resource_id": f"MTG-{slugify(slug, 18)}",
                    "resource_name": f"{rm['name'].strip()} ({b_name})",
                    "resource_type": "study_room",
                    "department_id": "CENTRAL",
                    "building_id": bid,
                    "location": rm["name"].strip(),
                    "description": f"Centrally managed meeting/consultation room in {b_name} ({rm.get('type', 'boardroom')}). Open 08:00-20:00.",
                    "requires_approval": 0,
                    "booking_eligibility": "staff_only",
                    "checkin_method": "none",
                    "status": "active",
                },
                subtype_kind="room",
                subtype_row={
                    "capacity": cap,
                    "room_style": infer_room_style(rm.get("type", "boardroom"), "study_room"),
                    "noise_zone": "quiet",
                    "min_group_size": 1,
                },
                facility_names=meeting_av.get(slug, []),
            )

    # 3. Departmental Rooms -> rooms
    local = load_json(raw_dir / "warwick_rooms" / "local_rooms.json")
    for dep in local.get("departments", []):
        d_name = dep["name"].strip()
        dept_id = LOCAL_DEPT_ALIAS.get(d_name, "CENTRAL")
        bid = resolve_building_id(d_name, name_to_building_id)
        for rm in dep.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 10), 1)
            rtype = "study_room" if cap <= 12 else "group_space"
            add_resource(
                {
                    "resource_id": f"LOC-{dept_id}-{slugify(slug, 14)}",
                    "resource_name": f"{rm['name'].strip()} ({d_name})",
                    "resource_type": rtype,
                    "department_id": dept_id,
                    "building_id": bid,
                    "location": rm["name"].strip(),
                    "description": f"Departmental room managed by {d_name}. Open 08:30-18:00.",
                    "requires_approval": 0,
                    "booking_eligibility": "staff_only",
                    "checkin_method": "none",
                    "status": "active",
                },
                subtype_kind="room",
                subtype_row={
                    "capacity": cap,
                    "room_style": infer_room_style(rm.get("type", ""), rtype),
                    "noise_zone": "quiet" if rtype == "study_room" else "collaborative",
                    "min_group_size": 1 if rtype == "study_room" else 2,
                },
                facility_names=[],
            )

    # 4. Library Bookable Rooms -> rooms
    lib_grid = load_json(raw_dir / "library" / "roombooking_group_study_grid.json")
    rootes_bid = resolve_building_id("Rootes", name_to_building_id)
    lib_bid = resolve_building_id("Library", name_to_building_id)
    junction_bid = resolve_building_id("Junction", name_to_building_id)

    for rm in lib_grid.get("rooms", []):
        add_resource(
            {
                "resource_id": f"LIB-GSR-{rm['room_id']}",
                "resource_name": rm["name"],
                "resource_type": "group_space",
                "department_id": "LIB",
                "building_id": rootes_bid,
                "location": rm["name"],
                "description": f"Bookable group study room in Rootes Learning Grid (open {lib_grid.get('open_hours', '09:00-22:00')}). 4-digit PIN door access; consecutive hourly slots merge.",
                "requires_approval": 0,
                "booking_eligibility": "students_only",
                "checkin_method": "pin",
                "status": "active",
            },
            subtype_kind="room",
            subtype_row={"capacity": 8, "room_style": "study_pod", "noise_zone": "collaborative", "min_group_size": 2},
            facility_names=["Large Display Screen", "Whiteboard", "PIN Door Access"],
        )

    lib_dir = load_json(raw_dir / "library" / "libspaces_directory.json")
    for sp in lib_dir.get("bookable_specialist_rooms", []):
        sp_bid = resolve_building_id(sp["building"], name_to_building_id)
        is_group = sp["resource_type"] == "group_space"
        add_resource(
            {
                "resource_id": sp["resource_id"],
                "resource_name": sp["name"],
                "resource_type": sp["resource_type"],
                "department_id": "LIB",
                "building_id": sp_bid,
                "location": sp["location_detail"],
                "description": f"{sp.get('eligibility_note') or 'Library specialist space.'} Hours: {sp.get('opening_hours') or 'TBC'}.",
                "requires_approval": sp["requires_approval"],
                "booking_eligibility": sp["booking_eligibility"],
                "checkin_method": sp["checkin_method"],
                "status": sp.get("status", "active"),
            },
            subtype_kind="room",
            subtype_row={
                "capacity": sp["capacity"],
                "room_style": "flexible" if is_group else "individual_study",
                "noise_zone": "collaborative" if is_group else "quiet",
                "min_group_size": 2 if is_group else 1,
            },
            facility_names=(
                ["Flexible Furniture", "Display Screen"]
                if is_group
                else ["Fixed Computer", "Webcam & Microphone", "PIN Door Access"]
            ),
        )

    lib_books = load_json(raw_dir / "library" / "bookable_rooms.json")
    for acc in lib_books.get("accessible_study_rooms", []):
        name = acc["name"]
        is_pg = "postgrad" in name.lower()
        rid_suffix = "PGHUB" if is_pg else slugify(name.replace("Accessible Study Room", "").strip(), 10)
        is_collab = any(n in name for n in ("114", "204"))
        add_resource(
            {
                "resource_id": f"LIB-ACC-{rid_suffix}",
                "resource_name": name,
                "resource_type": "study_room",
                "department_id": "LIB",
                "building_id": junction_bid if is_pg else lib_bid,
                "location": "PG Hub Room 7" if is_pg else name.replace("Accessible Study ", ""),
                "description": f"Open 08:00-22:00. {(acc.get('details') or 'Accessible study room for Disability Services registered students.')[:240]}",
                "requires_approval": 0,
                "booking_eligibility": "disability_only",
                "checkin_method": "card_swipe",
                "status": "active",
            },
            subtype_kind="room",
            subtype_row={
                "capacity": 2,
                "room_style": "individual_study",
                "noise_zone": "collaborative" if is_collab else "quiet",
                "min_group_size": 1,
            },
            facility_names=[
                "Accessible Room",
                "Fixed Computer",
                "Height-Adjustable Desk",
                "Whiteboard",
                "Automatic Doors",
                "Card Check-In Reader",
            ],
        )

    for pg_line in lib_books.get("pg_hub_rooms", []):
        m = re.match(r"Room\s+(\d+)\s*-\s*(.*)", pg_line)
        if not m or m.group(1) == "7":
            continue
        rnum, desc = m.group(1), m.group(2)
        cap_m = re.search(r"up to (\d+)", desc)
        cap = int(cap_m.group(1)) if cap_m else 6
        facs = ["Display Screen", "Solstice Wireless Casting"]
        if "Logitech" in desc:
            facs.append("Logitech MeetUp")
        add_resource(
            {
                "resource_id": f"LIB-PGHUB-{rnum}",
                "resource_name": f"PG Hub Group Study Room {rnum}",
                "resource_type": "group_space",
                "department_id": "LIB",
                "building_id": junction_bid,
                "location": f"PG Hub Room {rnum}",
                "description": f"Postgraduate student group study room (open 08:00-22:00). {desc}",
                "requires_approval": 0,
                "booking_eligibility": "pg_only",
                "checkin_method": "none",
                "status": "active",
            },
            subtype_kind="room",
            subtype_row={"capacity": cap, "room_style": "study_pod", "noise_zone": "collaborative", "min_group_size": 2},
            facility_names=facs,
        )

    # 5. Computer Labs (Open Access PC Work Areas) -> rooms (computer_lab)
    wa_live = load_json(raw_dir / "workareas" / "live.json").get("workareas", [])
    wa_meta = {
        m["title"].strip().rstrip("*").lower(): m
        for m in load_json(raw_dir / "workareas" / "metadata.json").get("items", [])
    }
    for wa in wa_live:
        room = wa["room"].strip()
        bld = wa["building"].strip()
        meta = wa_meta.get(room.lower()) or wa_meta.get(bld.lower()) or {}
        bid = resolve_building_id(bld, name_to_building_id) or resolve_building_id(room, name_to_building_id)
        facs = ["Desktop PCs", "Windows Workstations", "Card Access"]
        if meta.get("linux"):
            facs.append("Linux Workstations")
        if meta.get("avEquipment"):
            facs.append("Tutor PC & Projector")
        add_resource(
            {
                "resource_id": f"LAB-{slugify(room, 18)}",
                "resource_name": f"PC Work Area — {room} ({bld})",
                "resource_type": "computer_lab",
                "department_id": "IDG",
                "building_id": bid,
                "location": room,
                "description": f"Open-access campus PC laboratory ({meta.get('hoursHtml') or 'building opening hours'}); whole-room teaching reservations restricted to staff.",
                "requires_approval": 0,
                "booking_eligibility": "staff_only",
                "checkin_method": "card_swipe",
                "status": "active",
            },
            subtype_kind="room",
            subtype_row={
                "capacity": max(int(wa.get("total") or 1), 1),
                "room_style": "computer_lab",
                "noise_zone": "quiet",
                "min_group_size": 1,
            },
            facility_names=facs,
        )

    # 6. Academic Support Services -> support_services
    topics = load_json(raw_dir / "myadvantage" / "appointment_topics.json").get("topics", [])
    for tp in topics:
        add_resource(
            {
                "resource_id": f"SUP-1TO1-{tp['topic_id']}",
                "resource_name": f"1-on-1 Support: {tp['name']}",
                "resource_type": "academic_support",
                "department_id": "CAREERS",
                "building_id": None,
                "location": "Online (MS Teams) / Student Opportunity Hub",
                "description": f"Open 09:00-17:00. {(tp.get('summary') or '1-on-1 student academic/career support consultation.')[:240]}",
                "requires_approval": 0,
                "booking_eligibility": "students_only",
                "checkin_method": "none",
                "status": "active",
            },
            subtype_kind="support",
            subtype_row={
                "support_area": infer_support_area(tp["name"]),
                "session_kind": "one_to_one",
                "delivery_mode": "hybrid",
                "max_attendees": 1,
                "host_user_id": None,
            },
            facility_names=["MS Teams Consultation", "1-on-1 Advisor"],
        )

    events = load_json(raw_dir / "myadvantage" / "events.json").get("events", [])
    seen_ws: set[str] = set()
    for ev in events:
        if ev.get("isCancelled") or ev.get("type") not in SUPPORT_EVENT_TYPES:
            continue
        title = (ev.get("title") or "").strip()
        if not title or title.lower() in seen_ws:
            continue
        seen_ws.add(title.lower())
        loc = (ev.get("location") or "Online (MS Teams)").strip()
        bid = None if ("online" in loc.lower() or "teams" in loc.lower()) else resolve_building_id(loc, name_to_building_id)
        add_resource(
            {
                "resource_id": f"SUP-WS-{ev['entityId']}",
                "resource_name": title,
                "resource_type": "academic_support",
                "department_id": "WMG" if "wmg" in title.lower() else "CAREERS",
                "building_id": bid,
                "location": loc,
                "description": f"Group support workshop ({ev.get('type')}). Open 09:00-18:00.",
                "requires_approval": 0,
                "booking_eligibility": "all_users",
                "checkin_method": "none",
                "status": "active",
            },
            subtype_kind="support",
            subtype_row={
                "support_area": infer_support_area(title + " " + (ev.get("type") or "")),
                "session_kind": "group_workshop",
                "delivery_mode": "online" if bid is None else "in_person",
                "max_attendees": 30,
                "host_user_id": None,
            },
            facility_names=["Workshop Session"],
        )

    # 7. Specialist Equipment -> equipment_items (generalised, pooled capacity)
    imc_bid = resolve_building_id("International Manufacturing Centre", name_to_building_id)
    cs_bid = resolve_building_id("Computer Science", name_to_building_id)
    music_bid = resolve_building_id("Westwood - Music Centre", name_to_building_id)

    equipment_catalog = [
        {
            "resource_id": "EQ-LIB-LOCKER-LAPTOP",
            "resource_name": "Library Laptop Loan Locker Pool",
            "department_id": "LIB",
            "building_id": lib_bid,
            "location": "Floor 1 Lobby Laptop Lockers",
            "description": "Self-service student laptop loan lockers available 24/7 (max 7-day loan).",
            "requires_approval": 0,
            "booking_eligibility": "students_only",
            "checkin_method": "card_swipe",
            "category": "laptop",
            "quantity": 24,
            "specifications": "IDG-managed Windows laptops with standard campus software suite; swipe university ID card at locker to collect/return.",
            "facilities": ["IDG Managed Laptop", "Campus Software Suite", "Self-Service Locker"],
        },
        {
            "resource_id": "EQ-IDG-LOAN-LAPTOP",
            "resource_name": "IDG Short-Term Student Loan Laptop",
            "department_id": "IDG",
            "building_id": lib_bid,
            "location": "IDG Helpdesk, Main Library",
            "description": "Free short-term laptop loan for students whose personal device is under repair (09:00-17:00; max 7 days).",
            "requires_approval": 1,
            "booking_eligibility": "students_only",
            "checkin_method": "none",
            "category": "laptop",
            "quantity": 15,
            "specifications": "Windows 11 laptop, power adapter, and protective sleeve; overdue loans escalate to department.",
            "facilities": ["Windows 11 Laptop", "Charger & Sleeve"],
        },
        {
            "resource_id": "EQ-WMG-VR-KIT-01",
            "resource_name": "WMG XR / VR Development Headset Kit",
            "department_id": "WMG",
            "building_id": imc_bid,
            "location": "WMG Digital Lab Counter",
            "description": "Loanable VR/XR development kit for coursework prototyping and demos (09:00-17:00).",
            "requires_approval": 1,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "category": "vr_xr",
            "quantity": 4,
            "specifications": "Standalone/PCVR headset, dual motion controllers, high-speed USB-C tether cable, carry case.",
            "facilities": ["VR Headset", "Motion Controllers"],
        },
        {
            "resource_id": "EQ-CS-GPU-WORKSTATION",
            "resource_name": "DCS Local CUDA GPU Compute Workstation",
            "department_id": "CS",
            "building_id": cs_bid,
            "location": "AI Systems Lab",
            "description": "Dedicated local GPU workstation for deep learning experiments and model training (08:00-20:00).",
            "requires_approval": 1,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "category": "compute",
            "quantity": 4,
            "specifications": "Ubuntu Linux workstation with NVIDIA RTX GPU and CUDA Toolkit pre-installed.",
            "facilities": ["NVIDIA RTX GPU", "Linux Workstations", "CUDA Toolkit"],
        },
        {
            "resource_id": "EQ-IDG-AV-KIT-01",
            "resource_name": "Portable Hybrid Meeting Kit",
            "department_id": "IDG",
            "building_id": lib_bid,
            "location": "IDG Audio Visual Services Counter",
            "description": "Portable conferencing kit for hybrid seminars and student society events (09:00-17:00).",
            "requires_approval": 1,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "category": "av_kit",
            "quantity": 6,
            "specifications": "360-degree smart conferencing camera (Meeting Owl), tripod, omnidirectional mic, USB-C cable.",
            "facilities": ["360 Camera", "Omnidirectional Mic"],
        },
        {
            "resource_id": "EQ-MUSIC-ENSEMBLE-KIT",
            "resource_name": "Music Centre Recording & Practice Kit",
            "department_id": "MUSIC",
            "building_id": music_bid,
            "location": "Music Centre Desk",
            "description": "Portable audio recording kit for ensemble practice and performance capture (09:00-21:00).",
            "requires_approval": 0,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "category": "instrument",
            "quantity": 5,
            "specifications": "USB audio interface, condenser microphone, XLR cable, adjustable music stand.",
            "facilities": ["Audio Interface", "Condenser Mic"],
        },
    ]
    for eq in equipment_catalog:
        facs = eq.pop("facilities")
        cat = eq.pop("category")
        qty = eq.pop("quantity")
        specs = eq.pop("specifications")
        add_resource(
            {**eq, "resource_type": "specialist_equipment", "status": "active"},
            subtype_kind="equipment",
            subtype_row={"category": cat, "quantity": qty, "specifications": specs},
            facility_names=facs,
        )

    facilities = [
        {"facility_id": fid, "facility_name": fname}
        for fname, fid in sorted(facilities_by_name.items(), key=lambda kv: kv[1])
    ]
    return {
        "resources": resources,
        "rooms": rooms,
        "equipment_items": equipment_items,
        "support_services": support_services,
        "facilities": facilities,
        "resource_facilities": resource_facilities,
    }


def build_catalog(raw_dir: Path) -> dict[str, Any]:
    departments = normalize_departments(raw_dir)
    buildings, name_to_building_id = normalize_buildings(raw_dir)
    valid_department_ids = {d["department_id"] for d in departments}
    valid_building_ids = {b["building_id"] for b in buildings}

    bundle = normalize_resources(raw_dir, name_to_building_id, valid_department_ids)
    resources = bundle["resources"]
    rooms = bundle["rooms"]
    equipment_items = bundle["equipment_items"]
    support_services = bundle["support_services"]
    facilities = bundle["facilities"]
    resource_facilities = bundle["resource_facilities"]

    valid_resource_ids = {r["resource_id"] for r in resources}
    valid_facility_ids = {f["facility_id"] for f in facilities}

    for r in resources:
        assert r["department_id"] in valid_department_ids, f"Broken department_id: {r['department_id']}"
        if r["building_id"] is not None:
            assert r["building_id"] in valid_building_ids, f"Broken building_id: {r['building_id']}"
    for rm in rooms:
        assert rm["capacity"] > 0
    for eq in equipment_items:
        assert eq["quantity"] > 0
    for sup in support_services:
        assert sup["max_attendees"] > 0

    subtype_ids = (
        [x["resource_id"] for x in rooms]
        + [x["resource_id"] for x in equipment_items]
        + [x["resource_id"] for x in support_services]
    )
    assert len(subtype_ids) == len(resources) and set(subtype_ids) == valid_resource_ids, "CTI 1:1 coverage mismatch"

    for rf in resource_facilities:
        assert rf["resource_id"] in valid_resource_ids
        assert rf["facility_id"] in valid_facility_ids

    return {
        "schema_version": "3.1-domain-cti",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "departments": len(departments),
            "buildings": len(buildings),
            "booking_statuses": len(BOOKING_STATUSES),
            "resources_total": len(resources),
            "cti_subtypes": {
                "rooms": len(rooms),
                "equipment_items": len(equipment_items),
                "support_services": len(support_services),
            },
            "facilities_total": len(facilities),
            "resource_facilities_links": len(resource_facilities),
            "resources_by_type": dict(sorted(Counter(r["resource_type"] for r in resources).items())),
            "resources_by_eligibility": dict(sorted(Counter(r["booking_eligibility"] for r in resources).items())),
        },
        "departments": departments,
        "buildings": buildings,
        "booking_statuses": BOOKING_STATUSES,
        "resources": resources,
        "rooms": rooms,
        "equipment_items": equipment_items,
        "support_services": support_services,
        "facilities": facilities,
        "resource_facilities": resource_facilities,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize Warwick raw snapshots into database/catalog.json")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_PATH)
    args = parser.parse_args()

    catalog = build_catalog(args.raw_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    print(f"Wrote {args.out} ({args.out.stat().st_size:,} bytes)")
    print(json.dumps(catalog["summary"], indent=2))


if __name__ == "__main__":
    main()
