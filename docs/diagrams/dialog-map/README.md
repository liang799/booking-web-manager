# Dialog map

User-interface navigation map for Booking Web Manager, drawn as a UML state
machine: each state is a screen or dialog, and each transition is
`event(arguments)[guard] / action`. Dashed states are planned screens whose
API is on `main` but whose UI is not yet built. Submitted for Lab 3; see
[lab3/](../../../lab3/README.md).

The Lab 3 map is a submission snapshot. Its direct Groups-to-details creation
transition predates the two-step creation page. The current UC1-06 flow is
[Groups experience](./uc1-06-groups-experience.svg), with editable
[Graphviz source](./uc1-06-groups-experience.dot). It includes name validation,
queued invitations, partial success and archive tab recovery. Regenerate it with:

```bash
dot -Tsvg uc1-06-groups-experience.dot -o uc1-06-groups-experience.svg
```

| File | Contents |
| --- | --- |
| [dialog-map.pdf](./dialog-map.pdf), [dialog-map.png](./dialog-map.png), [dialog-map.svg](./dialog-map.svg) | Full map |
| [dialog-map-part1.png](./dialog-map-part1.png), [part2](./dialog-map-part2.png), [part3](./dialog-map-part3.png) | The same map split into report-sized parts |
| `*.drawio` | Editable sources (open in draw.io) |
| [build_dialog_map.py](./build_dialog_map.py) | Generates the `.drawio` sources |

To regenerate, from this folder:

```bash
python3 build_dialog_map.py
drawio -x -f png -s 2 -o dialog-map.png dialog-map.drawio
drawio -x -f svg -o dialog-map.svg dialog-map.drawio
drawio -x -f pdf --crop -o dialog-map.pdf dialog-map.drawio
for i in 1 2 3; do drawio -x -f png -s 3 -b 20 -o dialog-map-part$i.png dialog-map-part$i.drawio; done
```
