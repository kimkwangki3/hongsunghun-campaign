// utils/gcsBackup.js — Firebase Storage(GCS) 영수증 원본 백업
const admin = require('firebase-admin');
const path = require('path');

async function backupToGCS(localPath, originalFilename) {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName || !admin.apps.length) return null;

  try {
    const ext = path.extname(originalFilename || localPath) || '.jpg';
    const destPath = `receipts/${Date.now()}_${path.basename(originalFilename || localPath)}`;
    const contentType =
      ext === '.png'  ? 'image/png'  :
      ext === '.webp' ? 'image/webp' :
      ext === '.heic' ? 'image/heic' : 'image/jpeg';

    const bucket = admin.storage().bucket(bucketName);
    await bucket.upload(localPath, {
      destination: destPath,
      metadata: { contentType, cacheControl: 'no-cache' }
    });

    const file = bucket.file(destPath);
    await file.makePublic();
    return `https://storage.googleapis.com/${bucketName}/${destPath}`;
  } catch (err) {
    console.error('GCS 백업 오류:', err.message);
    return null;
  }
}

async function downloadGCSBuffer(gcsUrl) {
  const response = await fetch(gcsUrl);
  if (!response.ok) throw new Error(`GCS 다운로드 실패: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

module.exports = { backupToGCS, downloadGCSBuffer };
