# Public production GET observations

Target: https://booking-web-manager.vercel.app
Started (SGT): 2026-10-20T16:16:09.524513+08:00
Finished (SGT): 2026-10-20T16:16:10.738105+08:00

Unauthenticated GET requests only. Responses are summarized without listing session identities, venue names or cookies.
Each row is a specific API check, not an entire scenario-group pass.

| Check | Scenario/subcase | Expected HTTP | Actual HTTP | Observation | Result |
|---|---|---:|---:|---|---|
| GET01 | D01 anonymous subcase; D04 empty query | 200 | 200 | items=0; next=False | PASS |
| GET02 | D05 99-character subcase | 200 | 200 | items=0; next=False | PASS |
| GET03 | D05 100-character subcase | 200 | 200 | items=0; next=False | PASS |
| GET04 | D05 101-character subcase | 400 | 400 | INVALID_REQUEST | PASS |
| GET05 | D05 trimming extension | 200 | 200 | items=0; next=False | PASS |
| GET06 | D07 impossible-date subcase | 400 | 400 | INVALID_REQUEST | PASS |
| GET07 | D07 time-without-date subcase | 400 | 400 | INVALID_REQUEST | PASS |
| GET08 | D07 equal-times subcase | 400 | 400 | INVALID_REQUEST | PASS |
| GET09 | D07 reversed-times subcase | 400 | 400 | INVALID_REQUEST | PASS |
| GET10 | D07 duplicate-sport subcase | 400 | 400 | INVALID_REQUEST | PASS |
| GET11 | D07 unknown-sport subcase | 400 | 400 | INVALID_REQUEST | PASS |
| GET12 | D07 malformed-time extension | 400 | 400 | INVALID_REQUEST | PASS |
| GET13 | D07 invalid-region extension | 400 | 400 | INVALID_REQUEST | PASS |
| GET14 | D07 malformed-cursor extension | 400 | 400 | INVALID_REQUEST | PASS |
| GET15 | D07 oversized-cursor extension | 400 | 400 | INVALID_REQUEST | PASS |
| GET16 | D06 request acceptance only | 200 | 200 | items=0; next=False | PASS |
| GET17 | D04 percent acceptance only | 200 | 200 | items=0; next=False | PASS |
| GET18 | D04 underscore acceptance only | 200 | 200 | items=0; next=False | PASS |
| GET19 | Supplemental public contract | 200 | 200 | OpenAPI 3.0.3; paths=23 | PASS |

## Limitations

- D01: Anonymous API half only; signed-in and browser behavior not assessed here.
- D02: Not run: no seeded visibility/lifecycle/capacity fixture matrix.
- D03: Not run: production clock not controlled and millisecond fixtures not seeded.
- D04: Empty-query and punctuation request acceptance observed; literal matching needs controlled data.
- D05: Three specified API query-length subcases executed plus trimming extension.
- D06: Valid range request acceptance only; no exact boundary fixture assertions.
- D07: All stated malformed-query API subcases executed plus cursor/time/region extensions.
- D08: Only naturally observed page count; 0/1/20/21 fixture matrix and pagination not established.
- C01-C08/V01-V08/R01-R08/X01-X08: Not run in this GET-only unauthenticated investigation.
