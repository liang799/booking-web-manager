"""Builds the Lab 3 dialog map as an editable draw.io file.

Run: python3 build_dialog_map.py
  writes dialog-map.drawio (full map) and dialog-map-part{1,2,3}.drawio (report-sized parts)
Export: drawio -x -f png -s 2 -o dialog-map.png dialog-map.drawio
        for i in 1 2 3; do drawio -x -f png -s 3 -b 20 -o dialog-map-part$i.png dialog-map-part$i.drawio; done
"""
from html import escape
from xml.sax.saxutils import quoteattr

W, H = 190, 64  # default state size

# id: (x, y, name, url-or-note, actions, planned, height)
states = {}
def state(key, x, y, name, sub="", actions=(), planned=False, h=None, w=W):
    states[key] = dict(x=x, y=y, name=name, sub=sub, actions=actions, planned=planned, w=w,
                       h=h or (H if not actions else 64 + 15 * len(actions)))

# ---- signed out ----
state("Landing", 140, 110, "Landing", "/")
state("Register", 40, 250, "Register", "/register",
      ["submit()[invalid | dup. email] / showError"])
state("Login", 270, 250, "Login", "/login?next=…",
      ["submit()[invalid] / showError"])

# ---- signed in: top ----
state("Home", 820, 110, "Home", "/",
      ["entry / load upcoming bookings,", "wallet summary & weather"])

# column: discover & commitment (UC2-01, UC2-04, UC2-05)
state("Discover", 640, 330, "Discover", "/discover",
      ["do / poll live slots (≤3s)", "search(query, filters) / refresh"])
state("Details", 640, 540, "Session Details", "planned",
      ["do / display live slots, participants,", "booking share & my status",
       "leaveWaitlist()[waitlisted]",
       "acceptInvitation()[invited]", "    / lockShare + refundWithdrawer"], planned=True)
state("JoinConfirm", 520, 860, "Join Confirmation", "planned · POST /api/sessions/commit",
      ["entry / display share to lock", "or waitlist position"], planned=True)
state("WithdrawConfirm", 780, 860, "Withdraw Confirmation", "planned · POST /api/sessions/withdraw",
      ["entry / GET withdrawal-preview:", "display refund or held amount (30h rule)",
       "choose(openSlot | inviteeId)"], planned=True)
state("PlayerProfile", 880, 560, "Player Profile", "planned",
      ["do / display reliability score", "(read-only)"], planned=True)

# column: hosting (UC2-03, UC2-06)
state("MySessions", 1100, 330, "My Sessions", "/sessions",
      ["entry / list hosted sessions with server-selected actions",
       "toggleVisibility(Public | Private)[open, not full] / refresh"], w=610)
state("Participants", 1100, 620, "Manage Participants", "/sessions/{id}/participants",
      ["entry / list roster & waitlist", "verify(marks)[ended] / markAttendance"])
state("RemoveDialog", 1100, 830, "Remove Participant", "dialog",
      ["entry / GET removal-preview:", "display wallet refund"])
state("CancelDialog", 1310, 620, "Cancel Session", "dialog",
      ["entry / GET cancellation-preview:", "display total wallet refunds"])

# column: create wizard (UC2-02)
state("CreateVenue", 1860, 330, "Create Session: Venue Details", "/sessions/create · step 1",
      ["do / search venues (OneMap)"])
state("CreateSettings", 1860, 520, "Create Session: Settings", "step 2",
      ["schedule, slots, visibility,", "minimum reliability"])
state("CreateShare", 1860, 710, "Create Session: Booking Share", "step 3",
      ["entry / compute booking share", "server-side"])
state("Email", 1860, 900, "Email Address", "/profile/email",
      ["entry / show current address", "save(email)[valid] / updateEmail"])

# column: wallet
state("Wallet", 2110, 330, "Wallet", "/wallet",
      ["entry / query available balance,", "held funds & tx history",
       "topUp(amount)[valid] / PayNow;", "    webhook credits wallet"])

# column: groups (UC1-06)
state("Groups", 2350, 330, "Groups", "/groups",
      ["entry / list my groups"])
state("GroupDetails", 2350, 540, "Group Details", "/groups/{id}",
      ["entry / list members &", "invitation link"])
state("JoinGroup", 2350, 740, "Join Group", "/groups/join/{token}")

# column: settings (UC1-03, UC1-04)
state("Settings", 2600, 330, "Settings", "/profile",
      ["entry / load preferences &", "reliability score"])
state("EditProfile", 2600, 540, "Edit Profile", "/profile/edit")
state("DeleteAccount", 2600, 700, "Delete Account", "/profile/delete")

# pseudo states: (x, y, kind, label)
pseudo = {
    "start": (225, 50, "start", "start"),
    "push": (580, 470, "start", "Web Push notification"),
    "invite": (2436, 870, "start", "group invite link"),
    "deleted": (2685, 900, "end", "account deleted<br>/ redirect(/login?deleted=1)"),
}

# edges: (src, dst, label, planned, extra style, waypoints)
edges = []
def edge(s, d, label="", planned=False, style="", points=(), pos=0):
    edges.append((s, d, label, planned, style, points, pos))

P = lambda ex, ey, nx, ny: f"exitX={ex};exitY={ey};entryX={nx};entryY={ny};"
ORTHO = "edgeStyle=orthogonalEdgeStyle;"

# authentication (UC1-01, UC1-02)
edge("start", "Landing")
edge("Landing", "Register", "Sign up", style=P(0.25, 1, 0.5, 0))
edge("Landing", "Login", "Log in", style=P(0.75, 1, 0.5, 0))
edge("Register", "Home", "submit()[valid]\n/createAcct + initWallet + signIn",
     style=P(0.5, 1, 0, 0.75) + ORTHO, points=[(135, 395), (490, 395), (490, 168)], pos=-0.55)
edge("Login", "Home", "submit()[valid]\n/redirect(next)", style=P(1, 0.3, 0, 0.5))
edge("Settings", "Landing", "Logout() / clearSession", style=P(0.5, 0, 0.5, 0) + ORTHO)

# discovery and commitment
edge("Home", "Discover", "Find a session", style=P(0.15, 1, 0.5, 0))
edge("Home", "Details", "Upcoming booking", style=P(0.4, 1, 0.85, 0))
edge("Home", "CreateVenue", "Create a session", style=P(1, 0.5, 0.5, 0) + ORTHO)
edge("Discover", "Details", "Session card", style=P(0.3, 1, 0.3, 0), pos=-0.4)
edge("Details", "Discover", "Back", style=P(0.55, 0, 0.55, 1), pos=-0.4)
edge("push", "Details", "open(PROMOTED | INVITATION |\nFORFEITURE | REMINDER)", planned=True, style=P(0.5, 1, 0, 0.15) + ORTHO)
edge("Details", "PlayerProfile", "View participant", planned=True, style=P(1, 0.3, 0, 0.3))
edge("PlayerProfile", "Details", "Back", planned=True, style=P(0, 0.75, 1, 0.6))
edge("Details", "JoinConfirm", "Commit[not participating]", planned=True, style=P(0, 0.9, 0.2, 0) + ORTHO)
edge("JoinConfirm", "Details", "Confirm()[slot avail.] / lockShare\nConfirm()[full] / joinWaitlist\nCancel",
     planned=True, style=P(0.75, 0, 0.3, 1), pos=-0.5)
edge("Details", "WithdrawConfirm", "Withdraw[committed]", planned=True, style=P(1, 0.9, 0.85, 0) + ORTHO)
edge("WithdrawConfirm", "Details", "Confirm(choice)[≥30h] / refund\nConfirm(choice)[<30h] / awaitReplacement\nCancel",
     planned=True, style=P(0.25, 0, 0.75, 1), pos=0.5)
edge("JoinConfirm", "Wallet", "Confirm()[insufficient funds] / promptTopUp", planned=True,
     style=P(0.5, 1, 0, 0.5) + ORTHO, points=[(615, 1040), (2080, 1040), (2080, 370)])
edge("JoinConfirm", "Email", "Confirm()[no email]", planned=True,
     style=P(0.15, 1, 0, 0.5) + ORTHO, points=[(548, 1010), (1820, 1010), (1820, 935)])

# hosting
edge("MySessions", "CreateVenue", "Create a session", style=P(1, 0.3, 0, 0.5))
edge("CreateVenue", "CreateSettings", "Next()[valid]", style=P(0.4, 1, 0.4, 0), pos=-0.4)
edge("CreateSettings", "CreateVenue", "Back", style=P(0.6, 0, 0.6, 1), pos=-0.4)
edge("CreateSettings", "CreateShare", "Next()[valid]", style=P(0.4, 1, 0.4, 0), pos=-0.4)
edge("CreateShare", "CreateSettings", "Back", style=P(0.6, 0, 0.6, 1), pos=-0.4)
edge("CreateShare", "MySessions", "Confirm()[has email]\n/computeShare + genLink",
     style=P(0, 0.4, 1, 0.75) + ORTHO, points=[(1785, 755), (1785, 420)])
edge("CreateShare", "Email", "Confirm()[no email]", style=P(0.5, 1, 0.5, 0))
edge("MySessions", "Participants", "Manage participants", style=P(0.1, 1, 0.3, 0), pos=-0.45)
edge("Participants", "MySessions", "Back", style=P(0.7, 0, 0.22, 1), pos=-0.45)
edge("Participants", "RemoveDialog", "Remove(participant)", style=P(0.3, 1, 0.3, 0), pos=-0.45)
edge("RemoveDialog", "Participants", "Confirm() / refund + notify\nCancel", style=P(0.7, 0, 0.7, 1), pos=-0.4)
edge("MySessions", "CancelDialog", "Cancel session\n[before start]", style=P(0.44, 1, 0.3, 0), pos=-0.45)
edge("CancelDialog", "MySessions", "Confirm() / refundAll\nCancel", style=P(0.7, 0, 0.56, 1), pos=-0.45)

# wallet

# groups
edge("Groups", "GroupDetails", "Open group\ncreate(name)", style=P(0.3, 1, 0.3, 0), pos=-0.4)
edge("GroupDetails", "Groups", "Back | archive()", style=P(0.7, 0, 0.7, 1), pos=-0.4)
edge("invite", "JoinGroup", "", style=P(0.5, 0, 0.5, 1))
edge("JoinGroup", "GroupDetails", "join()[signed in]", style=P(0.5, 0, 0.5, 1))

# settings
edge("Settings", "EditProfile", "Edit profile", style=P(0.3, 1, 0.3, 0), pos=-0.4)
edge("EditProfile", "Settings", "save()[valid] | Back", style=P(0.7, 0, 0.7, 1), pos=-0.4)
edge("Settings", "DeleteAccount", "Delete my account", style=P(0, 0.75, 0, 0.5) + ORTHO, points=[(2570, 383), (2570, 732)])
edge("DeleteAccount", "Settings", "Back", style=P(1, 0.5, 1, 0.85) + ORTHO, points=[(2820, 732), (2820, 400)])
edge("Settings", "Email", "Email", style=P(1, 0.6, 1, 0.5) + ORTHO, points=[(2850, 390), (2850, 1070), (2090, 1070), (2090, 935)])
edge("DeleteAccount", "deleted", "Delete account()\n[balance = 0, no commitments]\n/anonymise", style=P(0.5, 1, 0.5, 0))


def state_label(s):
    parts = [f"<b>{escape(s['name'])}</b>"]
    if s["sub"]:
        parts.append(f"<font style='font-size:9px' color='#666666'>{escape(s['sub'])}</font>")
    html = "<br>".join(parts)
    if s["actions"]:
        acts = "<br>".join(escape(a).replace("    ", "&nbsp;&nbsp;&nbsp;&nbsp;") for a in s["actions"])
        html += ("<hr style='border:none;border-top:1px solid #000;margin:4px 0'>"
                 f"<div style='text-align:left;font-size:10px'>{acts}</div>")
    return html


def region_cell(cid, label, x, y, w, h, size=11, arc=1, wrap=""):
    return (f'<mxCell id="{cid}" value={quoteattr(label)} '
            f'style="rounded=1;arcSize={arc};dashed=1;fillColor=none;strokeColor=#888888;html=1;{wrap}'
            f'verticalAlign=bottom;align=left;spacingLeft=10;spacingBottom=6;fontSize={size};" vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')


SIGNED_OUT = "<b>Signed out</b>"
SIGNED_IN = ("<b>Signed in (app shell)</b><br>"
             "nav(Home | Discover | My sessions | Wallet | Groups | Settings) reaches each top-level screen "
             "from any state in this region<br>any protected screen [signed out] / redirect(/login?next=screen)<br>"
             "addEmail()[no email] / open Email Address (shell prompt; an address is required, confirming it is not)")
LEGEND = ("Format: event(arguments)[guard]/action  |  solid dot = start  |  bullseye = end  |  "
          "divider separates state name from entry/do actions and internal transitions  |  "
          "<b>dashed = planned screen</b> (API on main, UI not yet built)")


def edge_cell(s, d, label, planned, extra, points, pos, nid):
    style = ("html=1;rounded=1;endArrow=open;endSize=8;strokeColor=#333333;fontSize=9;"
             "labelBackgroundColor=#ffffff;edgeStyle=none;" if "edgeStyle=" not in extra else
             "html=1;rounded=1;endArrow=open;endSize=8;strokeColor=#333333;fontSize=9;labelBackgroundColor=#ffffff;")
    if planned:
        style += "dashed=1;dashPattern=6 4;"
    style += extra
    value = escape(label).replace("\n", "<br>")
    return (f'<mxCell id="e{nid}" value={quoteattr(value)} style="{style}" edge="1" parent="1" source="{s}" target="{d}">'
            f'<mxGeometry x="{pos}" relative="1" as="geometry">'
            + ("<Array as=\"points\">" + "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in points) + "</Array>" if points else "")
            + '</mxGeometry></mxCell>')


def state_cells(keys):
    out = []
    for key in keys:
        s = states[key]
        style = ("rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#000000;"
                 "fontSize=11;verticalAlign=top;spacingTop=4;")
        if s["planned"]:
            style += "dashed=1;dashPattern=6 4;"
        out.append(
            f'<mxCell id="{key}" value={quoteattr(state_label(s))} style="{style}" vertex="1" parent="1">'
            f'<mxGeometry x="{s["x"]}" y="{s["y"]}" width="{s["w"]}" height="{s["h"]}" as="geometry"/></mxCell>')
    return out


def pseudo_cells(keys):
    out = []
    for key in keys:
        x, y, kind, label = pseudo[key]
        if kind == "start":
            style = "ellipse;fillColor=#000000;strokeColor=#000000;html=1;"
            size = 18
        else:
            style = "ellipse;shape=doubleEllipse;fillColor=#000000;strokeColor=#000000;html=1;"
            size = 22
        out.append(f'<mxCell id="{key}" value="" style="{style}" vertex="1" parent="1">'
                   f'<mxGeometry x="{x}" y="{y}" width="{size}" height="{size}" as="geometry"/></mxCell>')
        out.append(f'<mxCell id="{key}-label" value={quoteattr(label)} style="text;html=1;fontSize=10;align=left;verticalAlign=middle;" vertex="1" parent="1">'
                   f'<mxGeometry x="{x + size + 4}" y="{y - 8}" width="170" height="36" as="geometry"/></mxCell>')
    return out


def write(path, cells):
    xml = ('<mxfile host="build_dialog_map.py"><diagram name="Dialog Map" id="lab3">'
           '<mxGraphModel dx="2560" dy="1200" grid="1" gridSize="10" guides="1" page="0">'
           '<root><mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(cells) +
           '</root></mxGraphModel></diagram></mxfile>')
    open(path, "w").write(xml)


# ---- full map ----
nid = iter(range(100, 10000))
cells = [region_cell("region-out", SIGNED_OUT, 20, 80, 460, 290, size=12, arc=3),
         region_cell("region-in", SIGNED_IN, 500, 80, 2380, 1100)]
cells += state_cells(states) + pseudo_cells(pseudo)
cells += [edge_cell(*e, next(nid)) for e in edges]
cells.append(f'<mxCell id="legend" value={quoteattr(LEGEND)} style="text;html=1;fontSize=11;align=left;" vertex="1" parent="1">'
             '<mxGeometry x="20" y="1195" width="1500" height="24" as="geometry"/></mxCell>')
cells.append('<mxCell id="title" value="&lt;b&gt;Dialog Map (Lab 3): user interface navigation&lt;/b&gt;" '
             'style="text;html=1;fontSize=16;align=left;" vertex="1" parent="1">'
             '<mxGeometry x="300" y="40" width="600" height="30" as="geometry"/></mxCell>')
write("dialog-map.drawio", cells)
print(f"{len(states)} states, {len(edges)} transitions")

# ---- report-sized parts ----
# A transition that crosses parts ends at a grey stub naming the screen and the part that holds it.
# parts: (title, state keys, pseudo keys, stubs {key: (x, y, w, screen, part)},
#         rerouted edges {(src, dst): (stub replaces src or dst, style, points, pos)}, signed-out region?)
SW, SH = 150, 44
parts = [
    ("Part 1: sign-in, discovery and joining a session",
     ["Landing", "Register", "Login", "Home", "Discover", "Details",
      "JoinConfirm", "WithdrawConfirm", "PlayerProfile"],
     ["start", "push"],
     {"toCreate": (1120, 135, SW, "Create Session: Venue Details", 2),
      "fromSettings": (540, 125, SW, "Settings", 3),
      "toEmail": (520, 1090, SW, "Email Address", 2),
      "toWallet": (720, 1090, SW, "Wallet", 3)},
     {("Home", "CreateVenue"): ("toCreate", P(1, 0.3, 0, 0.5), (), 0),
      ("Settings", "Landing"): ("fromSettings", P(0, 0.5, 1, 0.5), (), 0),
      ("JoinConfirm", "Email"): ("toEmail", P(0.2, 1, 0.5, 0) + ORTHO, (), -0.2),
      ("JoinConfirm", "Wallet"): ("toWallet", P(0.8, 1, 0.5, 0) + ORTHO, (), 0.35)},
     True),
    ("Part 2: hosting and creating a session",
     ["MySessions", "Participants", "RemoveDialog", "CancelDialog",
      "CreateVenue", "CreateSettings", "CreateShare", "Email"],
     [],
     {"fromHome": (1880, 180, SW, "Home", 1),
      "fromJoin": (1560, 1020, SW, "Join Confirmation", 1),
      "fromSettings2": (1880, 1060, SW, "Settings", 3)},
     {("Home", "CreateVenue"): ("fromHome", P(0.5, 1, 0.5, 0), (), 0),
      ("JoinConfirm", "Email"): ("fromJoin", P(1, 0.5, 0, 0.7) + ORTHO, (), 0.2),
      ("Settings", "Email"): ("fromSettings2", P(0.5, 0, 0.5, 1), (), 0)},
     False),
    ("Part 3: wallet, groups and settings",
     ["Wallet", "Groups", "GroupDetails", "JoinGroup", "Settings", "EditProfile", "DeleteAccount"],
     ["invite", "deleted"],
     {"fromJoin3": (2130, 180, SW, "Join Confirmation", 1),
      "toLanding": (2620, 180, SW, "Landing", 1),
      "toEmail3": (2900, 340, SW, "Email Address", 2)},
     {("JoinConfirm", "Wallet"): ("fromJoin3", P(0.5, 1, 0.5, 0), (), 0),
      ("Settings", "Landing"): ("toLanding", P(0.5, 0, 0.5, 1), (), 0),
      ("Settings", "Email"): ("toEmail3", P(1, 0.3, 0, 0.5), (), 0)},
     False),
]

for n, (title, keys, pkeys, stubs, reroute, signed_out) in enumerate(parts, 1):
    nid = iter(range(100, 10000))
    cells = []
    # bounding box of the signed-in content decides the region size
    boxes = [(states[k]["x"], states[k]["y"], states[k]["w"], states[k]["h"]) for k in keys
             if not (signed_out and states[k]["x"] < 500)]
    boxes += [(x, y, w, SH) for x, y, w, *_ in stubs.values() if not (signed_out and x < 500 and y < 80)]
    boxes += [(pseudo[k][0], pseudo[k][1], 190, 22) for k in pkeys if not (signed_out and pseudo[k][0] < 500)]
    x0 = min(b[0] for b in boxes) - 30
    y0 = min(b[1] for b in boxes) - 30
    x1 = max(b[0] + b[2] for b in boxes) + 30
    y1 = max(b[1] + b[3] for b in boxes) + 75
    if signed_out:
        cells.append(region_cell("region-out", SIGNED_OUT, 20, 80, 460, 290, size=12, arc=3))
        x0 = 500
    cells.append(region_cell("region-in", SIGNED_IN, x0, y0, x1 - x0, y1 - y0, wrap="whiteSpace=wrap;"))
    cells += state_cells(keys) + pseudo_cells(pkeys)
    for key, (x, y, w, screen, part) in stubs.items():
        label = f"<i>{escape(screen)}</i><br><font style='font-size:9px' color='#555555'>see Part {part}</font>"
        cells.append(f'<mxCell id="{key}" value={quoteattr(label)} '
                     'style="rounded=1;arcSize=20;whiteSpace=wrap;html=1;fillColor=#eeeeee;strokeColor=#888888;fontSize=10;" '
                     f'vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{SH}" as="geometry"/></mxCell>')
    inside = set(keys) | set(pkeys)
    for s, d, label, planned, extra, points, pos in edges:
        if s in inside and d in inside:
            cells.append(edge_cell(s, d, label, planned, extra, points, pos, next(nid)))
        elif (s, d) in reroute:
            stub, style, pts, p = reroute[(s, d)]
            s2, d2 = (stub, d) if d in inside else (s, stub)
            cells.append(edge_cell(s2, d2, label, planned, style, pts, p, next(nid)))
    left = 20 if signed_out else x0
    legend = LEGEND + "  |  grey box = screen drawn in another part"
    cells.append(f'<mxCell id="legend" value={quoteattr(legend)} style="text;html=1;whiteSpace=wrap;fontSize=10;align=left;verticalAlign=top;" '
                 f'vertex="1" parent="1"><mxGeometry x="{left}" y="{y1 + 10}" width="{x1 - left}" height="36" as="geometry"/></mxCell>')
    top = (min(y0, 50) if signed_out else y0) - 50
    cells.append(f'<mxCell id="title" value={quoteattr(f"<b>Dialog Map (Lab 3) {title}</b>")} '
                 f'style="text;html=1;fontSize=15;align=left;" vertex="1" parent="1">'
                 f'<mxGeometry x="{left}" y="{top}" width="{x1 - left}" height="30" as="geometry"/></mxCell>')
    write(f"dialog-map-part{n}.drawio", cells)
    print(f"part {n}: {len(keys)} states")
