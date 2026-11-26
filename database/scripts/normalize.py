#!/usr/bin/env python3
"""Normalize raw Warwick multi-portal snapshots into a strict 3NF CTI catalog.json.

Reads database/raw/<source>/*.json and produces database/catalog.json aligned 1-to-1 with
the 12-table Class Table Inheritance (CTI) zero-JSON schema in docs/models.md:
  - departments, buildings (atomic floor_count), booking_statuses
  - resources (supertype)
  - room_resources, lab_resources, equipment_resources, support_resources (1:1 subtypes)
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
    {
        "status_id": "confirmed",
        "description": "Approved and active reservation",
        "blocks_slot": 1,
    },
    {
        "status_id": "pending",
        "description": "Awaiting staff/timetabling approval; holds slot",
        "blocks_slot": 1,
    },
    {
        "status_id": "cancelled",
        "description": "Cancelled prior to use; slot released",
        "blocks_slot": 0,
    },
    {
        "status_id": "completed",
        "description": "Session or loan completed",
        "blocks_slot": 0,
    },
    {
        "status_id": "no_show",
        "description": "User failed to attend or check in; slot released",
        "blocks_slot": 0,
    },
]

# Canonical short codes for well-known Warwick departments & central services
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

# Additional central/operational units present in Warwick booking portals
EXTRA_DEPARTMENTS: list[dict[str, str]] = [
    {
        "department_id": "CENTRAL",
        "department_name": "Central Timetabling Office",
        "faculty": "Services",
    },
    {
        "department_id": "CAREERS",
        "department_name": "Student Opportunity & Careers (myAdvantage)",
        "faculty": "Services",
    },
    {
        "department_id": "ESTATES",
        "department_name": "Estates Office",
        "faculty": "Services",
    },
    {
        "department_id": "SPORT",
        "department_name": "Warwick Sport",
        "faculty": "Services",
    },
    {
        "department_id": "HR",
        "department_name": "Human Resources",
        "faculty": "Services",
    },
    {
        "department_id": "MUSIC",
        "department_name": "Music Centre",
        "faculty": "Services",
    },
]

# Map local_rooms department headings -> canonical department_id
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

# Map building labels from room-data.js / workareas / library -> MazeMap building name
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

# Academic/career/skills event types to retain from myAdvantage (excluding social/faith/food)
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


def iso_to_unix(value: str | None) -> int | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def infer_zone(name: str, campus: str, lat: float | None, lon: float | None) -> str:
    low = name.lower()
    if "innovation" in campus.lower():
        return "Innovation Campus"
    if any(k in low for k in ("gibbet hill", "medical", "biomedical", "life sciences", "clinical trials", "ibrb")):
        return "Gibbet Hill Site"
    if any(k in low for k in ("westwood", "avon", "new education", "engineering management", "aroma")):
        return "Westwood Site"
    # Use GPS heuristics if available (Gibbet Hill is south of 52.375; Westwood is north-west of -1.573)
    if lat is not None and lat < 52.3755:
        return "Gibbet Hill Site"
    if lon is not None and lon < -1.573:
        return "Westwood Site"
    return "Main Site"


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

        code = KNOWN_DEPT_CODES.get(name)
        if not code:
            code = slugify(name, max_len=12).replace("-", "")[:12]
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
        zone = infer_zone(name, campus, lat, lon)

        rec = {
            "building_id": bid,
            "building_name": name,
            "zone": zone,
            "lat": lat,
            "lon": lon,
            "floor_count": len(floors) if floors else 1,
        }
        buildings.append(rec)
        # Keep first match (or prefer Central Campus) for lowercased name lookup
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
    # Prefix/substring fallback
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
    room_resources: list[dict[str, Any]] = []
    lab_resources: list[dict[str, Any]] = []
    equipment_resources: list[dict[str, Any]] = []
    support_resources: list[dict[str, Any]] = []
    facilities_by_name: dict[str, str] = {}
    resource_facilities: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    def register_facilities(resource_id: str, facility_names: list[str]) -> None:
        seen_for_resource: set[str] = set()
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
            if fid not in seen_for_resource:
                seen_for_resource.add(fid)
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
            room_resources.append(sub)
        elif subtype_kind == "lab":
            lab_resources.append(sub)
        elif subtype_kind == "equipment":
            equipment_resources.append(sub)
        elif subtype_kind == "support":
            support_resources.append(sub)
        else:
            raise ValueError(f"Unknown subtype_kind: {subtype_kind}")

        register_facilities(rid, facility_names)

    # Load AV facility maps
    central_av = {
        r["slug"].lower(): r["facilities"]
        for r in load_json(raw_dir / "warwick_rooms" / "central_av_tags.json").get("rooms", [])
    }
    meeting_av = {
        r["slug"].lower(): r["facilities"]
        for r in load_json(raw_dir / "warwick_rooms" / "meeting_av_tags.json").get("rooms", [])
    }
    wrb_rooms = load_json(raw_dir / "wrb" / "student_rooms.json").get("rooms", [])
    wrb_by_slug: dict[str, dict[str, Any]] = {}
    for wr in wrb_rooms:
        info_url = wr.get("info_url") or ""
        slug = info_url.rstrip("/").split("/")[-1].lower() if info_url else wr["name"].lower()
        wrb_by_slug[slug] = wr

    # 1. Central Timetabled Rooms (214 rooms)
    central = load_json(raw_dir / "warwick_rooms" / "central_rooms.json")
    for bld in central.get("buildings", []):
        b_name = bld["name"].strip()
        bid = resolve_building_id(b_name, name_to_building_id)
        for rm in bld.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 10), 1)
            wrb_match = wrb_by_slug.get(slug)
            is_computer_room = b_name == "IT Access Areas"
            if is_computer_room:
                rtype = "computer_lab"
                dept = "IDG"
                booking_eligibility = "staff_only"
                checkin_method = "card_swipe"
            elif cap <= 16:
                rtype = "study_room"
                dept = "CENTRAL"
                booking_eligibility = "all_users" if wrb_match else "staff_only"
                checkin_method = "none"
            else:
                rtype = "group_space"
                dept = "CENTRAL"
                booking_eligibility = "all_users" if wrb_match else "staff_only"
                checkin_method = "none"

            add_resource(
                {
                    "resource_id": f"CTR-{slugify(slug, 18)}",
                    "resource_name": rm["name"].strip(),
                    "resource_type": rtype,
                    "department_id": dept,
                    "building_id": bid,
                    "location_detail": f"{b_name} — {rm['name'].strip()}",
                    "capacity": cap,
                    "booking_unit": "hourly",
                    "requires_approval": 1,
                    "booking_eligibility": booking_eligibility,
                    "checkin_method": checkin_method,
                    "status": "active",
                },
                subtype_kind="lab" if is_computer_room else "room",
                subtype_row=(
                    {
                        "has_linux": 0,
                        "bookable_for_teaching": 1,
                        "opening_hours": "08:00-22:00",
                    }
                    if is_computer_room
                    else {
                        "room_layout": (rm.get("type") or "flat").strip(),
                        "open_hours": "09:00-22:00",
                        "info_url": f"https://warwick.ac.uk/services/idg/services-support/av/lecturerooms/roominformation/{slug}",
                    }
                ),
                facility_names=central_av.get(slug, []),
            )

    # 2. Centrally Managed Meeting & Consultation Rooms (48 rooms)
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
                    "location_detail": f"{b_name} — {rm['name'].strip()}",
                    "capacity": cap,
                    "booking_unit": "hourly",
                    "requires_approval": 0,
                    "booking_eligibility": "staff_only",
                    "checkin_method": "none",
                    "status": "active",
                },
                subtype_kind="room",
                subtype_row={
                    "room_layout": (rm.get("type") or "flat, boardroom").strip(),
                    "open_hours": "08:00-20:00",
                    "info_url": f"https://warwick.ac.uk/services/idg/services-support/av/lecturerooms/meetingrooms/{slug}",
                },
                facility_names=meeting_av.get(slug, []),
            )

    # 3. Locally Timetabled Departmental Rooms (194 rooms across 34 departments)
    local = load_json(raw_dir / "warwick_rooms" / "local_rooms.json")
    for dep in local.get("departments", []):
        d_name = dep["name"].strip()
        department_id = LOCAL_DEPT_ALIAS.get(d_name, "CENTRAL")
        bid = resolve_building_id(d_name, name_to_building_id)
        for rm in dep.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 10), 1)
            rtype = "study_room" if cap <= 12 else "group_space"
            add_resource(
                {
                    "resource_id": f"LOC-{department_id}-{slugify(slug, 14)}",
                    "resource_name": f"{rm['name'].strip()} ({d_name})",
                    "resource_type": rtype,
                    "department_id": department_id,
                    "building_id": bid,
                    "location_detail": f"{d_name} — {rm['name'].strip()}",
                    "capacity": cap,
                    "booking_unit": "hourly",
                    "requires_approval": 0,
                    "booking_eligibility": "staff_only",
                    "checkin_method": "none",
                    "status": "active",
                },
                subtype_kind="room",
                subtype_row={
                    "room_layout": (rm.get("type") or "flat").strip(),
                    "open_hours": "08:30-18:00",
                    "info_url": None,
                },
                facility_names=[],
            )

    # 4. Library Bookable Rooms (Group Study, Online Meeting, Specialist Spaces, Accessible, PG Hub)
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
                "location_detail": f"Rootes Learning Grid — {rm['name']}",
                "capacity": 8,
                "booking_unit": "hourly",
                "requires_approval": 0,
                "booking_eligibility": "students_only",
                "checkin_method": "pin",
                "status": "active",
            },
            subtype_kind="room",
            subtype_row={
                "room_layout": "flat, group study",
                "open_hours": lib_grid.get("open_hours", "09:00-22:00"),
                "info_url": "https://roombooking.lib.warwick.ac.uk/",
            },
            facility_names=["Large Display Screen", "Whiteboard", "PIN Door Access"],
        )

    # Specialist bookable rooms & site status directly from libspaces_directory.json
    lib_dir = load_json(raw_dir / "library" / "libspaces_directory.json")
    for sp in lib_dir.get("bookable_specialist_rooms", []):
        sp_bid = resolve_building_id(sp["building"], name_to_building_id)
        sp_facs = (
            ["Flexible Furniture", "Display Screen"]
            if sp["resource_type"] == "group_space"
            else ["Fixed Computer", "Webcam & Microphone", "PIN Door Access"]
        )
        add_resource(
            {
                "resource_id": sp["resource_id"],
                "resource_name": sp["name"],
                "resource_type": sp["resource_type"],
                "department_id": "LIB",
                "building_id": sp_bid,
                "location_detail": sp["location_detail"],
                "capacity": sp["capacity"],
                "booking_unit": "hourly",
                "requires_approval": sp["requires_approval"],
                "booking_eligibility": sp["booking_eligibility"],
                "checkin_method": sp["checkin_method"],
                "status": sp.get("status", "active"),
            },
            subtype_kind="room",
            subtype_row={
                "room_layout": "flexible",
                "open_hours": sp.get("opening_hours"),
                "info_url": sp.get("booking_portal"),
            },
            facility_names=sp_facs,
        )

    lib_books = load_json(raw_dir / "library" / "bookable_rooms.json")
    for acc in lib_books.get("accessible_study_rooms", []):
        name = acc["name"]
        is_pg = "postgrad" in name.lower()
        rid_suffix = "PGHUB" if is_pg else slugify(name.replace("Accessible Study Room", "").strip(), 10)
        add_resource(
            {
                "resource_id": f"LIB-ACC-{rid_suffix}",
                "resource_name": name,
                "resource_type": "study_room",
                "department_id": "LIB",
                "building_id": junction_bid if is_pg else lib_bid,
                "location_detail": "Junction PG Hub — Room 7" if is_pg else f"Main Library — {name}",
                "capacity": 2,
                "booking_unit": "hourly",
                "requires_approval": 0,
                "booking_eligibility": "disability_only",
                "checkin_method": "card_swipe",
                "status": "active",
            },
            subtype_kind="room",
            subtype_row={
                "room_layout": "accessible, individual",
                "open_hours": "08:00-22:00",
                "info_url": "https://warwick.ac.uk/services/library/using/accessibility/accessible-study-rooms/",
            },
            facility_names=[
                "Fixed Computer",
                "Height-Adjustable Desk",
                "Whiteboard",
                "Automatic Doors",
                "Card Check-In Reader",
            ],
        )

    for pg_line in lib_books.get("pg_hub_rooms", []):
        m = re.match(r"Room\s+(\d+)\s*-\s*(.*)", pg_line)
        if not m:
            continue
        rnum, desc = m.group(1), m.group(2)
        if rnum == "7":
            continue  # Already captured under Accessible Study Room Postgrad Hub
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
                "location_detail": f"Junction — PG Hub Room {rnum}",
                "capacity": cap,
                "booking_unit": "hourly",
                "requires_approval": 0,
                "booking_eligibility": "pg_only",
                "checkin_method": "none",
                "status": "active",
            },
            subtype_kind="room",
            subtype_row={
                "room_layout": "flat, group study",
                "open_hours": "08:00-22:00",
                "info_url": "https://warwick.ac.uk/services/library/pghub/about/bookroom/",
            },
            facility_names=facs,
        )

    # 5. IDG Open Access PC Labs (Work Areas — 12 live labs enriched with metadata)
    wa_live = load_json(raw_dir / "workareas" / "live.json").get("workareas", [])
    wa_meta_list = load_json(raw_dir / "workareas" / "metadata.json").get("items", [])
    wa_meta = {m["title"].strip().rstrip("*").lower(): m for m in wa_meta_list}

    for wa in wa_live:
        room = wa["room"].strip()
        bld = wa["building"].strip()
        meta = wa_meta.get(room.lower()) or wa_meta.get(bld.lower()) or {}
        bid = resolve_building_id(bld, name_to_building_id) or resolve_building_id(room, name_to_building_id)
        facs = ["Desktop PCs", "Card Access"]
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
                "location_detail": f"{bld} — {room}",
                "capacity": max(int(wa.get("total") or 1), 1),
                "booking_unit": "hourly",
                "requires_approval": 0,
                "booking_eligibility": "staff_only",
                "checkin_method": "card_swipe",
                "status": "active",
            },
            subtype_kind="lab",
            subtype_row={
                "has_linux": 1 if meta.get("linux") else 0,
                "bookable_for_teaching": 1 if meta.get("bookable") else 0,
                "opening_hours": meta.get("hoursHtml") or "Building opening hours",
            },
            facility_names=facs,
        )

    # 6. Academic Support Services (myAdvantage 1-on-1 Topics + Selected Workshops)
    topics = load_json(raw_dir / "myadvantage" / "appointment_topics.json").get("topics", [])
    for tp in topics:
        add_resource(
            {
                "resource_id": f"SUP-1TO1-{tp['topic_id']}",
                "resource_name": f"1-on-1 Support: {tp['name']}",
                "resource_type": "academic_support",
                "department_id": "CAREERS",
                "building_id": None,
                "location_detail": "Online (MS Teams) / Student Opportunity Hub",
                "capacity": 1,
                "booking_unit": "hourly",
                "requires_approval": 0,
                "booking_eligibility": "students_only",
                "checkin_method": "none",
                "status": "active",
            },
            subtype_kind="support",
            subtype_row={
                "delivery_mode": "hybrid",
                "session_kind": "one_to_one",
                "scheduled_start": None,
                "scheduled_end": None,
            },
            facility_names=["MS Teams Consultation", "1-on-1 Advisor"],
        )

    events = load_json(raw_dir / "myadvantage" / "events.json").get("events", [])
    seen_workshop_titles: set[str] = set()
    for ev in events:
        if ev.get("isCancelled") or ev.get("type") not in SUPPORT_EVENT_TYPES:
            continue
        title = (ev.get("title") or "").strip()
        if not title or title.lower() in seen_workshop_titles:
            continue
        seen_workshop_titles.add(title.lower())
        loc = (ev.get("location") or "Online (MS Teams)").strip()
        bid = None if "online" in loc.lower() or "teams" in loc.lower() else resolve_building_id(loc, name_to_building_id)
        is_online = "online" in loc.lower() or "teams" in loc.lower() or bid is None
        add_resource(
            {
                "resource_id": f"SUP-WS-{ev['entityId']}",
                "resource_name": title,
                "resource_type": "academic_support",
                "department_id": "WMG" if "wmg" in title.lower() else "CAREERS",
                "building_id": bid,
                "location_detail": loc,
                "capacity": 30,
                "booking_unit": "hourly",
                "requires_approval": 0,
                "booking_eligibility": "all_users",
                "checkin_method": "none",
                "status": "active",
            },
            subtype_kind="support",
            subtype_row={
                "delivery_mode": "online" if is_online else "in_person",
                "session_kind": "workshop",
                "scheduled_start": iso_to_unix(ev.get("start")),
                "scheduled_end": iso_to_unix(ev.get("end")),
            },
            facility_names=["Workshop Session"],
        )

    # 7. Specialist Equipment (Policy-grounded catalogue matching verified Warwick services)
    imc_bid = resolve_building_id("International Manufacturing Centre", name_to_building_id)
    cs_bid = resolve_building_id("Computer Science", name_to_building_id)
    music_bid = resolve_building_id("Westwood - Music Centre", name_to_building_id)

    policy_equipment = [
        {
            "resource_id": "EQ-LIB-LOCKER-LAPTOP",
            "resource_name": "Library Laptop Loan Locker Pool (Windows/IDG Image)",
            "department_id": "LIB",
            "building_id": lib_bid,
            "location_detail": "Main Library — Floor 1 Lobby Laptop Lockers",
            "capacity": 24,
            "booking_unit": "daily",
            "requires_approval": 0,
            "booking_eligibility": "students_only",
            "checkin_method": "card_swipe",
            "facilities": ["IDG Managed Laptop", "Campus Software Suite", "Self-Service Locker"],
            "subtype": {"equipment_category": "laptop_loan", "max_loan_days": 7, "policy_ref": "warwick.ac.uk/services/library/using/laptop-loan-lockers/"},
        },
        {
            "resource_id": "EQ-IDG-LOAN-LAPTOP",
            "resource_name": "IDG Short-Term Student Loan Laptop (ServiceNow)",
            "department_id": "IDG",
            "building_id": lib_bid,
            "location_detail": "IDG Helpdesk — Main Library / ServiceNow Self-Service",
            "capacity": 15,
            "booking_unit": "daily",
            "requires_approval": 1,
            "booking_eligibility": "students_only",
            "checkin_method": "none",
            "facilities": ["Windows 11 Laptop", "Charger & Sleeve"],
            "subtype": {"equipment_category": "laptop_loan", "max_loan_days": 7, "policy_ref": "ServiceNow KB0003013"},
        },
        {
            "resource_id": "EQ-WMG-VR-KIT-01",
            "resource_name": "WMG XR / VR Development Headset Kit",
            "department_id": "WMG",
            "building_id": imc_bid,
            "location_detail": "International Manufacturing Centre — WMG Digital Lab",
            "capacity": 4,
            "booking_unit": "daily",
            "requires_approval": 1,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "facilities": ["VR Headset", "Motion Controllers", "High-Spec Tether Cable"],
            "subtype": {"equipment_category": "vr_hardware", "max_loan_days": 3, "policy_ref": "WMG Digital Lab Loan Policy"},
        },
        {
            "resource_id": "EQ-CS-GPU-WORKSTATION",
            "resource_name": "DCS Local CUDA GPU Compute Workstation",
            "department_id": "CS",
            "building_id": cs_bid,
            "location_detail": "Computer Science Building — AI Systems Lab",
            "capacity": 4,
            "booking_unit": "hourly",
            "requires_approval": 1,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "facilities": ["NVIDIA RTX GPU", "Ubuntu Linux", "CUDA Toolkit"],
            "subtype": {"equipment_category": "ai_compute", "max_loan_days": 1, "policy_ref": "DCS Compute Access Policy"},
        },
        {
            "resource_id": "EQ-IDG-AV-KIT-01",
            "resource_name": "Portable Hybrid Meeting Kit (Meeting Owl + Tripod)",
            "department_id": "IDG",
            "building_id": lib_bid,
            "location_detail": "IDG Audio Visual Services Counter",
            "capacity": 6,
            "booking_unit": "daily",
            "requires_approval": 1,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "facilities": ["360 Camera", "Omnidirectional Mic", "USB-C Cable"],
            "subtype": {"equipment_category": "av_equipment", "max_loan_days": 3, "policy_ref": "IDG AV Loan Guidelines"},
        },
        {
            "resource_id": "EQ-MUSIC-ENSEMBLE-KIT",
            "resource_name": "Music Centre Practice Instrument & Recording Kit",
            "department_id": "MUSIC",
            "building_id": music_bid,
            "location_detail": "Westwood — Music Centre",
            "capacity": 5,
            "booking_unit": "hourly",
            "requires_approval": 0,
            "booking_eligibility": "all_users",
            "checkin_method": "none",
            "facilities": ["Audio Interface", "Condenser Mic", "Music Stand"],
            "subtype": {"equipment_category": "music_equipment", "max_loan_days": 1, "policy_ref": "Music Centre Facilities Policy"},
        },
    ]
    for eq in policy_equipment:
        facs = eq.pop("facilities")
        sub = eq.pop("subtype")
        add_resource(
            {
                **eq,
                "resource_type": "specialist_equipment",
                "status": "active",
            },
            subtype_kind="equipment",
            subtype_row=sub,
            facility_names=facs,
        )

    facilities = [
        {"facility_id": fid, "facility_name": fname}
        for fname, fid in sorted(facilities_by_name.items(), key=lambda kv: kv[1])
    ]
    return {
        "resources": resources,
        "room_resources": room_resources,
        "lab_resources": lab_resources,
        "equipment_resources": equipment_resources,
        "support_resources": support_resources,
        "facilities": facilities,
        "resource_facilities": resource_facilities,
    }


def build_catalog(raw_dir: Path) -> dict[str, Any]:
    departments = normalize_departments(raw_dir)
    buildings, name_to_building_id = normalize_buildings(raw_dir)
    valid_department_ids = {d["department_id"] for d in departments}
    valid_building_ids = {b["building_id"] for b in buildings}

    res_bundle = normalize_resources(raw_dir, name_to_building_id, valid_department_ids)
    resources = res_bundle["resources"]
    room_resources = res_bundle["room_resources"]
    lab_resources = res_bundle["lab_resources"]
    equipment_resources = res_bundle["equipment_resources"]
    support_resources = res_bundle["support_resources"]
    facilities = res_bundle["facilities"]
    resource_facilities = res_bundle["resource_facilities"]

    valid_resource_ids = {r["resource_id"] for r in resources}
    valid_facility_ids = {f["facility_id"] for f in facilities}

    # Strict referential integrity verification before writing
    for r in resources:
        assert r["department_id"] in valid_department_ids, f"Broken department_id: {r['department_id']}"
        if r["building_id"] is not None:
            assert r["building_id"] in valid_building_ids, f"Broken building_id: {r['building_id']}"
        assert r["capacity"] > 0, f"Invalid capacity: {r['resource_id']}"

    # Strict 1:1 CTI coverage: every resource has exactly ONE subtype row
    subtype_ids = (
        [x["resource_id"] for x in room_resources]
        + [x["resource_id"] for x in lab_resources]
        + [x["resource_id"] for x in equipment_resources]
        + [x["resource_id"] for x in support_resources]
    )
    assert len(subtype_ids) == len(resources) and set(subtype_ids) == valid_resource_ids, "CTI 1:1 coverage mismatch"

    for rf in resource_facilities:
        assert rf["resource_id"] in valid_resource_ids
        assert rf["facility_id"] in valid_facility_ids

    type_counts = Counter(r["resource_type"] for r in resources)
    eligibility_counts = Counter(r["booking_eligibility"] for r in resources)
    checkin_counts = Counter(r["checkin_method"] for r in resources)
    with_building = sum(1 for r in resources if r["building_id"] is not None)
    with_facilities = len({rf["resource_id"] for rf in resource_facilities})

    return {
        "schema_version": "2.0-cti",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "departments": len(departments),
            "buildings": len(buildings),
            "booking_statuses": len(BOOKING_STATUSES),
            "resources_total": len(resources),
            "cti_subtypes": {
                "room_resources": len(room_resources),
                "lab_resources": len(lab_resources),
                "equipment_resources": len(equipment_resources),
                "support_resources": len(support_resources),
            },
            "facilities_total": len(facilities),
            "resource_facilities_links": len(resource_facilities),
            "resources_by_type": dict(sorted(type_counts.items())),
            "resources_by_eligibility": dict(sorted(eligibility_counts.items())),
            "resources_by_checkin_method": dict(sorted(checkin_counts.items())),
            "resources_linked_to_building": with_building,
            "resources_with_facilities": with_facilities,
        },
        "departments": departments,
        "buildings": buildings,
        "booking_statuses": BOOKING_STATUSES,
        "resources": resources,
        "room_resources": room_resources,
        "lab_resources": lab_resources,
        "equipment_resources": equipment_resources,
        "support_resources": support_resources,
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
