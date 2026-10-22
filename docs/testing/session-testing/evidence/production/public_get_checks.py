"""Read-only public production GET checks; retain only sanitized observations."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://booking-web-manager.vercel.app"
OUTPUT = Path(__file__).resolve().parent
START = datetime.now(timezone.utc)
STAMP = START.strftime("%Y%m%dT%H%M%SZ")
SGT = timezone(timedelta(hours=8))
PUBLIC_FIELDS = {
    "sessionId", "venueName", "sport", "region", "startAt", "endAt",
    "totalSlots", "bookingShareCents",
}


def item(identifier, scenario, label, query, status=200, kind="discovery"):
    return {
        "id": identifier, "scenario": scenario, "label": label,
        "path": "/api/openapi" if kind == "openapi" else "/api/sessions",
        "query": query, "expected_status": status, "kind": kind,
    }


CASES = [
    item("GET01", "D01 anonymous subcase; D04 empty query", "Anonymous baseline", []),
    item("GET02", "D05 99-character subcase", "q has 99 characters", [("q", "x" * 99)]),
    item("GET03", "D05 100-character subcase", "q has 100 characters", [("q", "x" * 100)]),
    item("GET04", "D05 101-character subcase", "q has 101 characters", [("q", "x" * 101)], 400),
    item("GET05", "D05 trimming extension", "100 characters surrounded by spaces", [("q", "  " + "x" * 100 + "  ")]),
    item("GET06", "D07 impossible-date subcase", "Invalid calendar date", [("date", "2026-02-30")], 400),
    item("GET07", "D07 time-without-date subcase", "Time supplied without date", [("timeFrom", "18:00")], 400),
    item("GET08", "D07 equal-times subcase", "Equal time bounds", [("date", "2026-11-01"), ("timeFrom", "18:00"), ("timeTo", "18:00")], 400),
    item("GET09", "D07 reversed-times subcase", "Reversed time bounds", [("date", "2026-11-01"), ("timeFrom", "20:00"), ("timeTo", "18:00")], 400),
    item("GET10", "D07 duplicate-sport subcase", "Duplicate known sport parameter", [("sport", "Tennis"), ("sport", "Badminton")], 400),
    item("GET11", "D07 unknown-sport subcase", "Unknown sport", [("sport", "Cricket")], 400),
    item("GET12", "D07 malformed-time extension", "Time outside clock range", [("date", "2026-11-01"), ("timeFrom", "24:00")], 400),
    item("GET13", "D07 invalid-region extension", "Unknown region", [("region", "UnknownRegion")], 400),
    item("GET14", "D07 malformed-cursor extension", "Invalid cursor characters", [("cursor", "%%%")], 400),
    item("GET15", "D07 oversized-cursor extension", "513-character cursor", [("cursor", "a" * 513)], 400),
    item("GET16", "D06 request acceptance only", "Valid Singapore date/time range", [("date", "2026-11-01"), ("timeFrom", "18:00"), ("timeTo", "20:00")]),
    item("GET17", "D04 percent acceptance only", "Literal percent request accepted", [("q", "%")]),
    item("GET18", "D04 underscore acceptance only", "Literal underscore request accepted", [("q", "_")]),
    item("GET19", "Supplemental public contract", "Public OpenAPI", [], kind="openapi"),
]


def check(case):
    started = datetime.now(timezone.utc)
    url = BASE + case["path"]
    if case["query"]:
        url += "?" + urllib.parse.urlencode(case["query"])
    request = urllib.request.Request(
        url, method="GET",
        headers={"Accept": "application/json", "User-Agent": "BookingWebManager-PublicReadOnlyValidation/1.0"},
    )
    status = None
    headers = {}
    body = b""
    transport_error = None
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            status = response.status
            headers = dict(response.headers.items())
            body = response.read(2_000_000)
    except urllib.error.HTTPError as error:
        status = error.code
        headers = dict(error.headers.items())
        body = error.read(2_000_000)
    except Exception as error:
        transport_error = type(error).__name__
    headers = {key.lower(): value for key, value in headers.items()}
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeError):
        payload = None
    assertions = {
        "expected_http_status": status == case["expected_status"],
        "json_content_type": "application/json" in headers.get("content-type", ""),
        "json_object": isinstance(payload, dict),
    }
    observed = {
        "http_status": status,
        "content_type": headers.get("content-type"),
        "cache_control": headers.get("cache-control"),
        "response_sha256": hashlib.sha256(body).hexdigest(),
        "response_bytes": len(body),
    }
    if transport_error:
        observed["transport_error_type"] = transport_error
    if case["kind"] == "openapi":
        paths = payload.get("paths", {}) if isinstance(payload, dict) else {}
        discovery = paths.get("/api/sessions", {}).get("get", {})
        assertions.update({
            "openapi_version_present": isinstance(payload, dict) and isinstance(payload.get("openapi"), str),
            "public_discovery_documented": discovery.get("security") == [],
            "discovery_200_and_400_documented": all(str(code) in discovery.get("responses", {}) for code in [200, 400]),
        })
        observed.update({
            "openapi": payload.get("openapi") if isinstance(payload, dict) else None,
            "documented_path_count": len(paths),
            "discovery_security": discovery.get("security"),
            "discovery_response_statuses": sorted(discovery.get("responses", {}).keys()),
        })
    else:
        assertions["no_store_cache_policy"] = headers.get("cache-control") == "no-store"
        if case["expected_status"] == 400:
            error = payload.get("error", {}) if isinstance(payload, dict) else {}
            assertions["invalid_request_envelope"] = (
                isinstance(error, dict)
                and error.get("code") == "INVALID_REQUEST"
                and error.get("message") == "Invalid session discovery query"
            )
            observed["error_code"] = error.get("code") if isinstance(error, dict) else None
            observed["error_message"] = error.get("message") if isinstance(error, dict) else None
        else:
            rows = payload.get("items") if isinstance(payload, dict) else None
            cursor = payload.get("nextCursor") if isinstance(payload, dict) else None
            assertions["page_contract"] = (
                isinstance(payload, dict)
                and isinstance(rows, list)
                and "nextCursor" in payload
                and (cursor is None or isinstance(cursor, str))
            )
            assertions["page_size_at_most_20"] = isinstance(rows, list) and len(rows) <= 20
            assertions["public_projection_only"] = isinstance(rows, list) and all(
                isinstance(row, dict) and set(row) == PUBLIC_FIELDS for row in rows
            )
            observed["item_count"] = len(rows) if isinstance(rows, list) else None
            observed["has_next_cursor"] = isinstance(cursor, str)
            observed["item_field_sets"] = sorted({
                ",".join(sorted(row)) for row in rows if isinstance(row, dict)
            }) if isinstance(rows, list) else []
            if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
                observed["error_code"] = payload["error"].get("code")
                observed["error_reason"] = payload["error"].get("reason")
                observed["error_stage"] = payload["error"].get("stage")
    ended = datetime.now(timezone.utc)
    return {
        "id": case["id"], "scenario_subcase": case["scenario"], "label": case["label"],
        "method": "GET", "url": url, "authenticated": False,
        "started_at_utc": started.isoformat(), "finished_at_utc": ended.isoformat(),
        "started_at_sgt": started.astimezone(SGT).isoformat(),
        "expected": {
            "http_status": case["expected_status"],
            "contract": "OpenAPI public discovery contract" if case["kind"] == "openapi" else
                        "INVALID_REQUEST JSON and no-store" if case["expected_status"] == 400 else
                        "Discovery items/nextCursor JSON, at most 20 public projections and no-store",
        },
        "actual": observed, "assertions": assertions,
        "result": "PASS" if all(assertions.values()) else "FAIL",
    }


with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(check, CASES))
END = datetime.now(timezone.utc)
report = {
    "target": BASE, "started_at_utc": START.isoformat(), "finished_at_utc": END.isoformat(),
    "method_scope": "Unauthenticated GET only; no cookies/authentication, writes, seeds, fixtures or fault injection",
    "source_contracts": [
        "app/discover/query.ts:38-137", "app/discover/request.ts:5-9",
        "app/discover/response.ts:60-103", "app/discover/openapi.ts:75-152",
        "app/api/sessions/route.ts:9-13",
    ],
    "result_counts": {label: sum(row["result"] == label for row in results) for label in ["PASS", "FAIL"]},
    "scenario_scope": {
        "D01": "Anonymous API half only; signed-in and browser behavior not assessed here.",
        "D02": "Not run: no seeded visibility/lifecycle/capacity fixture matrix.",
        "D03": "Not run: production clock not controlled and millisecond fixtures not seeded.",
        "D04": "Empty-query and punctuation request acceptance observed; literal matching needs controlled data.",
        "D05": "Three specified API query-length subcases executed plus trimming extension.",
        "D06": "Valid range request acceptance only; no exact boundary fixture assertions.",
        "D07": "All stated malformed-query API subcases executed plus cursor/time/region extensions.",
        "D08": "Only naturally observed page count; 0/1/20/21 fixture matrix and pagination not established.",
        "C01-C08/V01-V08/R01-R08/X01-X08": "Not run in this GET-only unauthenticated investigation.",
    },
    "observations": results,
}
path = OUTPUT / f"public-get-checks-{STAMP}.json"
path.write_text(json.dumps(report, indent=2) + "\n")
lines = [
    "# Public production GET observations", "",
    f"Target: {BASE}", f"Started (SGT): {START.astimezone(SGT).isoformat()}",
    f"Finished (SGT): {END.astimezone(SGT).isoformat()}", "",
    "Unauthenticated GET requests only. Responses are summarized without listing session identities, venue names or cookies.",
    "Each row is a specific API check, not an entire scenario-group pass.", "",
    "| Check | Scenario/subcase | Expected HTTP | Actual HTTP | Observation | Result |",
    "|---|---|---:|---:|---|---|",
]
for row in results:
    actual = row["actual"]
    observation = f"items={actual['item_count']}; next={actual['has_next_cursor']}" if "item_count" in actual else (
        actual.get("error_code") or f"OpenAPI {actual.get('openapi')}; paths={actual.get('documented_path_count')}"
    )
    failures = [name for name, passed in row["assertions"].items() if not passed]
    if failures:
        observation += "; failed=" + ", ".join(failures)
    lines.append(f"| {row['id']} | {row['scenario_subcase']} | {row['expected']['http_status']} | {actual['http_status']} | {observation} | {row['result']} |")
lines.extend(["", "## Limitations", ""])
lines.extend(f"- {key}: {value}" for key, value in report["scenario_scope"].items())
markdown = OUTPUT / f"public-get-checks-{STAMP}.md"
markdown.write_text("\n".join(lines) + "\n")
print(json.dumps({"json": str(path), "markdown": str(markdown), "counts": report["result_counts"]}))
for row in results:
    actual = row["actual"]
    print(row["id"], row["label"], "expected", row["expected"]["http_status"],
          "actual", actual["http_status"], "items", actual.get("item_count"),
          "error", actual.get("error_code"), row["result"])
