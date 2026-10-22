# Lab 3

| Deliverable | Author | Files |
| --- | --- | --- |
| Use case model: UC2-04 Commit to Session, UC2-05 Withdraw from Session, UC2-06 Verify Attendance | Yajie Wang | [use-cases/](./use-cases/) |
| Dialog map | Yajie Wang | this folder (below) |

## Use case model (UC2-04, UC2-05, UC2-06)

- [uc2-04-05-06-descriptions.md](./use-cases/uc2-04-05-06-descriptions.md): the three use case descriptions as submitted in the SRS (last updated 19/10/2026).
- [uc2-session-management-use-case-diagram.png](./use-cases/uc2-session-management-use-case-diagram.png): the UC2 (session management) use-case diagram from the SRS. It is shared with UC2-01 to UC2-03; Commit to Session, Withdraw from Session and Verify Attendance are the parts covered here.

## Dialog map

User-interface navigation map for Booking Web Manager, drawn as a UML state
machine: each state is a screen or dialog, and each transition is
`event(arguments)[guard] / action`. Dashed states are planned screens whose
API is on `main` but whose UI is not yet built.

| File | Contents |
| --- | --- |
| [dialog-map.pdf](./dialog-map.pdf), [dialog-map.png](./dialog-map.png), [dialog-map.svg](./dialog-map.svg) | Full map |
| [dialog-map-part1.png](./dialog-map-part1.png), [part2](./dialog-map-part2.png), [part3](./dialog-map-part3.png) | The same map split into report-sized parts |
| `*.drawio` | Editable sources (open in draw.io) |
| [build_dialog_map.py](./build_dialog_map.py) | Generates the `.drawio` sources |

To regenerate:

```bash
python3 build_dialog_map.py
drawio -x -f png -s 2 -o dialog-map.png dialog-map.drawio
drawio -x -f svg -o dialog-map.svg dialog-map.drawio
drawio -x -f pdf --crop -o dialog-map.pdf dialog-map.drawio
for i in 1 2 3; do drawio -x -f png -s 3 -b 20 -o dialog-map-part$i.png dialog-map-part$i.drawio; done
```
