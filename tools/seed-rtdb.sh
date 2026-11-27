#!/usr/bin/env bash
# Firebase Realtime Database 시드 주입
# 사용법: bash tools/seed-rtdb.sh https://<프로젝트ID>-default-rtdb.firebaseio.com
#   (Realtime Database가 "테스트 모드"로 열려 있으면 인증 없이 쓰기가 됩니다)
set -euo pipefail
DB="${1:-}"
if [ -z "$DB" ]; then echo "사용법: bash tools/seed-rtdb.sh <RTDB_URL>"; exit 1; fi
DB="${DB%/}"

python3 - "$DB" <<'PY'
import json, sys, urllib.request

db = sys.argv[1]
seed = json.load(open('seed/rtdb-nogada01.json', encoding='utf-8'))

def put(path, payload):
    url = f"{db}{path}.json"
    req = urllib.request.Request(url, data=json.dumps(payload, ensure_ascii=False).encode(),
                                 headers={'Content-Type': 'application/json'}, method='PUT')
    with urllib.request.urlopen(req, timeout=20) as r:
        body = r.read().decode()
        print(f"  PUT {path}.json -> {r.status} {body[:60]}")

print("== agents ==")
for k, v in seed['rooms']['nogada01']['agents'].items():
    put(f"/rooms/nogada01/agents/{k}", v)
    v['updatedAt'] = 1764229000000  # fixed seed timestamp
print("== messages ==")
for k, v in seed['rooms']['nogada01']['messages'].items():
    put(f"/rooms/nogada01/messages/{k}", v)
print("== tasks ==")
for k, v in seed['rooms']['nogada01']['tasks'].items():
    put(f"/rooms/nogada01/tasks/{k}", v)

print("== verify (GET /rooms/nogada01.json) ==")
with urllib.request.urlopen(f"{db}/rooms/nogada01.json", timeout=20) as r:
    data = json.loads(r.read().decode())
print("agents  :", list((data.get('agents') or {}).keys()))
print("messages:", list((data.get('messages') or {}).keys()))
print("tasks   :", list((data.get('tasks') or {}).keys()))
print("OK")
PY
