#!/bin/bash
# start.sh — 홍성훈 캠프 앱 실행 스크립트
# 사용법: bash start.sh [dev|build|admin]

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}"
echo "  ██╗  ██╗ ██████╗ ███╗   ██╗ ██████╗     ██████╗ █████╗ ███╗   ███╗██████╗"
echo "  ██║  ██║██╔═══██╗████╗  ██║██╔════╝    ██╔════╝██╔══██╗████╗ ████║██╔══██╗"
echo "  ███████║██║   ██║██╔██╗ ██║██║  ███╗   ██║     ███████║██╔████╔██║██████╔╝"
echo "  ██╔══██║██║   ██║██║╚██╗██║██║   ██║   ██║     ██╔══██║██║╚██╔╝██║██╔═══╝"
echo "  ██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝   ╚██████╗██║  ██║██║ ╚═╝ ██║██║"
echo "  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝     ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝"
echo -e "${NC}"
echo -e "${GREEN}  홍성훈 후보 선거캠프 보안 채팅 시스템${NC}"
echo -e "${YELLOW}  조국혁신당 · 신대지구 전라남도의원 선거${NC}"
echo ""

MODE=${1:-dev}

check_env() {
  if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}⚙️  backend/.env 파일이 없습니다. 생성합니다...${NC}"
    cp backend/.env.example backend/.env
    echo ""
    echo -e "${RED}🔑 backend/.env 파일을 열어 아래 항목을 설정하세요:${NC}"
    echo "   JWT_SECRET  — 32자 이상의 랜덤 문자열"
    echo "   INVITE_CODE — 캠프원 초대 코드"
    echo "   Firebase 관련 항목 (선택, 없으면 푸시 알림 비활성)"
    echo ""
    read -p "설정 후 Enter를 누르세요..."
  fi

  if [ ! -f "frontend/.env" ]; then
    echo -e "${YELLOW}⚙️  frontend/.env 파일이 없습니다. 생성합니다...${NC}"
    cp frontend/.env.example frontend/.env
  fi
}

install_deps() {
  echo -e "${BLUE}📦 의존성 확인 중...${NC}"
  if [ ! -d "backend/node_modules" ]; then
    echo "  backend npm install..."
    cd backend && npm install --silent && cd ..
  fi
  if [ ! -d "frontend/node_modules" ]; then
    echo "  frontend npm install..."
    cd frontend && npm install --silent && cd ..
  fi
  echo -e "${GREEN}✅ 의존성 준비 완료${NC}"
}

case $MODE in
  dev)
    check_env
    install_deps
    echo ""
    echo -e "${GREEN}🚀 개발 서버 시작...${NC}"
    echo -e "   Backend:  ${BLUE}http://localhost:3001${NC}"
    echo -e "   Frontend: ${BLUE}http://localhost:5173${NC}"
    echo ""
    echo -e "${YELLOW}💡 iOS 홈화면 추가: Safari로 http://localhost:5173 접속 → 공유 → 홈 화면에 추가${NC}"
    echo -e "${YELLOW}💡 Android APK 빌드: bash build-apk.sh${NC}"
    echo ""
    # 백엔드 & 프론트엔드 병렬 실행
    trap 'kill $(jobs -p) 2>/dev/null' EXIT
    cd backend && node server.js &
    cd frontend && npx vite &
    wait
    ;;

  build)
    check_env
    install_deps
    echo -e "${BLUE}🔨 프로덕션 빌드...${NC}"
    cd frontend && npm run build
    echo -e "${GREEN}✅ 빌드 완료: frontend/dist/${NC}"
    echo ""
    echo -e "${YELLOW}배포 방법:${NC}"
    echo "  1. frontend/dist/ 를 정적 호스팅 (Vercel, Netlify)"
    echo "  2. backend/ 를 Node.js 서버에 배포 (Railway, Render)"
    echo "  3. HTTPS 설정 필수 (Web Push 동작 조건)"
    ;;

  admin)
    check_env
    echo -e "${BLUE}👤 관리자 계정 생성...${NC}"
    node scripts/create-admin.js
    ;;

  apk)
    echo -e "${BLUE}📱 Android APK 빌드 준비...${NC}"
    check_env
    install_deps
    cd frontend && npm run build && cd ..
    if ! command -v npx &> /dev/null; then
      echo -e "${RED}❌ Node.js가 필요합니다${NC}"; exit 1
    fi
    cd frontend
    npx cap sync android 2>/dev/null || (npx cap add android && npx cap sync android)
    echo ""
    echo -e "${GREEN}✅ Android 프로젝트 준비 완료${NC}"
    echo -e "${YELLOW}📱 APK 빌드 방법:${NC}"
    echo "   npx cap open android"
    echo "   → Android Studio: Build → Generate Signed Bundle / APK → APK → Release"
    ;;

  *)
    echo "사용법: bash start.sh [dev|build|admin|apk]"
    echo "  dev   — 개발 서버 실행 (기본값)"
    echo "  build — 프로덕션 빌드"
    echo "  admin — 관리자 계정 생성"
    echo "  apk   — Android APK 빌드 준비"
    ;;
esac
