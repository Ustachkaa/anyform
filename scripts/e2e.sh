#!/usr/bin/env bash
# End-to-end smoke test against a running stack (db + api + worker + web).
#
#   npm run dev:db & npm run dev:api & npm run dev:worker & npm run dev:web
#   bash scripts/e2e.sh                # uses http://localhost:3000/api
#   E2E_BASE=https://anyform.app/api bash scripts/e2e.sh
#
# Exercises: 10 free conversions across sharp / ffmpeg / pdf-lib, the paywall on
# the 11th, download headers, validation errors, a failed job not costing quota,
# signup with guest merge, duplicate email, logout/login, billing unavailable.
# Uses one fresh guest per run; the created account is e2e-<timestamp>@example.com.
set -u
BASE="${E2E_BASE:-http://localhost:3000/api}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
S="$ROOT/data/e2e"; F="$S/fixtures"; OUT="$S/outputs"
mkdir -p "$F" "$OUT"
JAR1="$S/guest1.jar"; JAR2="$S/guest2.jar"; rm -f "$JAR1" "$JAR2"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const p=process.argv[1].split(".");let v=j;for(const k of p){v=v?.[k]}console.log(v===undefined?"":(typeof v==="object"?JSON.stringify(v):v))}catch{console.log("")}})' "$1"; }

echo "== 0. Fixtures =="
if [ ! -f "$F/sample.png" ]; then
  (cd "$ROOT" && node -e '
const sharp=require("sharp");const out=process.argv[1];
sharp({create:{width:320,height:200,channels:4,background:{r:255,g:201,b:0,alpha:1}}})
 .composite([{input:Buffer.from("<svg width=\"320\" height=\"200\"><text x=\"20\" y=\"120\" font-size=\"64\" font-family=\"sans-serif\" fill=\"#14130F\">anyform</text></svg>"),top:0,left:0}])
 .png().toFile(out+"/sample.png").then(()=>console.log("  made sample.png"));' "$F")
  FF="$(cd "$ROOT" && node -e "console.log(require('ffmpeg-static'))")"
  "$FF" -v error -y -f lavfi -i "sine=frequency=440:duration=2" -ar 44100 "$F/tone.wav" && echo "  made tone.wav"
  "$FF" -v error -y -f lavfi -i "testsrc=size=160x120:rate=10:duration=2" -f lavfi -i "sine=frequency=440:duration=2" \
        -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$F/clip.mp4" && echo "  made clip.mp4"
fi
printf 'hello' > "$F/note.xyz"; printf 'not really a docx' > "$F/fake.docx"

# convert <jar> <file> <target> -> "status|engine|outputBytes|id|error"
convert() {
  local jar="$1" file="$2" target="$3"
  local resp; resp=$(curl -s -b "$jar" -c "$jar" -F "target=$target" -F "file=@$file" "$BASE/conversions")
  local code; code=$(echo "$resp" | json error.code)
  if [ -n "$code" ]; then echo "ERROR|$code|||$(echo "$resp" | json error.message)"; return; fi
  local id; id=$(echo "$resp" | json conversion.id)
  local st="queued" eng="" bytes="" err=""
  for i in $(seq 1 90); do
    local j; j=$(curl -s -b "$jar" "$BASE/conversions/$id")
    st=$(echo "$j" | json status); eng=$(echo "$j" | json engine); bytes=$(echo "$j" | json outputBytes); err=$(echo "$j" | json error)
    [ "$st" = "done" ] || [ "$st" = "failed" ] && break
    sleep 1
  done
  echo "$st|$eng|$bytes|$id|$err"
}

echo "== 1. Ten conversions as a guest (free quota = 10) =="
CASES=(
  "sample.png jpg sharp" "sample.png pdf pdf-lib" "tone.wav mp3 ffmpeg" "clip.mp4 gif ffmpeg" "clip.mp4 mp3 ffmpeg"
  "sample.png webp sharp" "sample.png tiff sharp" "tone.wav flac ffmpeg" "clip.mp4 mov ffmpeg" "tone.wav ogg ffmpeg"
)
LAST_ID=""
for c in "${CASES[@]}"; do
  set -- $c; file="$1"; target="$2"; want="$3"
  r=$(convert "$JAR1" "$F/$file" "$target"); IFS='|' read -r st eng bytes id err <<< "$r"
  if [ "$st" = "done" ] && [ "$eng" = "$want" ] && [ "${bytes:-0}" -gt 0 ]; then ok "$file -> $target  ($eng, $bytes bytes)"; LAST_ID="$id"; else bad "$file -> $target  status=$st engine=$eng err=$err"; fi
done

echo "== 2. Usage after ten =="
u=$(curl -s -b "$JAR1" "$BASE/usage"); used=$(echo "$u" | json used); ex=$(echo "$u" | json exhausted)
[ "$used" = "10" ] && [ "$ex" = "true" ] && ok "usage used=10 exhausted=true" || bad "usage: $u"

echo "== 3. Eleventh conversion is paywalled =="
r=$(curl -s -b "$JAR1" -c "$JAR1" -o "$S/r11.json" -w "%{http_code}" -F "target=jpg" -F "file=@$F/sample.png" "$BASE/conversions")
code=$(json error.code < "$S/r11.json"); rem=$(json error.details.remaining < "$S/r11.json")
[ "$r" = "402" ] && [ "$code" = "QUOTA_EXCEEDED" ] && [ "$rem" = "0" ] && ok "402 QUOTA_EXCEEDED with usage in details" || bad "11th: http=$r code=$code body=$(cat "$S/r11.json")"

echo "== 4. Download a finished output =="
hdr=$(curl -s -b "$JAR1" -D - -o "$OUT/last.bin" "$BASE/conversions/$LAST_ID/download")
cd_line=$(echo "$hdr" | grep -i '^content-disposition' | tr -d '\r')
size=$(stat -c %s "$OUT/last.bin" 2>/dev/null || stat -f %z "$OUT/last.bin")
echo "$hdr" | head -1 | grep -q " 200" && [ "$size" -gt 0 ] && ok "download 200, $size bytes, $cd_line" || bad "download: $(echo "$hdr" | head -1) size=$size"

echo "== 5. Unsupported pair and unknown format are rejected up front =="
r=$(curl -s -b "$JAR2" -c "$JAR2" -o "$S/r5.json" -w "%{http_code}" -F "target=mp3" -F "file=@$F/sample.png" "$BASE/conversions")
[ "$r" = "400" ] && [ "$(json error.code < "$S/r5.json")" = "UNSUPPORTED_CONVERSION" ] && ok "png -> mp3 => 400 UNSUPPORTED_CONVERSION" || bad "png->mp3: http=$r $(cat "$S/r5.json")"
r=$(curl -s -b "$JAR2" -c "$JAR2" -o "$S/r5b.json" -w "%{http_code}" -F "target=pdf" -F "file=@$F/note.xyz" "$BASE/conversions")
[ "$r" = "400" ] && ok "unknown .xyz => 400 $(json error.code < "$S/r5b.json")" || bad "xyz: http=$r $(cat "$S/r5b.json")"

echo "== 6. A failed job (fake docx) does not cost a conversion =="
r=$(convert "$JAR2" "$F/fake.docx" "pdf"); IFS='|' read -r st eng bytes id err <<< "$r"
u2=$(curl -s -b "$JAR2" "$BASE/usage" | json used)
[ "$st" = "failed" ] && [ "$u2" = "0" ] && ok "docx -> pdf failed: '$err'; guest2 used=0" || bad "docx: status=$st err=$err used=$u2"

echo "== 7. Sign up as guest 1: history merges, quota follows the account =="
EMAIL="e2e-$(date +%s)@example.com"
r=$(curl -s -b "$JAR1" -c "$JAR1" -o "$S/r7.json" -w "%{http_code}" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"correct-horse-battery\",\"name\":\"E2E\"}" "$BASE/auth/signup")
{ [ "$r" = "201" ] || [ "$r" = "200" ]; } && [ "$(json user.email < "$S/r7.json")" = "$EMAIL" ] && ok "signup $r as $EMAIL" || bad "signup: http=$r $(cat "$S/r7.json")"
n=$(curl -s -b "$JAR1" "$BASE/conversions" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).conversions.length)}catch{console.log("?")}})')
[ "$n" = "10" ] && ok "GET /conversions lists 10 merged jobs" || bad "history count=$n"
used=$(curl -s -b "$JAR1" "$BASE/usage" | json used)
[ "$used" = "10" ] && ok "account usage used=10 (guest count carried over)" || bad "account usage used=$used"
me=$(curl -s -b "$JAR1" "$BASE/auth/me" | json user.plan)
[ "$me" = "free" ] && ok "GET /auth/me plan=free" || bad "me: plan=$me"
r=$(curl -s -b "$JAR1" -c "$JAR1" -o /dev/null -w "%{http_code}" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"another-valid-pass\"}" "$BASE/auth/signup")
[ "$r" = "409" ] && ok "duplicate signup => 409" || bad "duplicate signup http=$r"
curl -s -b "$JAR1" -c "$JAR1" -X POST "$BASE/auth/logout" -o /dev/null
r=$(curl -s -b "$JAR1" -o /dev/null -w "%{http_code}" "$BASE/auth/me")
[ "$r" = "401" ] && ok "after logout /auth/me => 401" || bad "after logout http=$r"
r=$(curl -s -b "$JAR1" -c "$JAR1" -o /dev/null -w "%{http_code}" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"correct-horse-battery\"}" "$BASE/auth/login")
[ "$r" = "200" ] && ok "login => 200" || bad "login http=$r"
r=$(curl -s -b "$JAR1" -o "$S/r7c.json" -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{"plan":"pro","interval":"month"}' "$BASE/billing/checkout")
{ [ "$r" = "503" ] || [ "$r" = "200" ]; } && ok "checkout => $r $(json error.code < "$S/r7c.json")" || bad "checkout http=$r $(cat "$S/r7c.json")"

echo; echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
