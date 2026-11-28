#!/usr/bin/env bash
# Attack tests of rate limiting and the sign-in mail (SCRUM-294, S5-X1), against SCRUM-288 (per-address rate limit,
# PR #186) and SCRUM-289 (auth email after commit and its daily cap, PR #188), both merged into develop on 24 Nov 2026.
# Only ever runs against the throwaway stack in loadtest/ (its own backend, PostgreSQL and mail stand-in): never the
# live school, never wassel-postgres on 5432. Run it from this branch (it is not on develop), on a FRESH stack:
#
#   cd loadtest && docker compose down -v                                           # always start from nothing
#   RATE_LIMIT_ENABLED=true docker compose up -d --build postgres mail-stub backend # limit on (off by default)
#   docker compose exec -T postgres psql -U loadtest -d wassel -v ON_ERROR_STOP=1 -f /seed/seed.sql
#   cd .. && scripts/attack-test.sh [flood|hammer|oversized|mailcap|endpoints|xff|all]   # default: all
#   cd loadtest && docker compose down -v                                           # throw it away afterwards
#
# A second run on the same stack is refused (lockouts, failed sign-ins and the email cap's rows persist): start again
# with `docker compose down -v`. The script reads whether the limit is on, and its limits, off the backend container.
#
# For each run it counts users, password tokens, login codes, locked accounts, failed sign-ins, auth_emails rows (and
# today's reset links) and the mail stand-in's received count, before and after; times GET /actuator/health every
# HEALTH_INTERVAL seconds while the attack runs; and runs scripts/attack-test.k6.js in the stack's k6 container. Then
# it prints PASS/FAIL per expectation:
#
#   flood      limit off: every forgot-password answer is 204 and every login 401, no 429
#              limit on:  204 (forgot) or 401 (login) + 429 = every request, at most the limit per window passed,
#                         and every 429 carries Retry-After
#              both:      no row and no email added (unknown emails)
#   hammer     one account, then many accounts, from one address: exactly the login limit passes, the rest is 429
#              with Retry-After; no row or email added
#   oversized  every one of the 15 oversized fields answers 400 and no row or email is added
#   mailcap    one reset link and one sign-in code each move the mail count by exactly 1 (the control); the cooldowns
#              of forgot-password, login and resend send nothing; reset links for 40 accounts stop at the reset share
#              (AUTH_EMAIL_RESET_DAILY_CAP, default 30); every mail sent has its auth_emails row
#   endpoints  each of the six limited endpoints: the first <limit> requests pass, the next ones are 429 + Retry-After
#   xff        a different X-Forwarded-For / X-Real-IP / Forwarded on every login still hits the one address's limit
#   every run  no answer 5xx, none without an answer (status 0), none in an unexpected status; health UP every time
#              and its p95 under HEALTH_FACTOR x the idle p95 measured first (floor HEALTH_FLOOR_S); a run shorter
#              than HEALTH_MIN_PROBES probes gets no health verdict (too short to say anything)
#
# Knobs (environment): ITERATIONS (10000), VUS (20), HAMMER_ONE (200), HAMMER_MANY (500), BIG_BYTES (1048576),
# MAILCAP_ACCOUNTS (40), XFF_REQUESTS (60), HEALTH_INTERVAL (0.25), HEALTH_FACTOR (10), HEALTH_FLOOR_S (0.25),
# HEALTH_MIN_PROBES (40), WINDOW_WAIT (seconds between runs so per-minute limits start empty; default 65).
# Results are written to OUT (default: a fresh folder in /tmp): one summary line per run's health (the raw probes
# stay in a temporary folder), the k6 summaries and logs, and verdicts.txt.
# Exit code 0 only when every expectation passed; 2 when the stack or a measurement is not usable.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/loadtest/docker-compose.yml")
HEALTH_URL="http://127.0.0.1:18080/actuator/health"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-0.25}"
HEALTH_FACTOR="${HEALTH_FACTOR:-10}"
HEALTH_FLOOR_S="${HEALTH_FLOOR_S:-0.25}"
HEALTH_MIN_PROBES="${HEALTH_MIN_PROBES:-40}"
WINDOW_WAIT="${WINDOW_WAIT:-65}"
OUT="${OUT:-$(mktemp -d -t wassel-attack-XXXX)}"
WHICH="${1:-all}"
FAILED=0
PROBES="$(mktemp -d -t wassel-attack-probes-XXXX)" # raw health probes: not kept with the results
mkdir -p "$OUT"
: >"$OUT/verdicts.txt"
trap 'rm -rf "$PROBES"' EXIT

rel() { local p="${1#"$ROOT"/}"; echo "${p/#$HOME/~}"; } # paths printed without the local home folder
die() { echo "attack-test: $*" >&2; exit 2; }
result() { # result PASS|FAIL "what"
  printf '  %-4s %s\n' "$1" "$2" | tee -a "$OUT/verdicts.txt"
  [ "$1" = PASS ] || FAILED=1
}
info() { printf '  %-4s %s\n' INFO "$1" | tee -a "$OUT/verdicts.txt"; }
check() { # check "what" <test...>: PASS when the test command succeeds
  local what="$1"; shift
  if "$@"; then result PASS "$what"; else result FAIL "$what"; fi
}
is_num() { [[ "$1" =~ ^[0-9]+$ ]]; }
pairs_eq() { while [ $# -ge 2 ]; do [ "$1" = "$2" ] || return 1; shift 2; done; } # pairs_eq a1 b1 a2 b2 ...: all equal
between() { is_num "$1" && [ "$1" -ge "$2" ] && [ "$1" -le "$3" ]; }               # between v lo hi

# Safety: the stack must be the load-test project, and its backend must answer on the loopback-only port.
"${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx backend || die "the loadtest stack is not running (see the header)"
curl -fs --max-time 5 "$HEALTH_URL" | grep -q UP || die "the loadtest backend at $HEALTH_URL is not UP"

psql_q() { "${COMPOSE[@]}" exec -T postgres psql -U loadtest -d wassel -v ON_ERROR_STOP=1 -tAc "$1"; }
seeded="$(psql_q "select count(*) from users where email = 'parent1@load.test'")" || die "cannot query the stack's database"
[ "$seeded" = 1 ] || die "the stack is not seeded (run loadtest/seed.sql, see the header)"

backend_env() { "${COMPOSE[@]}" exec -T backend printenv "$1" 2>/dev/null || true; }
env_or() { local v; v="$(backend_env "$1")"; echo "${v:-$2}"; }
LIMITED="$(env_or RATE_LIMIT_ENABLED false)"
[ "$LIMITED" = true ] || [ "$LIMITED" = false ] || die "RATE_LIMIT_ENABLED on the backend is '$LIMITED'"
WINDOW_RAW="$(env_or RATE_LIMIT_WINDOW 1m)"
case "$WINDOW_RAW" in *m) WINDOW_S=$(( ${WINDOW_RAW%m} * 60 )) ;; *s) WINDOW_S=${WINDOW_RAW%s} ;; *) die "cannot read RATE_LIMIT_WINDOW '$WINDOW_RAW'" ;; esac
LIMIT_LOGIN="$(env_or RATE_LIMIT_LOGIN 30)"; LIMIT_VERIFY="$(env_or RATE_LIMIT_2FA_VERIFY 60)"
LIMIT_RESEND="$(env_or RATE_LIMIT_2FA_RESEND 20)"; LIMIT_LOGOUT="$(env_or RATE_LIMIT_LOGOUT 60)"
LIMIT_FORGOT="$(env_or RATE_LIMIT_FORGOT_PASSWORD 10)"; LIMIT_PASSWORD="$(env_or RATE_LIMIT_SET_PASSWORD 30)"
RESET_CAP="$(env_or AUTH_EMAIL_RESET_DAILY_CAP 30)"
for v in "$WINDOW_S" "$LIMIT_LOGIN" "$LIMIT_VERIFY" "$LIMIT_RESEND" "$LIMIT_LOGOUT" "$LIMIT_FORGOT" "$LIMIT_PASSWORD" "$RESET_CAP"; do
  is_num "$v" || die "a limit read off the backend is not a number: '$v'"
done

# users tokens codes locked failed_sign_ins auth_emails resets_today mail_sent: every field must be a number.
snapshot() {
  local rows mail line f
  rows="$(psql_q "select (select count(*) from users), (select count(*) from password_tokens), (select count(*) from login_codes),
                         (select count(*) from users where locked_until > now()), (select coalesce(sum(failed_sign_ins),0) from users),
                         (select count(*) from auth_emails),
                         (select count(*) from auth_emails where kind = 'RESET_LINK' and created_at >= date_trunc('day', now() at time zone 'Asia/Beirut') at time zone 'Asia/Beirut')" \
          | tr '|' ' ')" || die "the row count query failed"
  mail="$("${COMPOSE[@]}" exec -T mail-stub wget -qO- http://127.0.0.1:9000/stats | jq -er '.sent')" || die "the mail stand-in's /stats did not answer a count"
  line="$rows $mail"
  read -ra f <<<"$line"
  [ "${#f[@]}" = 8 ] || die "snapshot has ${#f[@]} fields, not 8: '$line'"
  for v in "${f[@]}"; do is_num "$v" || die "snapshot field '$v' is not a number: '$line'"; done
  echo "$line"
}

# A second run on a used stack measures the leftovers of the first: refuse it.
start="$(snapshot)"; read -ra s <<<"$start"
[ "${s[3]}" = 0 ] && [ "${s[4]}" = 0 ] && [ "${s[5]}" = 0 ] \
  || die "the stack is not fresh (locked ${s[3]}, failed sign-ins ${s[4]}, auth_emails ${s[5]}): docker compose down -v, up, seed"

probe_loop() { # writes "<http code> <seconds> <UP|DOWN>" lines to $1 until killed
  while :; do
    local body json code secs state
    body="$(curl -s --max-time 10 -w ' %{http_code} %{time_total}' "$HEALTH_URL" || true)"
    read -r json code secs <<<"$body" || true
    case "$json" in *UP*) state=UP ;; *) state=DOWN ;; esac
    echo "${code:-000} ${secs:-10} $state" >>"$1"
    sleep "$HEALTH_INTERVAL"
  done
}
start_health_probe() { probe_loop "$1" & HEALTH_PID=$!; }
stop_health_probe() { kill "$HEALTH_PID" 2>/dev/null || true; wait "$HEALTH_PID" 2>/dev/null || true; }

health_report() { # prints "n= max= p95= notup=" for file $1
  sort -k2 -g "$1" | awk '{ t[NR]=$2; if ($1 != 200 || $3 != "UP") bad++ }
    END { p=int(NR*0.95); if (p<1) p=1; printf "n=%d max=%.3f p95=%.3f notup=%d\n", NR, t[NR], t[p], bad+0 }'
}
field() { echo "$2" | sed -E "s/.*$1=([0-9.]+).*/\1/"; }

# The idle baseline the health gate is measured against: HEALTH_MIN_PROBES probes with nothing else running.
measure_idle() {
  local f="$PROBES/idle"; : >"$f"
  for _ in $(seq "$HEALTH_MIN_PROBES"); do
    curl -s -o /dev/null --max-time 10 -w '%{http_code} %{time_total} UP\n' "$HEALTH_URL" >>"$f" || echo "000 10 DOWN" >>"$f"
    sleep "$HEALTH_INTERVAL"
  done
  IDLE="$(health_report "$f")"
  IDLE_P95="$(field p95 "$IDLE")"
  HEALTH_GATE="$(awk -v p="$IDLE_P95" -v k="$HEALTH_FACTOR" -v f="$HEALTH_FLOOR_S" 'BEGIN { g = p * k; if (g < f) g = f; printf "%.3f", g }')"
  echo "$IDLE" >"$OUT/idle.health"
  info "health idle baseline: $IDLE; gate for each run: p95 under ${HEALTH_GATE}s (${HEALTH_FACTOR} x idle p95, floor ${HEALTH_FLOOR_S}s)"
}

run_k6() { # run_k6 <RUN> <label>: runs the k6 script, health probe alongside; leaves $OUT/<label>.* behind
  local run="$1" label="$2"
  BEFORE="$(snapshot)"
  local raw="$PROBES/$label"; : >"$raw"
  start_health_probe "$raw"
  local since; since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "${COMPOSE[@]}" run --rm --no-deps -T \
    -v "$ROOT/scripts:/scripts:ro" \
    -e RUN="$run" -e VUS="${VUS:-20}" -e ITERATIONS="${ITERATIONS:-10000}" -e HAMMER_ONE="${HAMMER_ONE:-200}" \
    -e HAMMER_MANY="${HAMMER_MANY:-500}" -e BIG_BYTES="${BIG_BYTES:-1048576}" -e RUN_ID="$(date +%s)" \
    -e MAILCAP_ACCOUNTS="${MAILCAP_ACCOUNTS:-40}" -e XFF_REQUESTS="${XFF_REQUESTS:-60}" \
    -e LIMITED="$LIMITED" -e WINDOW_S="$WINDOW_S" -e LIMIT_LOGIN="$LIMIT_LOGIN" -e LIMIT_VERIFY="$LIMIT_VERIFY" \
    -e LIMIT_RESEND="$LIMIT_RESEND" -e LIMIT_LOGOUT="$LIMIT_LOGOUT" -e LIMIT_FORGOT="$LIMIT_FORGOT" \
    -e LIMIT_PASSWORD="$LIMIT_PASSWORD" \
    k6 run --quiet /scripts/attack-test.k6.js >"$OUT/$label.k6.log" 2>&1 || true # k6's verdict is ours, below
  stop_health_probe
  AFTER="$(snapshot)"
  { "${COMPOSE[@]}" logs --since "$since" backend 2>/dev/null || true; } | grep -c ' ERROR ' >"$OUT/$label.errors" || true
  echo "$BEFORE" >"$OUT/$label.before"; echo "$AFTER" >"$OUT/$label.after"
  SUMMARY="$(grep -o 'ATTACK_SUMMARY .*' "$OUT/$label.k6.log" | sed 's/^ATTACK_SUMMARY //; s/\\"/"/g; s/"$//' || true)"
  # Nothing below means anything unless k6 really ran and sent requests.
  echo "$SUMMARY" | jq -e '.requests > 0' >/dev/null 2>&1 \
    || die "$label: k6 printed no usable summary (see $(rel "$OUT/$label.k6.log"))"
  echo "$SUMMARY" | jq -c . >"$OUT/$label.summary.json"
  HEALTH="$(health_report "$raw")"
  echo "$HEALTH" >"$OUT/$label.health"
  echo "== $label"
  echo "  summary: $SUMMARY"
  echo "  before (users tokens codes locked failed_sign_ins auth_emails resets_today mail): $BEFORE"
  echo "  after  (users tokens codes locked failed_sign_ins auth_emails resets_today mail): $AFTER"
  echo "  health during the attack: $HEALTH; backend ERROR lines: $(cat "$OUT/$label.errors")"
}

count() { # count <regex on the status key>: sum of matching status counts
  echo "$SUMMARY" | jq --arg re "$1" '[.statuses | to_entries[] | select(.key | test($re)) | .value] | add // 0'
}
secs() { echo "$SUMMARY" | jq '.seconds'; }
windows() { awk -v s="$(secs)" -v w="$WINDOW_S" 'BEGIN { print int(s / w) + 1 }'; } # windows the run touched

# check_common <label> <tokens added> <codes added> <mail added>: rows and mail as expected, no bad status, health.
check_common() {
  local label="$1" want_tokens="$2" want_codes="$3" want_mail="$4" b a
  read -ra b <<<"$BEFORE"; read -ra a <<<"$AFTER"
  check "$label: users unchanged (${b[0]} -> ${a[0]})" [ "${a[0]}" = "${b[0]}" ]
  check "$label: password tokens +$want_tokens (${b[1]} -> ${a[1]})" [ "$(( a[1] - b[1] ))" = "$want_tokens" ]
  check "$label: login codes +$want_codes (${b[2]} -> ${a[2]})" [ "$(( a[2] - b[2] ))" = "$want_codes" ]
  check "$label: emails sent +$want_mail (stand-in ${b[7]} -> ${a[7]})" [ "$(( a[7] - b[7] ))" = "$want_mail" ]
  check "$label: one auth_emails row per email sent (rows +$(( a[5] - b[5] )), mail +$(( a[7] - b[7] )))" \
    [ "$(( a[5] - b[5] ))" = "$(( a[7] - b[7] ))" ]
  local bad; bad="$(count '_(5xx|0|other)$')"
  check "$label: no 5xx, no unanswered (status 0), no unexpected status ($bad such answers of $(echo "$SUMMARY" | jq .requests))" \
    [ "$bad" = 0 ]
  local n p95 max notup; n="$(field n "$HEALTH")"; p95="$(field p95 "$HEALTH")"; max="$(field max "$HEALTH")"; notup="$(field notup "$HEALTH")"
  if [ "$n" -lt "$HEALTH_MIN_PROBES" ]; then
    info "$label: health not judged, only $n probes in a $(secs) s run (all UP: $([ "$notup" = 0 ] && echo yes || echo no), slowest ${max}s)"
  else
    check "$label: health UP on all $n probes, p95 ${p95}s under ${HEALTH_GATE}s (slowest ${max}s)" \
      awk -v p="$p95" -v g="$HEALTH_GATE" -v u="$notup" 'BEGIN { exit !(u == 0 && p < g) }'
  fi
}

do_flood() {
  run_k6 flood run1-flood
  check_common run1-flood 0 0 0
  local n="${ITERATIONS:-10000}" f204 f429 l401 l429 w
  f204="$(count '^forgot_204$')"; f429="$(count '^forgot_429$')"; l401="$(count '^login_401$')"; l429="$(count '^login_429$')"
  if [ "$LIMITED" = true ]; then
    w="$(windows)"
    check "run1-flood: forgot-password 204 ($f204) + 429 ($f429) = all $n" [ "$(( f204 + f429 ))" = "$n" ]
    check "run1-flood: login 401 ($l401) + 429 ($l429) = all $n" [ "$(( l401 + l429 ))" = "$n" ]
    check "run1-flood: forgot-password passed at most $LIMIT_FORGOT per window ($f204 in $w windows of ${WINDOW_S}s)" \
      between "$f204" 1 "$(( LIMIT_FORGOT * w ))"
    check "run1-flood: login passed at most $LIMIT_LOGIN per window ($l401 in $w windows of ${WINDOW_S}s)" \
      between "$l401" 1 "$(( LIMIT_LOGIN * w ))"
    check "run1-flood: every 429 has Retry-After ($(count '_429noretry$') without)" [ "$(count '_429noretry$')" = 0 ]
  else
    check "run1-flood: all $n forgot-password answers 204 ($f204)" [ "$f204" = "$n" ]
    check "run1-flood: all $n logins answer 401 ($l401)" [ "$l401" = "$n" ]
    check "run1-flood: no 429 with the limit off ($(( f429 + l429 )))" [ "$(( f429 + l429 ))" = 0 ]
  fi
}

check_hammer() { # check_hammer <label> <requests>
  local label="$1" n="$2" limited passed w
  limited="$(count '^login_429$')"; passed="$(( $(echo "$SUMMARY" | jq .requests) - limited ))"; w="$(windows)"
  check "$label: exactly the login limit passed: $passed of $n (limit $LIMIT_LOGIN, run $(secs) s, $w window(s))" \
    [ "$passed" = "$(( LIMIT_LOGIN * w < n ? LIMIT_LOGIN * w : n ))" ]
  check "$label: the rest answered 429 ($limited)" [ "$limited" = "$(( n - passed ))" ]
  check "$label: every 429 has Retry-After ($(count '_429noretry$') without)" [ "$(count '_429noretry$')" = 0 ]
  info "$label: first 429 at request $(echo "$SUMMARY" | jq '.first429At') (in k6's hand-out order; ${VUS:-20} at once)"
}

do_hammer() {
  run_k6 hammer-one run2-hammer-one-account
  check_common run2-hammer-one-account 0 0 0
  check_hammer run2-hammer-one-account "${HAMMER_ONE:-200}"
  echo "  (waiting ${WINDOW_WAIT}s so a per-minute limit starts empty)"; sleep "$WINDOW_WAIT"
  run_k6 hammer-many run2-hammer-many-accounts
  check_common run2-hammer-many-accounts 0 0 0
  check_hammer run2-hammer-many-accounts "${HAMMER_MANY:-500}"
}

do_oversized() {
  run_k6 oversized run3-oversized
  check_common run3-oversized 0 0 0
  grep -o 'OVERSIZED [0-9]* [^"]*' "$OUT/run3-oversized.k6.log" | sed 's/^OVERSIZED //' >"$OUT/run3-oversized.cases" || true
  local lines; lines="$(wc -l <"$OUT/run3-oversized.cases")"
  check "run3-oversized: all 15 cases answered ($lines)" [ "$lines" = 15 ]
  while read -r status name; do
    check "run3-oversized: $name -> $status (want 400)" [ "$status" = 400 ]
  done <"$OUT/run3-oversized.cases"
}

mailstep() { # mailstep <step> <key>: the value of key= on that step's MAILSTEP line, or "missing"
  local v; v="$(grep -o "MAILSTEP $1 [^\"]*" "$OUT/run4-mailcap.k6.log" | grep -o " $2=[0-9]*" | cut -d= -f2 || true)"
  echo "${v:-missing}"
}

do_mailcap() {
  run_k6 mailcap run4-mailcap
  grep -o 'MAILSTEP [^"]*' "$OUT/run4-mailcap.k6.log" | sed 's/^MAILSTEP //' >"$OUT/run4-mailcap.steps" || true
  check "run4-mailcap: all 6 steps ran ($(wc -l <"$OUT/run4-mailcap.steps"))" [ "$(wc -l <"$OUT/run4-mailcap.steps")" = 6 ]
  local n="${MAILCAP_ACCOUNTS:-40}" a resets share
  read -ra a <<<"$AFTER"; resets="${a[6]}"
  # One reset link went to the control account, so the share leaves RESET_CAP - 1 for the others (if any were sent
  # today before this run, the stack was not fresh and the script stopped at the start).
  share="$(( RESET_CAP - 1 < n ? RESET_CAP - 1 : n ))"
  check "run4-mailcap: control: one reset link moves the mail count by exactly 1 ($(mailstep control-reset mail), 204: $(mailstep control-reset 204))" \
    pairs_eq "$(mailstep control-reset mail)" 1 "$(mailstep control-reset 204)" 1
  check "run4-mailcap: control: one sign-in moves the mail count by exactly 1 ($(mailstep control-login mail), 204: $(mailstep control-login 204))" \
    pairs_eq "$(mailstep control-login mail)" 1 "$(mailstep control-login 204)" 1
  check "run4-mailcap: 9 more forgot-password on that account in its cooldown: 204, nothing sent ($(mailstep reset-cooldown mail) sent, 204: $(mailstep reset-cooldown 204))" \
    pairs_eq "$(mailstep reset-cooldown mail)" 0 "$(mailstep reset-cooldown 204)" 9
  check "run4-mailcap: 20 more right-password logins in the code's cooldown: 429, nothing sent ($(mailstep login-cooldown mail) sent, 429: $(mailstep login-cooldown 429))" \
    pairs_eq "$(mailstep login-cooldown mail)" 0 "$(mailstep login-cooldown 429)" 20
  check "run4-mailcap: 15 resends in the cooldown: 429, nothing sent ($(mailstep resend-cooldown mail) sent, 429: $(mailstep resend-cooldown 429))" \
    pairs_eq "$(mailstep resend-cooldown mail)" 0 "$(mailstep resend-cooldown 429)" 15
  check "run4-mailcap: reset links for $n accounts: all 204, $share sent, then the reset share stops them ($(mailstep reset-share mail) sent, 204: $(mailstep reset-share 204))" \
    pairs_eq "$(mailstep reset-share mail)" "$share" "$(mailstep reset-share 204)" "$n"
  check "run4-mailcap: today's reset links at most the reset share ($resets of $RESET_CAP)" [ "$resets" -le "$RESET_CAP" ]
  check_common run4-mailcap "$(( 1 + share ))" 1 "$(( 2 + share ))"
}

do_endpoints() {
  run_k6 endpoints run5-endpoints
  check_common run5-endpoints 0 0 0
  grep -o 'ENDPOINT [^"]*' "$OUT/run5-endpoints.k6.log" | sed 's/^ENDPOINT //' >"$OUT/run5-endpoints.cases" || true
  check "run5-endpoints: all 6 endpoints probed ($(wc -l <"$OUT/run5-endpoints.cases"))" [ "$(wc -l <"$OUT/run5-endpoints.cases")" = 6 ]
  local name rest limit pass limited first noretry
  while read -r name rest; do
    limit="$(field limit "$rest")"; pass="$(field pass "$rest")"; limited="$(field limited "$rest")"
    first="$(field first429 "$rest")"; noretry="$(field noretry "$rest")"
    if [ "$LIMITED" = true ]; then
      check "run5-endpoints: $name: first $limit pass, 429 from request $(( limit + 1 )) (pass $pass, first 429 at $first, 429 x $limited, $noretry without Retry-After)" \
        pairs_eq "$pass" "$limit" "$first" "$(( limit + 1 ))" "$noretry" 0
    else
      check "run5-endpoints: $name: no 429 with the limit off ($limited)" [ "$limited" = 0 ]
    fi
  done <"$OUT/run5-endpoints.cases"
}

do_xff() {
  run_k6 xff run6-xff
  check_common run6-xff 0 0 0
  local n="${XFF_REQUESTS:-60}" limited passed
  limited="$(count '^login_429$')"; passed="$(( $(echo "$SUMMARY" | jq .requests) - limited ))"
  if [ "$LIMITED" = true ]; then
    check "run6-xff: forged X-Forwarded-For ignored: $passed of $n passed (limit $LIMIT_LOGIN), first 429 at $(echo "$SUMMARY" | jq .first429At)" \
      pairs_eq "$passed" "$LIMIT_LOGIN" "$(echo "$SUMMARY" | jq .first429At)" "$(( LIMIT_LOGIN + 1 ))"
  else
    info "run6-xff: limit off, $limited x 429 (nothing to attack)"
  fi
}

pause() { echo "  (waiting ${WINDOW_WAIT}s so the per-minute limits start empty)"; sleep "$WINDOW_WAIT"; }

echo "attack-test: results in $(rel "$OUT"); rate limit on: $LIMITED (login $LIMIT_LOGIN, forgot-password $LIMIT_FORGOT, verify $LIMIT_VERIFY, resend $LIMIT_RESEND, logout $LIMIT_LOGOUT, set-password $LIMIT_PASSWORD per ${WINDOW_S}s); reset share $RESET_CAP a day"
measure_idle
case "$WHICH" in
  flood) do_flood ;;
  hammer) do_hammer ;;
  oversized) do_oversized ;;
  mailcap) do_mailcap ;;
  endpoints) do_endpoints ;;
  xff) do_xff ;;
  all) do_flood; pause; do_hammer; pause; do_oversized; pause; do_mailcap; pause; do_endpoints; pause; do_xff ;;
  *) die "unknown run '$WHICH' (flood, hammer, oversized, mailcap, endpoints, xff or all)" ;;
esac
echo; echo "Verdicts:"; cat "$OUT/verdicts.txt"
exit "$FAILED"
