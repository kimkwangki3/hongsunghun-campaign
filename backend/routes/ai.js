// routes/ai.js — AI 법무봇
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');
const { buildSystemPrompt, listKnowledge, deleteKnowledge, KNOWLEDGE_DIR } = require('../utils/knowledgeLoader');

// 업로드 설정 (PDF, DOCX, MD만 허용)
const upload = multer({
  dest: path.join(__dirname, '../knowledge/_tmp'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|docx|doc|md|txt)$/i.test(file.originalname);
    ok ? cb(null, true) : cb(new Error('PDF, DOCX, MD, TXT 파일만 업로드 가능'));
  }
});

if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

// POST /api/v1/ai/chat — AI 대화
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: '메시지 필요' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ success: false, message: 'AI 서비스 미설정' });
    }

    const systemPrompt = buildSystemPrompt();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.slice(-20) // 최근 20개만 (토큰 절약)
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Anthropic API 오류:', err);
      return res.status(502).json({ success: false, message: 'AI 응답 오류' });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    res.json({ success: true, data: { content } });
  } catch (err) {
    console.error('AI 챗 오류:', err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// GET /api/v1/ai/knowledge — 지식파일 목록 (관리자)
router.get('/knowledge', requireAdmin, (req, res) => {
  res.json({ success: true, data: listKnowledge() });
});

// POST /api/v1/ai/knowledge — 파일 업로드 (관리자)
router.post('/knowledge', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '파일 없음' });

  const tmpPath = req.file.path;
  const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const ext = path.extname(origName).toLowerCase();
  const baseName = path.basename(origName, ext).replace(/[/\\?%*:|"<>]/g, '_');
  const saveName = `${baseName}.md`;
  const savePath = path.join(KNOWLEDGE_DIR, saveName);

  try {
    let text = '';

    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(tmpPath);
      const parsed = await pdfParse(buf);
      text = `# ${baseName}\n\n${parsed.text}`;
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: tmpPath });
      text = `# ${baseName}\n\n${result.value}`;
    } else {
      text = fs.readFileSync(tmpPath, 'utf-8');
    }

    fs.writeFileSync(savePath, text, 'utf-8');
    fs.unlinkSync(tmpPath);

    res.json({ success: true, data: { name: saveName, size: text.length } });
  } catch (err) {
    console.error('파일 파싱 오류:', err);
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    res.status(500).json({ success: false, message: `파일 파싱 실패: ${err.message}` });
  }
});

// GET /api/v1/ai/knowledge/:filename — 지식파일 내용 조회 (관리자)
router.get('/knowledge/:filename', requireAdmin, (req, res) => {
  try {
    const filePath = path.join(KNOWLEDGE_DIR, path.basename(req.params.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: '파일 없음' });
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ success: true, data: { name: req.params.filename, content } });
  } catch (err) {
    res.status(500).json({ success: false, message: '조회 실패' });
  }
});

// DELETE /api/v1/ai/knowledge/:filename — 지식파일 삭제 (관리자)
router.delete('/knowledge/:filename', requireAdmin, (req, res) => {
  try {
    deleteKnowledge(req.params.filename);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

module.exports = router;
