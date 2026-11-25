#!/usr/bin/env bash
# Attack tests of rate limiting and the sign-in mail (SCRUM-294, S5-X1). Only ever runs against the throwaway stack
# in loadtest/ (its own backend, PostgreSQL and mail stand-in): never the live school, never wassel-postgres on 5432.
#
#   cd loadtest && docker compose up -d --build postgres mail-stub backend      # start the stack (see loadtest/README.md)
#   docker compose exec postgres psql -U loadtest -d wassel -v ON_ERROR_STOP=1 -f /seed/seed.sql   # seed it, once
#   cd .. && scripts/attack-test.sh [flood|hammer|oversized|all]                   # default: all
#   cd loadtest && docker compose down -v                                           # throw it away afterwards
#
# For each run it counts users, password tokens, login codes, locked accounts and emails the mail stand-in received,
# before and after; times GET /actuator/health every HEALTH_INTERVAL seconds (default 0.25) while the attack runs; and
# runs scripts/attack-test.k6.js in the stack's k6 container. Then it prints PASS/FAIL per expectation:
#
#   flood      every forgot-password answer is 204 and every login 401; no row and no email added
#   hammer     one account, then many accounts, from one address: a 429 appears (expect_429); no row or email added
#   oversized  every oversized field answers 400 and no row or email is added
#   every run  no 5xx answer; health is UP and answers in under HEALTH_MAX_S (default 1) every time
#
# Knobs (environment): ITERATIONS (10000), VUS (20), HAMMER_ONE (200), HAMMER_MANY (500), BIG_BYTES (1048576),
# HEALTH_INTERVAL, HEALTH_MAX_S, WINDOW_WAIT (seconds to wait between the two hammer runs and before the next run, so
# a per-minute limit starts empty; default 65). Results are written to OUT (default: a fresh folder in /tmp).
# Exit code 0 only when every expectation passed.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/loadtest/docker-compose.yml")
HEALTH_URL="http://127.0.0.1:18080/actuator/health"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-0.25}"
HEALTH_MAX_S="${HEALTH_MAX_S:-1}"
WINDOW_WAIT="${WINDOW_WAIT:-65}"
OUT="${OUT:-$(mktemp -d -t wassel-attack-XXXX)}"
WHICH="${1:-all}"
FAILED=0
mkdir -p "$OUT"

die() { echo "attack-test: $*" >&2; exit 2; }
result() { # result PASS|FAIL "what"
  printf '  %-4s %s\n' "$1" "$2" | tee -a "$OUT/verdicts.txt"
  [ "$1" = PASS ] || FAILED=1
}

# Safety: the stack must be the load-test project, and its backend must answer on the loopback-only port.
"${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx backend || die "the loadtest stack is not running (see the header)"
curl -fs --max-time 5 "$HEALTH_URL" | grep -q UP || die "the loadtest backend at $HEALTH_URL is not UP"

psql_q() { "${COMPOSE[@]}" exec -T postgres psql -U loadtest -d wassel -tAc "$1"; }
[ "$(psql_q "select count(*) from users where email = 'parent1@load.test'")" = 1 ] \
  || die "the stack is not seeded (run loadtest/seed.sql, see the header)"

snapshot() { # one line: users tokens codes locked failed_sign_ins mail_sent
  local rows mail
  rows="$(psql_q "select (select count(*) from users), (select count(*) from password_tokens), (select count(*) from login_codes),
                         (select count(*) from users where locked_until > now()), (select coalesce(sum(failed_sign_ins),0) from users)" | tr '|' ' ')"
  mail="$("${COMPOSE[@]}" exec -T mail-stub wget -qO- http://127.0.0.1:9000/stats | sed -E 's/.*"sent":([0-9]+).*/\1/')"
  echo "$rows $mail"
}

start_health_probe() { # writes "<http code> <seconds> <UP|DOWN>" lines to $1
  (
    while :; do
      body="$(curl -s --max-time 10 -w ' %{http_code} %{time_total}' "$HEALTH_URL")"
      read -r json code secs <<<"$body"
      case "$json" in *UP*) state=UP ;; *) state=DOWN ;; esac
      echo "${code:-000} ${secs:-10} $state" >>"$1"
      sleep "$HEALTH_INTERVAL"
    done
  ) &
  HEALTH_PID=$!
}

stop_health_probe() { kill "$HEALTH_PID" 2>/dev/null; wait "$HEALTH_PID" 2>/dev/null; }

health_report() { # prints "n= max= p95= notup=" for file $1
  sort -k2 -g "$1" | awk '{ t[NR]=$2; if ($1 != 200 || $3 != "UP") bad++ }
    END { p=int(NR*0.95); if (p<1) p=1; printf "n=%d max=%.3f p95=%.3f notup=%d\n", NR, t[NR], t[p], bad+0 }'
}

run_k6() { # run_k6 <RUN> <label>: runs the k6 script, health probe alongside; leaves $OUT/<label>.* behind
  local run="$1" label="$2" before after
  before="$(snapshot)"
  : >"$OUT/$label.health"
  start_health_probe "$OUT/$label.health"
  local since; since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "${COMPOSE[@]}" run --rm --no-deps -T \
    -v "$ROOT/scripts:/scripts:ro" \
    -e RUN="$run" -e VUS="${VUS:-20}" -e ITERATIONS="${ITERATIONS:-10000}" -e HAMMER_ONE="${HAMMER_ONE:-200}" \
    -e HAMMER_MANY="${HAMMER_MANY:-500}" -e BIG_BYTES="${BIG_BYTES:-1048576}" -e RUN_ID="$(date +%s)" \
    k6 run --quiet /scripts/attack-test.k6.js >"$OUT/$label.k6.log" 2>&1
  stop_health_probe
  after="$(snapshot)"
  "${COMPOSE[@]}" logs --since "$since" backend 2>/dev/null | grep -c ' ERROR ' >"$OUT/$label.errors" || true
  echo "$before" >"$OUT/$label.before"; echo "$after" >"$OUT/$label.after"
  SUMMARY="$(grep -o 'ATTACK_SUMMARY .*' "$OUT/$label.k6.log" | sed 's/^ATTACK_SUMMARY //; s/\\"/"/g; s/"$//')"
  echo "$SUMMARY" >"$OUT/$label.summary.json"
  HEALTH="$(health_report "$OUT/$label.health")"
  echo "== $label"
  echo "  summary: $SUMMARY"
  echo "  rows before (users tokens codes locked failed_sign_ins mail): $before"
  echo "  rows after  (users tokens codes locked failed_sign_ins mail): $after"
  echo "  health during the attack: $HEALTH; backend ERROR lines: $(cat "$OUT/$label.errors")"
  check_common "$label" "$before" "$after"
}

count() { echo "$SUMMARY" | grep -o "\"$1\":[0-9]*" | awk -F: '{ n += $2 } END { print n + 0 }'; }

check_common() { # rows and mail unchanged (except lockout columns), no 5xx, health fine
  local label="$1" b a; read -ra b <<<"$2"; read -ra a <<<"$3"
  [ "${a[0]}" = "${b[0]}" ] && [ "${a[1]}" = "${b[1]}" ] && [ "${a[2]}" = "${b[2]}" ] \
    && result PASS "$label: users, password tokens, login codes unchanged (${b[0]}/${b[1]}/${b[2]})" \
    || result FAIL "$label: rows changed: users ${b[0]}->${a[0]}, tokens ${b[1]}->${a[1]}, codes ${b[2]}->${a[2]}"
  [ "${a[5]}" = "${b[5]}" ] && result PASS "$label: no email sent (stand-in count ${b[5]})" \
    || result FAIL "$label: emails sent: stand-in count ${b[5]}->${a[5]}"
  local fives; fives="$(echo "$SUMMARY" | grep -o '"[a-z]*_500":[0-9]*' | awk -F: '{ n += $2 } END { print n + 0 }')"
  [ "$fives" = 0 ] && result PASS "$label: no 5xx answers" || result FAIL "$label: $fives answers were 500"
  local max notup; max="$(echo "$HEALTH" | sed -E 's/.*max=([0-9.]+).*/\1/')"; notup="$(echo "$HEALTH" | sed -E 's/.*notup=([0-9]+).*/\1/')"
  if [ "$notup" = 0 ] && awk -v m="$max" -v l="$HEALTH_MAX_S" 'BEGIN { exit !(m < l) }'; then
    result PASS "$label: health UP every time, slowest ${max}s (< ${HEALTH_MAX_S}s)"
  else
    result FAIL "$label: health slowest ${max}s, $notup answers not 200/UP"
  fi
}

do_flood() {
  run_k6 flood run1-flood
  local n="${ITERATIONS:-10000}"
  [ "$(count forgot_204)" = "$n" ] && result PASS "run1-flood: all $n forgot-password answers 204" \
    || result FAIL "run1-flood: forgot-password 204 for $(count forgot_204) of $n"
  [ "$(count login_401)" = "$n" ] && result PASS "run1-flood: all $n logins answer 401" \
    || result FAIL "run1-flood: login 401 for $(count login_401) of $n"
}

do_hammer() {
  run_k6 hammer-one run2-hammer-one-account
  [ "$(count login_429)" -gt 0 ] && result PASS "run2-hammer-one-account: 429 after $(echo "$SUMMARY" | sed -E 's/.*"first429At":([0-9]+).*/\1/') requests" \
    || result FAIL "run2-hammer-one-account: no 429 in ${HAMMER_ONE:-200} wrong passwords"
  echo "  (waiting ${WINDOW_WAIT}s so a per-minute limit starts empty)"; sleep "$WINDOW_WAIT"
  run_k6 hammer-many run2-hammer-many-accounts
  [ "$(count login_429)" -gt 0 ] && result PASS "run2-hammer-many-accounts: 429 after $(echo "$SUMMARY" | sed -E 's/.*"first429At":([0-9]+).*/\1/') requests" \
    || result FAIL "run2-hammer-many-accounts: no 429 in ${HAMMER_MANY:-500} wrong passwords on different accounts"
}

do_oversized() {
  run_k6 oversized run3-oversized
  grep -o 'OVERSIZED [0-9]* [^"]*' "$OUT/run3-oversized.k6.log" | sed 's/^OVERSIZED //' >"$OUT/run3-oversized.cases"
  while read -r status name; do
    [ "$status" = 400 ] && result PASS "run3-oversized: $name -> 400" || result FAIL "run3-oversized: $name -> $status (want 400)"
  done <"$OUT/run3-oversized.cases"
}

echo "attack-test: results in $OUT"
case "$WHICH" in
  flood) do_flood ;;
  hammer) do_hammer ;;
  oversized) do_oversized ;;
  all) do_flood; sleep "$WINDOW_WAIT"; do_hammer; sleep "$WINDOW_WAIT"; do_oversized ;;
  *) die "unknown run '$WHICH' (flood, hammer, oversized or all)" ;;
esac
echo; echo "Verdicts:"; cat "$OUT/verdicts.txt"
exit "$FAILED"
