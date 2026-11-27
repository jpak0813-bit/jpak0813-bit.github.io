#!/usr/bin/env bash
# 노가다 현장 합동 비서실 — GitHub Pages 배포 스크립트
# 사용법: bash deploy.sh
#   저장소가 이미 있고 쓰기 권한이 있으면 그대로 올리고 Pages를 켭니다.
set -uo pipefail
cd "$(dirname "$0")"

OWNER="jpak0813-bit"
REPO="jpak0813-bit.github.io"
URL="https://${OWNER}.github.io/"

echo "== 1) 저장소 확인 =="
if ! gh repo view "$OWNER/$REPO" --json name >/dev/null 2>&1; then
  echo "저장소가 없습니다. 생성 시도..."
  gh repo create "$OWNER/$REPO" --public --description "노가다 현장 합동 비서실" || {
    echo "!! 저장소 생성 권한이 없습니다. github.com/new 에서 직접 만들어 주세요."; exit 2; }
fi
gh repo view "$OWNER/$REPO" --json name,visibility,defaultBranchRef

echo "== 2) 커밋 =="
git init -q 2>/dev/null
git config user.name "박진규"
git config user.email "${OWNER}@users.noreply.github.com"
git add -A
git commit -q -m "노가다 현장 합동 비서실: 현장맵·무전기·작업일지·인력현황 4탭 웹앱" || echo "(변경 없음)"
git branch -M main
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/${OWNER}/${REPO}.git"

echo "== 3) 푸시 =="
if ! git push -u origin main 2>&1 | tee /tmp/push.log; then
  if grep -q "403\|denied" /tmp/push.log; then
    echo "!! 푸시 거부(403): Pickle의 GitHub 연결에서 '코드(Code) 쓰기' 권한이 꺼져 있거나"
    echo "   이 저장소가 앱 접근 범위에 없습니다. 권한을 켠 뒤 다시 실행하세요."
  fi
  exit 3
fi

echo "== 4) GitHub Pages 활성화 =="
gh api -X POST "repos/${OWNER}/${REPO}/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || gh api -X PUT "repos/${OWNER}/${REPO}/pages" \
       -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "(Pages가 이미 켜져 있거나 API 권한이 없습니다 — Settings → Pages에서 확인)"
gh api "repos/${OWNER}/${REPO}/pages" 2>/dev/null | head -20

echo "== 5) 라이브 확인 =="
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${URL}")
  echo "  [$i] ${URL} -> HTTP ${code}"
  [ "$code" = "200" ] && break
  sleep 10
done
echo "== 완료: ${URL} =="
