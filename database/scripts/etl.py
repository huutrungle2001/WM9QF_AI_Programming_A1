#!/usr/bin/env python3
"""ETL pipeline: Extract Warwick raw snapshots -> Transform to 3NF CTI -> Load seed_data.json.

Reads static lookup/alias tables from database/scripts/etl_mappings.json and produces
the canonical seed catalogue matching docs/design/03_data_models.md.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
DB_DIR = SCRIPT_DIR.parent
DEFAULT_RAW_DIR = DB_DIR / "raw"
DEFAULT_OUT_PATH = DB_DIR / "seed_data.json"
DEFAULT_MAPPINGS_PATH = SCRIPT_DIR / "etl_mappings.json"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


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
    if "boardroom" in low:
        return "boardroom"
    if "tiered" in low:
        return "lecture"
    if "flexible" in low:
        return "flexible"
    if "teaching" in low:
        return "seminar"
    if rtype == "group_space":
        return "study_pod"
    return "standard"


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


class CatalogBuilder:
    """Accumulates CTI resources, subtypes, and deduplicated N:M facility links."""

    def __init__(
        self,
        valid_department_ids: set[str],
        name_to_building_id: dict[str, str],
        building_aliases: dict[str, str],
    ) -> None:
        self.valid_department_ids = valid_department_ids
        self.name_to_building_id = name_to_building_id
        self.building_aliases = building_aliases
        self.resources: list[dict[str, Any]] = []
        self.rooms: list[dict[str, Any]] = []
        self.equipment_items: list[dict[str, Any]] = []
        self.support_services: list[dict[str, Any]] = []
        self.facilities_by_name: dict[str, str] = {}
        self.resource_facilities: list[dict[str, str]] = []
        self._seen_ids: set[str] = set()

    def resolve_building(self, label: str) -> str | None:
        clean = re.sub(r",\s*University of Warwick$", "", label.strip(), flags=re.I).strip()
        if not clean:
            return None
        target = self.building_aliases.get(clean, clean)
        t_low = target.lower()
        if t_low in self.name_to_building_id:
            return self.name_to_building_id[t_low]
        for key, bid in self.name_to_building_id.items():
            if t_low in key or key in t_low:
                return bid
        return None

    def _register_facilities(self, resource_id: str, facility_names: list[str]) -> None:
        seen_for_res: set[str] = set()
        for raw_name in facility_names:
            fname = raw_name.strip()
            if not fname:
                continue
            fid = self.facilities_by_name.get(fname)
            if fid is None:
                fid = slugify(fname, max_len=28)
                used_ids = set(self.facilities_by_name.values())
                if fid in used_ids:
                    suffix = 2
                    while f"{fid}-{suffix}" in used_ids:
                        suffix += 1
                    fid = f"{fid}-{suffix}"
                self.facilities_by_name[fname] = fid
            if fid not in seen_for_res:
                seen_for_res.add(fid)
                self.resource_facilities.append({"resource_id": resource_id, "facility_id": fid})

    def add(
        self,
        parent: dict[str, Any],
        subtype_kind: str,
        subtype_row: dict[str, Any],
        facility_names: list[str],
    ) -> None:
        rid = parent["resource_id"]
        if rid in self._seen_ids:
            suffix = 2
            while f"{rid}-{suffix}" in self._seen_ids:
                suffix += 1
            rid = f"{rid}-{suffix}"
            parent["resource_id"] = rid
        self._seen_ids.add(rid)
        if parent["department_id"] not in self.valid_department_ids:
            raise ValueError(f"Invalid department_id {parent['department_id']} on {rid}")

        parent.setdefault("image_url", None)
        self.resources.append(parent)
        sub = {"resource_id": rid, **subtype_row}
        if subtype_kind == "room":
            self.rooms.append(sub)
        elif subtype_kind == "equipment":
            self.equipment_items.append(sub)
        elif subtype_kind == "support":
            self.support_services.append(sub)
        else:
            raise ValueError(f"Unknown subtype_kind: {subtype_kind}")

        self._register_facilities(rid, facility_names)

    def facilities_list(self) -> list[dict[str, str]]:
        return [
            {"facility_id": fid, "facility_name": fname}
            for fname, fid in sorted(self.facilities_by_name.items(), key=lambda kv: kv[1])
        ]


def transform_departments(raw_dir: Path, mappings: dict[str, Any]) -> list[dict[str, str]]:
    off = load_json(raw_dir / "warwick_rooms" / "official_departments.json")
    known_codes: dict[str, str] = mappings["known_dept_codes"]
    by_code: dict[str, dict[str, str]] = {}
    used_names: set[str] = set()

    for entry in off.get("departments", []):
        if ":" in entry:
            faculty, name = [p.strip() for p in entry.split(":", 1)]
        elif entry.startswith("Sci., Eng. and Med."):
            faculty, name = "Sci., Eng. and Med.", entry.replace("Sci., Eng. and Med.", "").strip()
        else:
            faculty, name = "Cross faculty", entry.strip()

        code = known_codes.get(name) or slugify(name, max_len=12).replace("-", "")[:12]
        if code in by_code or name in used_names:
            continue
        by_code[code] = {"department_id": code, "department_name": name, "faculty": faculty}
        used_names.add(name)

    for extra in mappings["extra_departments"]:
        by_code.setdefault(extra["department_id"], dict(extra))

    return sorted(by_code.values(), key=lambda x: x["department_id"])


def transform_buildings(raw_dir: Path) -> tuple[list[dict[str, Any]], dict[str, str]]:
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
        floors = [str(f.get("name", "")).strip() for f in b.get("floors", []) if str(f.get("name", "")).strip()]
        buildings.append(
            {
                "building_id": bid,
                "building_name": name,
                "zone": infer_zone(name, campus, b.get("lat"), b.get("lon")),
                "lat": b.get("lat"),
                "lon": b.get("lon"),
                "floor_count": len(floors) or 1,
            }
        )
        key = name.lower()
        if key not in name_to_id or campus == "Central Campus":
            name_to_id[key] = bid

    buildings.sort(key=lambda x: x["building_name"].lower())
    return buildings, name_to_id


def ingest_central_rooms(raw_dir: Path, builder: CatalogBuilder) -> None:
    av_rows = load_json(raw_dir / "warwick_rooms" / "central_av_tags.json").get("rooms", [])
    central_av = {r["slug"].lower(): r["facilities"] for r in av_rows}
    central_panorama = {r["slug"].lower(): r["panorama_url"] for r in av_rows if r.get("panorama_url")}
    wrb_slugs = {
        (wr.get("info_url") or "").rstrip("/").split("/")[-1].lower()
        for wr in load_json(raw_dir / "wrb" / "student_rooms.json").get("rooms", [])
        if wr.get("info_url")
    }

    for bld in load_json(raw_dir / "warwick_rooms" / "central_rooms.json").get("buildings", []):
        b_name = bld["name"].strip()
        bid = builder.resolve_building(b_name)
        for rm in bld.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 10), 1)
            is_lab = b_name == "IT Access Areas"
            elig_if_open = "all_users" if slug in wrb_slugs else "staff_only"
            if is_lab:
                rtype, dept, elig, checkin = "computer_lab", "IDG", "staff_only", "card_swipe"
            elif cap <= 16:
                rtype, dept, elig, checkin = "study_room", "CENTRAL", elig_if_open, "none"
            else:
                rtype, dept, elig, checkin = "group_space", "CENTRAL", elig_if_open, "none"

            facs = list(central_av.get(slug, []))
            if is_lab and "Desktop PCs" not in facs:
                facs.append("Desktop PCs")

            builder.add(
                {
                    "resource_id": f"CTR-{slugify(slug, 18)}",
                    "resource_name": rm["name"].strip(),
                    "resource_type": rtype,
                    "department_id": dept,
                    "building_id": bid,
                    "location": rm["name"].strip(),
                    "description": f"Central campus {rtype.replace('_', ' ')} in {b_name} ({rm.get('type', 'flat')}). Open 09:00-22:00. No food or drink permitted.",
                    "image_url": central_panorama.get(slug),
                    "requires_approval": 1,
                    "booking_eligibility": elig,
                    "checkin_method": checkin,
                    "status": "active",
                },
                "room",
                {"capacity": cap, "room_style": infer_room_style(rm.get("type", ""), rtype)},
                facs,
            )


def ingest_meeting_and_local_rooms(raw_dir: Path, builder: CatalogBuilder, dept_aliases: dict[str, str]) -> None:
    meeting_av = {
        r["slug"].lower(): r["facilities"]
        for r in load_json(raw_dir / "warwick_rooms" / "meeting_av_tags.json").get("rooms", [])
    }
    for bld in load_json(raw_dir / "warwick_rooms" / "meeting_rooms.json").get("buildings", []):
        b_name = bld["name"].strip()
        bid = builder.resolve_building(b_name)
        for rm in bld.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 4), 1)
            builder.add(
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
                "room",
                {"capacity": cap, "room_style": infer_room_style(rm.get("type", "boardroom"), "study_room")},
                meeting_av.get(slug, []),
            )

    for dep in load_json(raw_dir / "warwick_rooms" / "local_rooms.json").get("departments", []):
        d_name = dep["name"].strip()
        dept_id = dept_aliases.get(d_name, "CENTRAL")
        bid = builder.resolve_building(d_name)
        for rm in dep.get("rooms", []):
            slug = (rm.get("url") or slugify(rm["name"])).lower()
            cap = max(int(rm.get("capacity") or 10), 1)
            rtype = "study_room" if cap <= 12 else "group_space"
            builder.add(
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
                "room",
                {"capacity": cap, "room_style": infer_room_style(rm.get("type", ""), rtype)},
                [],
            )


def ingest_library_rooms(raw_dir: Path, builder: CatalogBuilder) -> None:
    rootes_bid = builder.resolve_building("Rootes")
    lib_bid = builder.resolve_building("Library")
    junction_bid = builder.resolve_building("Junction")

    lib_grid = load_json(raw_dir / "library" / "roombooking_group_study_grid.json")
    for rm in lib_grid.get("rooms", []):
        builder.add(
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
            "room",
            {"capacity": 8, "room_style": "study_pod"},
            ["Large Display Screen", "Whiteboard", "PIN Door Access"],
        )

    for sp in load_json(raw_dir / "library" / "libspaces_directory.json").get("bookable_specialist_rooms", []):
        is_group = sp["resource_type"] == "group_space"
        builder.add(
            {
                "resource_id": sp["resource_id"],
                "resource_name": sp["name"],
                "resource_type": sp["resource_type"],
                "department_id": "LIB",
                "building_id": builder.resolve_building(sp["building"]),
                "location": sp["location_detail"],
                "description": f"{sp.get('eligibility_note') or 'Library specialist space.'} Hours: {sp.get('opening_hours') or 'TBC'}.",
                "requires_approval": sp["requires_approval"],
                "booking_eligibility": sp["booking_eligibility"],
                "checkin_method": sp["checkin_method"],
                "status": sp.get("status", "active"),
            },
            "room",
            {"capacity": sp["capacity"], "room_style": "flexible" if is_group else "standard"},
            ["Flexible Furniture", "Display Screen"] if is_group else ["Fixed Computer", "Webcam & Microphone", "PIN Door Access"],
        )

    lib_books = load_json(raw_dir / "library" / "bookable_rooms.json")
    for acc in lib_books.get("accessible_study_rooms", []):
        name = acc["name"]
        is_pg = "postgrad" in name.lower()
        rid_suffix = "PGHUB" if is_pg else slugify(name.replace("Accessible Study Room", "").strip(), 10)
        builder.add(
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
            "room",
            {"capacity": 2, "room_style": "standard"},
            ["Accessible Room", "Fixed Computer", "Height-Adjustable Desk", "Whiteboard", "Automatic Doors", "Card Check-In Reader"],
        )

    for pg_line in lib_books.get("pg_hub_rooms", []):
        match = re.match(r"Room\s+(\d+)\s*-\s*(.*)", pg_line)
        if not match or match.group(1) == "7":
            continue
        rnum, desc = match.group(1), match.group(2)
        cap_m = re.search(r"up to (\d+)", desc)
        facs = ["Display Screen", "Solstice Wireless Casting"] + (["Logitech MeetUp"] if "Logitech" in desc else [])
        builder.add(
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
            "room",
            {"capacity": int(cap_m.group(1)) if cap_m else 6, "room_style": "study_pod"},
            facs,
        )


def ingest_computer_labs(raw_dir: Path, builder: CatalogBuilder) -> None:
    wa_meta = {
        m["title"].strip().rstrip("*").lower(): m
        for m in load_json(raw_dir / "workareas" / "metadata.json").get("items", [])
    }
    for wa in load_json(raw_dir / "workareas" / "live.json").get("workareas", []):
        room, bld = wa["room"].strip(), wa["building"].strip()
        meta = wa_meta.get(room.lower()) or wa_meta.get(bld.lower()) or {}
        facs = ["Desktop PCs", "Windows Workstations", "Card Access"]
        if meta.get("linux"):
            facs.append("Linux Workstations")
        if meta.get("avEquipment"):
            facs.append("Tutor PC & Projector")
        builder.add(
            {
                "resource_id": f"LAB-{slugify(room, 18)}",
                "resource_name": f"PC Work Area — {room} ({bld})",
                "resource_type": "computer_lab",
                "department_id": "IDG",
                "building_id": builder.resolve_building(bld) or builder.resolve_building(room),
                "location": room,
                "description": f"Open-access campus PC laboratory ({meta.get('hoursHtml') or 'building opening hours'}); whole-room teaching reservations restricted to staff.",
                "requires_approval": 0,
                "booking_eligibility": "staff_only",
                "checkin_method": "card_swipe",
                "status": "active",
            },
            "room",
            {"capacity": max(int(wa.get("total") or 1), 1), "room_style": "standard"},
            facs,
        )


def ingest_support_services(raw_dir: Path, builder: CatalogBuilder, event_types: set[str]) -> None:
    for tp in load_json(raw_dir / "myadvantage" / "appointment_topics.json").get("topics", []):
        builder.add(
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
            "support",
            {"category": infer_support_area(tp["name"]), "max_attendees": 1, "host_name": "Student Opportunity & Careers Team"},
            ["MS Teams Consultation", "1-on-1 Advisor"],
        )

    seen_ws: set[str] = set()
    for ev in load_json(raw_dir / "myadvantage" / "events.json").get("events", []):
        if ev.get("isCancelled") or ev.get("type") not in event_types:
            continue
        title = (ev.get("title") or "").strip()
        if not title or title.lower() in seen_ws:
            continue
        seen_ws.add(title.lower())
        loc = (ev.get("location") or "Online (MS Teams)").strip()
        is_online = "online" in loc.lower() or "teams" in loc.lower()
        is_wmg = "wmg" in title.lower()
        builder.add(
            {
                "resource_id": f"SUP-WS-{ev['entityId']}",
                "resource_name": title,
                "resource_type": "academic_support",
                "department_id": "WMG" if is_wmg else "CAREERS",
                "building_id": None if is_online else builder.resolve_building(loc),
                "location": loc,
                "description": f"Group support workshop ({ev.get('type')}). Open 09:00-18:00.",
                "requires_approval": 0,
                "booking_eligibility": "all_users",
                "checkin_method": "none",
                "status": "active",
            },
            "support",
            {
                "category": infer_support_area(f"{title} {ev.get('type') or ''}"),
                "max_attendees": 30,
                "host_name": "WMG Careers Team" if is_wmg else "Student Opportunity & Careers Team",
            },
            ["Workshop Session"],
        )


def ingest_equipment(builder: CatalogBuilder, equipment_catalog: list[dict[str, Any]]) -> None:
    for item in equipment_catalog:
        eq = dict(item)
        facs = eq.pop("facilities")
        category, qty, specs = eq.pop("category"), eq.pop("quantity"), eq.pop("specifications")
        building_label = eq.pop("building_label")
        builder.add(
            {
                **eq,
                "building_id": builder.resolve_building(building_label),
                "resource_type": "specialist_equipment",
                "status": "active",
            },
            "equipment",
            {"category": category, "quantity": qty, "specifications": specs},
            facs,
        )


def validate_catalog(
    departments: list[dict[str, Any]],
    buildings: list[dict[str, Any]],
    builder: CatalogBuilder,
) -> None:
    valid_depts = {d["department_id"] for d in departments}
    valid_blds = {b["building_id"] for b in buildings}
    valid_res = {r["resource_id"] for r in builder.resources}
    valid_facs = set(builder.facilities_by_name.values())

    for r in builder.resources:
        assert r["department_id"] in valid_depts, f"Broken department_id: {r['department_id']}"
        if r["building_id"] is not None:
            assert r["building_id"] in valid_blds, f"Broken building_id: {r['building_id']}"
    assert all(rm["capacity"] > 0 for rm in builder.rooms)
    assert all(eq["quantity"] > 0 for eq in builder.equipment_items)
    assert all(sup["max_attendees"] > 0 for sup in builder.support_services)

    subtype_ids = (
        [x["resource_id"] for x in builder.rooms]
        + [x["resource_id"] for x in builder.equipment_items]
        + [x["resource_id"] for x in builder.support_services]
    )
    assert len(subtype_ids) == len(builder.resources) and set(subtype_ids) == valid_res, "CTI 1:1 coverage mismatch"
    assert all(rf["resource_id"] in valid_res and rf["facility_id"] in valid_facs for rf in builder.resource_facilities)


def build_catalog(raw_dir: Path, mappings_path: Path = DEFAULT_MAPPINGS_PATH) -> dict[str, Any]:
    mappings = load_json(mappings_path)
    departments = transform_departments(raw_dir, mappings)
    buildings, name_to_building_id = transform_buildings(raw_dir)
    builder = CatalogBuilder(
        valid_department_ids={d["department_id"] for d in departments},
        name_to_building_id=name_to_building_id,
        building_aliases=mappings["building_alias_to_mazemap"],
    )

    ingest_central_rooms(raw_dir, builder)
    ingest_meeting_and_local_rooms(raw_dir, builder, mappings["local_dept_alias"])
    ingest_library_rooms(raw_dir, builder)
    ingest_computer_labs(raw_dir, builder)
    ingest_support_services(raw_dir, builder, set(mappings["support_event_types"]))
    ingest_equipment(builder, mappings["equipment_catalog"])

    validate_catalog(departments, buildings, builder)
    facilities = builder.facilities_list()
    statuses = mappings["booking_statuses"]

    return {
        "schema_version": "3.1-domain-cti",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "departments": len(departments),
            "buildings": len(buildings),
            "booking_statuses": len(statuses),
            "resources_total": len(builder.resources),
            "cti_subtypes": {
                "rooms": len(builder.rooms),
                "equipment_items": len(builder.equipment_items),
                "support_services": len(builder.support_services),
            },
            "facilities_total": len(facilities),
            "resource_facilities_links": len(builder.resource_facilities),
            "resources_by_type": dict(sorted(Counter(r["resource_type"] for r in builder.resources).items())),
            "resources_by_eligibility": dict(sorted(Counter(r["booking_eligibility"] for r in builder.resources).items())),
        },
        "departments": departments,
        "buildings": buildings,
        "booking_statuses": statuses,
        "resources": builder.resources,
        "rooms": builder.rooms,
        "equipment_items": builder.equipment_items,
        "support_services": builder.support_services,
        "facilities": facilities,
        "resource_facilities": builder.resource_facilities,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="ETL Warwick raw snapshots into database/seed_data.json")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--mappings", type=Path, default=DEFAULT_MAPPINGS_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_PATH)
    args = parser.parse_args()

    catalog = build_catalog(args.raw_dir, args.mappings)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    print(f"Wrote {args.out} ({args.out.stat().st_size:,} bytes)")
    print(json.dumps(catalog["summary"], indent=2))


if __name__ == "__main__":
    main()

