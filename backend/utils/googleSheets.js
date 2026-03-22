// utils/googleSheets.js — 선거회계 구글시트 자동 동기화
// Firebase 서비스 계정(FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)을 그대로 재사용
const { google } = require('googleapis');

// ── 시트별 컬럼 헤더 (선관위 회계보고서 양식 기준) ─────────────────
const SHEET_HEADERS = {
  '수입지출장부':   ['번호','날짜','구분','비용구분','과목','내용/거래처','금액(원)','영수증번호','계좌확인','보전가능','비고','등록자','등록일시'],
  '선거비용명세':   ['번호','지출일','비용과목','내용/거래처','금액(원)','영수증종류','영수증번호','보전여부','비고'],
  '후원회수입':     ['번호','수입일','기부자성명','생년월일','주소','직업','연락처','금액(원)','영수증번호','비고'],
  '후원회지출':     ['번호','지출일','지출과목','내용','금액(원)','영수증번호','비고'],
  '수당실비명세':   ['번호','지급일','직책','성명','계좌번호','수당(원)','일비(원)','식비(원)','교통공제(원)','지급합계(원)','영수증번호','승인여부','비고'],
  '영수증목록':     ['번호','업로드일','영수증날짜','업체명','사업자번호','영수증종류','금액(원)','과목','업로더','GCS백업URL'],
};

const ROLE_MAP = { manager:'선거사무장', branch_manager:'선거연락소장', accountant:'회계책임자', worker:'선거사무원' };

function getAuth() {
  if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) return null;
  return new google.auth.JWT(
    process.env.FIREBASE_CLIENT_EMAIL,
    null,
    process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
  );
}

function getClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.sheets({ version: 'v4', auth });
}

// 단일 행 추가 (fire-and-forget 용)
async function appendRow(sheetName, values) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return;
  const client = getClient();
  if (!client) return;
  try {
    await client.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
  } catch (err) {
    console.error(`[Sheets] appendRow 오류 (${sheetName}):`, err.message);
  }
}

// 서비스 계정이 직접 새 스프레드시트 생성
async function createNewSpreadsheet() {
  const auth = getAuth();
  if (!auth) throw new Error('Firebase 서비스 계정 미설정');
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  // 새 스프레드시트 생성
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: '홍성훈캠프 선거회계장부' },
      sheets: Object.keys(SHEET_HEADERS).map(title => ({ properties: { title } })),
    }
  });
  const spreadsheetId = created.data.spreadsheetId;
  const url = created.data.spreadsheetUrl;

  // 기존 사용자에게 편집자 권한 공유 (선택적: 이미 공유된 이메일)
  try {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: 'writer', type: 'user', emailAddress: 'rlaehdgo0301@gmail.com' },
      fields: 'id',
    });
  } catch (e) { console.error('공유 설정 오류:', e.message); }

  console.log('✅ 새 스프레드시트 생성:', spreadsheetId, url);
  return { spreadsheetId, url };
}

// 시트 초기 설정: 없는 시트 생성 + 헤더 행 작성 + 헤더 서식
async function setupSheets() {
  const client = getClient();
  if (!client) throw new Error('Firebase 서비스 계정 미설정 (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');

  let spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // 기존 시트 접근 시도, 실패하면 새로 생성
  if (spreadsheetId) {
    try {
      await client.spreadsheets.get({ spreadsheetId });
    } catch (e) {
      console.warn('기존 시트 접근 실패, 새 시트 생성:', e.message);
      const { spreadsheetId: newId } = await createNewSpreadsheet();
      spreadsheetId = newId;
      console.log('🆕 새 GOOGLE_SHEET_ID:', spreadsheetId, '← Render 환경변수를 이 값으로 교체하세요');
    }
  } else {
    const { spreadsheetId: newId } = await createNewSpreadsheet();
    spreadsheetId = newId;
    console.log('🆕 새 GOOGLE_SHEET_ID:', spreadsheetId, '← Render 환경변수에 추가하세요');
  }

  const meta = await client.spreadsheets.get({ spreadsheetId });
  const existingNames = meta.data.sheets.map(s => s.properties.title);
  const toCreate = Object.keys(SHEET_HEADERS).filter(n => !existingNames.includes(n));

  if (toCreate.length > 0) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: toCreate.map(title => ({ addSheet: { properties: { title } } })) },
    });
  }

  // 헤더 일괄 작성
  for (const [name, headers] of Object.entries(SHEET_HEADERS)) {
    await client.spreadsheets.values.update({
      spreadsheetId,
      range: `${name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }

  // 헤더 서식 (남색 배경, 흰 볼드)
  const afterMeta = await client.spreadsheets.get({ spreadsheetId });
  const idMap = Object.fromEntries(afterMeta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]));
  const fmtRequests = Object.entries(SHEET_HEADERS).map(([name, headers]) => ({
    repeatCell: {
      range: { sheetId: idMap[name], startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
      cell: { userEnteredFormat: {
        backgroundColor: { red: 0.18, green: 0.33, blue: 0.76 },
        textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
        horizontalAlignment: 'CENTER',
      }},
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
    },
  }));
  // 열 고정 (1행 고정)
  const freezeRequests = Object.values(idMap).map(sheetId => ({
    updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' },
  }));
  await client.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [...fmtRequests, ...freezeRequests] } });
  return { sheets: Object.keys(SHEET_HEADERS), spreadsheetId };
}

// 전체 동기화: DB → 시트 전체 덮어쓰기
async function syncAll(db) {
  const client = getClient();
  if (!client) throw new Error('Google 서비스 계정 미설정');

  const { spreadsheetId } = await setupSheets();

  // 각 시트 데이터 행 전체 삭제 (헤더 A1 유지)
  const meta = await client.spreadsheets.get({ spreadsheetId });
  const idMap = Object.fromEntries(meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId]));
  for (const name of Object.keys(SHEET_HEADERS)) {
    if (!idMap[name]) continue;
    await client.spreadsheets.values.clear({ spreadsheetId, range: `${name}!A2:Z10000` }).catch(() => {});
  }

  // ─ 수입지출장부 + 선거비용명세 ────────────────────────
  const txRows = await db.all(
    `SELECT t.*, u.name AS created_by_name FROM acct_transactions t
     LEFT JOIN users u ON t.created_by = u.id ORDER BY t.date, t.id`
  );
  if (txRows.length > 0) {
    const txValues = txRows.map((t, i) => [
      i+1, t.date,
      t.type === 'income' ? '수입' : '지출',
      t.cost_type === 'election_cost' ? '선거비용' : t.cost_type === 'non_election_cost' ? '비선거비용' : '',
      t.category || '', t.description || '', t.amount,
      t.receipt_no || '', t.account_verified ? 'O' : '', t.reimbursable ? 'O' : '',
      t.note || '', t.created_by_name || '',
      t.created_at ? new Date(t.created_at).toLocaleString('ko-KR') : '',
    ]);
    await client.spreadsheets.values.update({ spreadsheetId, range: '수입지출장부!A2', valueInputOption: 'USER_ENTERED', requestBody: { values: txValues } });

    const elecValues = txRows
      .filter(t => t.type === 'expense' && t.cost_type === 'election_cost')
      .map((t, i) => [i+1, t.date, t.category||'', t.description||'', t.amount, '', t.receipt_no||'', t.reimbursable?'O':'', t.note||'']);
    if (elecValues.length > 0) {
      await client.spreadsheets.values.update({ spreadsheetId, range: '선거비용명세!A2', valueInputOption: 'USER_ENTERED', requestBody: { values: elecValues } });
    }
  }

  // ─ 후원회 수입 ────────────────────────────────────────
  const spInc = await db.all('SELECT * FROM acct_sponsor_income ORDER BY date, id');
  if (spInc.length > 0) {
    await client.spreadsheets.values.update({ spreadsheetId, range: '후원회수입!A2', valueInputOption: 'USER_ENTERED', requestBody: {
      values: spInc.map((r,i) => [i+1, r.date, r.donor_name||'익명', r.donor_dob||'', r.donor_address||'', r.donor_occupation||'', r.donor_phone||'', r.amount, r.receipt_no||'', r.note||''])
    }});
  }

  // ─ 후원회 지출 ────────────────────────────────────────
  const spExp = await db.all('SELECT * FROM acct_sponsor_expense ORDER BY date, id');
  if (spExp.length > 0) {
    await client.spreadsheets.values.update({ spreadsheetId, range: '후원회지출!A2', valueInputOption: 'USER_ENTERED', requestBody: {
      values: spExp.map((r,i) => [i+1, r.date, r.category, r.note||'', r.amount, r.receipt_no||'', ''])
    }});
  }

  // ─ 수당실비명세 ──────────────────────────────────────
  const staffRows = await db.all('SELECT * FROM acct_staff_payments ORDER BY payment_date, id');
  if (staffRows.length > 0) {
    await client.spreadsheets.values.update({ spreadsheetId, range: '수당실비명세!A2', valueInputOption: 'USER_ENTERED', requestBody: {
      values: staffRows.map((r,i) => [
        i+1, r.payment_date, ROLE_MAP[r.staff_role]||r.staff_role, r.staff_name, r.staff_account||'',
        r.allowance, 20000, Math.max(0, 25000-(r.meal_provided||0)*8330),
        r.transport_deduction||0, r.total_actual||0,
        r.receipt_no||'', r.approved?'승인':'미승인', r.note||''
      ])
    }});
  }

  // ─ 영수증목록 ──────────────────────────────────────
  const recRows = await db.all(
    `SELECT r.*, u.name AS uploader_name FROM acct_receipts r
     LEFT JOIN users u ON r.uploaded_by = u.id ORDER BY r.uploaded_at, r.id`
  );
  if (recRows.length > 0) {
    await client.spreadsheets.values.update({ spreadsheetId, range: '영수증목록!A2', valueInputOption: 'USER_ENTERED', requestBody: {
      values: recRows.map((r,i) => [
        i+1,
        r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString('ko-KR') : '',
        r.ocr_date||'', r.ocr_vendor||'', r.ocr_vendor_reg_no||'',
        r.ocr_receipt_type||'', r.ocr_amount||'', r.category_suggestion||'',
        r.uploader_name||'', r.gcs_url||r.image_url||''
      ])
    }});
  }

  return {
    tx: txRows.length, receipts: recRows.length,
    staff: staffRows.length, sponsor: spInc.length + spExp.length,
    spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

module.exports = { appendRow, setupSheets, syncAll, SHEET_HEADERS, ROLE_MAP };
