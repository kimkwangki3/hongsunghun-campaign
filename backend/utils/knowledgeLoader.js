// utils/knowledgeLoader.js — 지식베이스 로더
const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge');

// 모든 .md 파일을 읽어 시스템 프롬프트로 합침
function buildSystemPrompt() {
  const base = `당신은 2026년 6월 3일 제9회 전국동시지방선거 전라남도의회의원 순천시 제7선거구
홍성훈 후보 캠프 전용 선거법·정치자금 AI 어시스턴트입니다.

[답변 원칙]
- 아래 지식베이스 내용만 기준으로 답변하세요
- 결론 먼저, 법적 근거 명시, 위험 요소 경고
- 불확실하면 "관할 선관위 확인 필요" 표시
- 예비후보자/후보자 단계 구분하여 답변
- 허위 확정 표현 금지
- 관할 선관위: 순천시선거관리위원회 061-729-1390

[핵심 수치 - 순천시 제7선거구]
- 선거비용제한액: 52,289,440원
- 예비후보자홍보물: 1,167부 이내 / 세대수: 11,670
- 선거일: 2026.06.03(수)
- 후보자 등록: 2026.05.14~15

[지식베이스]
`;

  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) return base;
    const files = fs.readdirSync(KNOWLEDGE_DIR)
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .sort();

    const contents = files.map(f => {
      const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf-8');
      return `\n\n--- ${f} ---\n${content}`;
    });

    return base + contents.join('\n');
  } catch (err) {
    console.error('지식베이스 로드 오류:', err.message);
    return base;
  }
}

// 지식파일 목록 반환
function listKnowledge() {
  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
    return fs.readdirSync(KNOWLEDGE_DIR)
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      .sort()
      .map(f => {
        const stat = fs.statSync(path.join(KNOWLEDGE_DIR, f));
        return { name: f, size: stat.size, updated: stat.mtime };
      });
  } catch {
    return [];
  }
}

// 지식파일 삭제
function deleteKnowledge(filename) {
  const filePath = path.join(KNOWLEDGE_DIR, path.basename(filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = { buildSystemPrompt, listKnowledge, deleteKnowledge, KNOWLEDGE_DIR };
