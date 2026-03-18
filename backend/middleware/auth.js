// middleware/auth.js — Agent: SECURITY
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_this';

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '인증 토큰 필요' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: '유효하지 않은 토큰' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: '관리자 권한 필요' });
  }
  next();
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '365d' });
}

function verifyToken_raw(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { verifyToken, requireAdmin, signToken, verifyToken: verifyToken, verifyToken_raw: verifyToken_raw };
