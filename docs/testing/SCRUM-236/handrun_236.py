"""SCRUM-236 hand run: wrong roles on the parent endpoints, then the concurrency checks of SCRUM-236-bugs.md.

Needs: a throwaway PostgreSQL 16 container named wassel-236-pg (user/password wassel, database wassel_app, port 5441)
and the packaged backend jar of develop + PR #107 running against it on port 8090 with JWT_SECRET set to the SECRET
below (profile local, ORS_API_KEY empty). Sessions are minted JWT cookies (HS256, sub = user id) and rows are seeded
by SQL through "docker exec", so no login is needed. Each run seeds a fresh school and prints a JSON summary.
Run: python3 -I handrun_236.py
"""
import base64, datetime, hashlib, hmac, json, subprocess, threading, time, urllib.error, urllib.request, uuid
from collections import Counter

BASE = "http://localhost:8090"
SECRET = b"review-236-secret-review-236-secret-xx"
ROUNDS = 25


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token(uid):
    now = int(time.time())
    head = b64(b'{"alg":"HS256"}')
    body = b64(json.dumps({"sub": uid, "iat": now, "exp": now + 3600}).encode())
    sig = b64(hmac.new(SECRET, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


def sql(q):
    return subprocess.run(["docker", "exec", "wassel-236-pg", "psql", "-U", "wassel", "-d", "wassel_app", "-tAc", q],
                          capture_output=True, text=True, check=True).stdout.strip()


def call(method, path, uid=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    if uid:
        r.add_header("Cookie", "wassel_token=" + token(uid))
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def together(*calls):
    """Run the calls at the same instant (a barrier), return their (status, body) in order."""
    out = [None] * len(calls)
    gate = threading.Barrier(len(calls))

    def run(i, c):
        gate.wait()
        out[i] = call(*c)

    threads = [threading.Thread(target=run, args=(i, c)) for i, c in enumerate(calls)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    return out


school = str(uuid.uuid4())


def user(role):
    uid = str(uuid.uuid4())
    sql(f"insert into users(id,created_at,email,enabled,password_hash,role,school_id) values "
        f"('{uid}',now(),'{uid}@review.test',true,'x','{role}','{school}')")
    return uid


def student(first, parent=None, route=None, pos=None):
    sid = str(uuid.uuid4())
    p = f"'{parent}'" if parent else "null"
    r = f"'{route}'" if route else "null"
    pp = str(pos) if pos else "null"
    sql(f"insert into students(id,created_at,first_name,last_name,grade,guardian_name,guardian_phone,school_id,status,"
        f"parent_user_id,route_id,stop_position,latitude,longitude,manual_pin) values ('{sid}',now(),'{first}','Review','3','G',"
        f"'+961 3 000000','{school}','ACTIVE',{p},{r},{pp},33.90{pos or 0},35.49{pos or 0},false)")
    return sid


def vehicle(cap):
    vid = str(uuid.uuid4())
    sql(f"insert into vehicles(id,is_active,capacity,created_at,plate_number,school_id) values "
        f"('{vid}',true,{cap},now(),'R {vid[:8]}','{school}')")
    return vid


def route_with(cap, n):
    vid = vehicle(cap)
    did, rid = str(uuid.uuid4()), str(uuid.uuid4())
    sql(f"insert into drivers(id,email,first_name,last_name,invited_at,phone,school_id,status) values "
        f"('{did}','{did}@review.test','Karim','Haddad',now(),'+961 {did[:8]}','{school}','ACTIVE')")
    sql(f"insert into routes(id,created_at,driver_id,name,school_id,vehicle_id) values "
        f"('{rid}',now(),'{did}','Route {rid[:6]}','{school}','{vid}')")
    for p in range(1, n + 1):
        student(f"S{p}", route=rid, pos=p)
    return vid, did, rid


def occupancy(rid, vid):
    count = int(sql(f"select count(*) from students where route_id='{rid}'"))
    cap = int(sql(f"select capacity from vehicles v join routes r on r.vehicle_id=v.id where r.id='{rid}'"))
    return count, cap


parent, other_parent = user("PARENT"), user("PARENT")
driver_user, head, admin = user("DRIVER"), user("HEAD_OF_TRANSPORT"), user("ADMIN")
layla = student("Layla", parent=parent)
omar = student("Omar", parent=other_parent)
results = {}

# ---- wrong roles on the parent endpoints ----
st, body = call("POST", f"/api/parent/children/{layla}/absences", parent, {"fromDate": "2027-06-01"})
absence = json.loads(body)["id"]
rows_before = sql(f"select count(*) from absences where student_id='{layla}'")
role_rows = []
for name, uid in [("DRIVER", driver_user), ("HEAD_OF_TRANSPORT", head), ("ADMIN", admin), ("signed out", None)]:
    for method, path, b in [("GET", "/api/parent/children", None),
                            ("GET", f"/api/parent/children/{layla}/absences", None),
                            ("POST", f"/api/parent/children/{layla}/absences", {"fromDate": "2027-07-01"}),
                            ("DELETE", f"/api/parent/children/{layla}/absences/{absence}", None)]:
        role_rows.append((name, method, path.replace(layla, "{child}").replace(absence, "{absence}"), call(method, path, uid, b)[0]))
# a parent on the head's endpoints, and another family's parent on this child
for method, path in [("GET", "/api/head-of-transport/absences"), ("GET", "/api/head-of-transport/routes")]:
    role_rows.append(("PARENT", method, path, call(method, path, parent)[0]))
for method, path, b in [("GET", f"/api/parent/children/{layla}/absences", None),
                        ("POST", f"/api/parent/children/{layla}/absences", {"fromDate": "2027-07-02"}),
                        ("DELETE", f"/api/parent/children/{layla}/absences/{absence}", None)]:
    role_rows.append(("PARENT of another family", method, path.replace(layla, "{child}").replace(absence, "{absence}"),
                      call(method, path, other_parent, b)[0]))
rows_after = sql(f"select count(*) from absences where student_id='{layla}' and not cancelled")
results["roles"] = {"rows": role_rows, "absences before": rows_before, "after (not cancelled)": rows_after}

# ---- two identical absence reports at once ----
base = datetime.date(2027, 1, 4)
identical, overlap = Counter(), Counter()
bad_identical, bad_overlap = [], []
for i in range(ROUNDS):
    d = (base + datetime.timedelta(days=7 * i)).isoformat()
    a, b = together(("POST", f"/api/parent/children/{layla}/absences", parent, {"fromDate": d}),
                    ("POST", f"/api/parent/children/{layla}/absences", parent, {"fromDate": d}))
    identical[tuple(sorted((a[0], b[0])))] += 1
    n = int(sql(f"select count(*) from absences where student_id='{layla}' and from_date='{d}' and not cancelled"))
    if n != 1:
        bad_identical.append((d, n))
    if a[0] == 409 or b[0] == 409:
        results.setdefault("identical 409 body", (a if a[0] == 409 else b)[1][:300])
# two different but overlapping reports at once
for i in range(ROUNDS):
    d1 = base + datetime.timedelta(days=7 * i + 2)
    x = {"fromDate": d1.isoformat(), "toDate": (d1 + datetime.timedelta(days=1)).isoformat()}
    y = {"fromDate": (d1 + datetime.timedelta(days=1)).isoformat(), "toDate": (d1 + datetime.timedelta(days=2)).isoformat()}
    a, b = together(("POST", f"/api/parent/children/{layla}/absences", parent, x),
                    ("POST", f"/api/parent/children/{layla}/absences", parent, y))
    overlap[tuple(sorted((a[0], b[0])))] += 1
    n = int(sql(f"select count(*) from absences where student_id='{layla}' and not cancelled "
                f"and daterange(from_date,to_date,'[]') && daterange('{x['fromDate']}','{y['toDate']}','[]')"))
    if n != 1:
        bad_overlap.append((x, y, n))
results["identical reports"] = {"status pairs": dict(identical), "rounds with != 1 row": bad_identical}
results["overlapping reports"] = {"status pairs": dict(overlap), "rounds with != 1 row": bad_overlap}

# ---- two seat reductions at once (4 students on 6 seats: 5 is allowed, 3 is not) ----
red, red_bad = Counter(), []
for i in range(ROUNDS):
    vid, did, rid = route_with(6, 4)
    a, b = together(("PATCH", f"/api/head-of-transport/vehicles/{vid}/capacity", head, {"capacity": 5}),
                    ("PATCH", f"/api/head-of-transport/vehicles/{vid}/capacity", head, {"capacity": 3}))
    red[(a[0], b[0])] += 1
    count, cap = occupancy(rid, vid)
    if count > cap or b[0] != 409:
        red_bad.append((a[0], b[0], count, cap))
results["two reductions (5 vs 3)"] = {"status pairs (to 5, to 3)": dict(red), "bad rounds": red_bad}

# two reductions to the exact count at once: both allowed
same = Counter()
for i in range(ROUNDS):
    vid, did, rid = route_with(6, 4)
    a, b = together(("PATCH", f"/api/head-of-transport/vehicles/{vid}/capacity", head, {"capacity": 4}),
                    ("PATCH", f"/api/head-of-transport/vehicles/{vid}/capacity", head, {"capacity": 4}))
    same[(a[0], b[0])] += 1
results["two reductions to the exact count (4 and 4)"] = {"status pairs": dict(same)}

# ---- a reduction racing an added student (the real check-then-act race) ----
race, overfull = Counter(), []
for i in range(ROUNDS):
    vid, did, rid = route_with(5, 4)
    extra = student("Extra")
    a, b = together(("PATCH", f"/api/head-of-transport/vehicles/{vid}/capacity", head, {"capacity": 4}),
                    ("POST", f"/api/head-of-transport/routes/{rid}/students", head, {"studentId": extra}))
    race[(a[0], b[0])] += 1
    count, cap = occupancy(rid, vid)
    if count > cap:
        seats = json.loads(call("GET", f"/api/head-of-transport/routes/{rid}", head)[1])["seatsLeft"]
        overfull.append({"patch": a[0], "add": b[0], "students": count, "capacity": cap, "seatsLeft": seats})
results["reduce to 4 vs add a 5th student"] = {"status pairs (patch, add)": dict(race), "overfull rounds": len(overfull),
                                               "example": overfull[:2]}

# a smaller vehicle put on the route racing an added student
race2, overfull2 = Counter(), []
for i in range(ROUNDS):
    vid, did, rid = route_with(5, 4)
    small = vehicle(4)
    extra = student("Extra")
    a, b = together(("PUT", f"/api/head-of-transport/routes/{rid}", head,
                     {"name": "Route", "vehicleId": small, "driverId": did}),
                    ("POST", f"/api/head-of-transport/routes/{rid}/students", head, {"studentId": extra}))
    race2[(a[0], b[0])] += 1
    count, cap = occupancy(rid, None)
    if count > cap:
        overfull2.append({"put": a[0], "add": b[0], "students": count, "capacity": cap})
results["smaller vehicle (4) vs add a 5th student"] = {"status pairs (put, add)": dict(race2),
                                                      "overfull rounds": len(overfull2), "example": overfull2[:2]}

def plain(o):
    if isinstance(o, dict):
        return {str(k): plain(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [plain(v) for v in o]
    return o


print(json.dumps(plain(results), indent=1, default=str))
