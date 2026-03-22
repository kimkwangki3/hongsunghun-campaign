import { useState, useRef, useEffect } from 'react';
import { api } from '../utils/api';

const LIMIT = 52289440;
const ELECTION_DATE = new Date('2026-06-03');

function calcDday() {
  const diff = Math.ceil((ELECTION_DATE - new Date().setHours(0,0,0,0)) / 86400000);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return 'D-DAY';
  return `D+${Math.abs(diff)}`;
}

const QUICK = [
  { icon:'📋', label:'예비후보자 선거운동', q:'예비후보자 단계에서 할 수 있는 선거운동 방법을 허용과 금지로 구분해서 알려줘' },
  { icon:'👤', label:'수당·실비 기준', q:'선거사무관계자 수당·실비 지급 기준과 1일 최대 금액은?' },
  { icon:'💰', label:'후원회 설립', q:'후원회 설립 절차와 후원금 한도를 알려줘' },
  { icon:'⚠️', label:'기부행위 금지', q:'기부행위 금지 규정과 위험 사례를 알려줘' },
  { icon:'📑', label:'선거비용 보전', q:'선거비용 보전 청구 방법과 기준은?' },
  { icon:'📒', label:'회계책임자', q:'회계책임자 겸임 가능 대상과 신고 방법은?' },
  { icon:'🚫', label:'딥페이크 금지', q:'딥페이크·AI 선거운동 금지 규정은?' },
  { icon:'💬', label:'SNS 선거운동', q:'SNS·인터넷 선거운동 허용 범위는?' },
  { icon:'📝', label:'예비후보자 등록', q:'예비후보자 등록 절차와 필요 서류는?' },
  { icon:'💵', label:'비용제한액', q:'순천시 제7선거구 선거비용제한액과 초과 시 처벌은?' },
];


function renderText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#00c9a7;font-weight:600">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

export default function AIBotPage() {
  const [tab, setTab] = useState('chat'); // chat | calc
  const [messages, setMessages] = useState([{
    role:'assistant',
    content:`안녕하세요! **홍성훈 캠프 AI 법무봇**입니다.\n\n순천시 제7선거구 기준으로 **선거법·회계처리·정치자금**에 관한 질문에 답변드립니다.\n\n아래 빠른 질문을 눌러보거나 직접 질문해 주세요.`
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [spend, setSpend] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages, loading]);

  async function sendMessage(text) {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    const userMsg = { role:'user', content:q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = [...messages, userMsg]
        .filter(m => m.role !== 'assistant' || m !== messages[0]) // 웰컴 메시지 제외
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

      const res = await api.post('/ai/chat', { messages: history });
      setMessages(prev => [...prev, { role:'assistant', content: res.data.data.content }]);
    } catch {
      setMessages(prev => [...prev, { role:'assistant', content:'❌ 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // 잔여 비용 계산
  const spendNum = parseInt(spend.replace(/,/g, '')) || 0;
  const remain = LIMIT - spendNum;
  const pct = spendNum > 0 ? (spendNum / LIMIT * 100).toFixed(1) : null;
  const over200 = spendNum > LIMIT / 200;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0a0e1a', overflow:'hidden' }}>

      {/* 상단 정보바 */}
      <div style={{
        background:'#111827', borderBottom:'1px solid #1e2d45',
        padding:'10px 16px', flexShrink:0
      }}>
        {/* D-Day + 탭 */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{
              width:32, height:32, borderRadius:8,
              background:'linear-gradient(135deg,#1e6bff,#00c9a7)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:16, fontWeight:900, color:'#fff', fontFamily:"'Noto Serif KR', serif"
            }}>選</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#e8edf5' }}>AI 법무봇</div>
              <div style={{ fontSize:10, color:'#8896b3' }}>순천시 제7선거구</div>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{
              fontSize:22, fontWeight:900, fontFamily:"'Noto Serif KR',serif",
              background:'linear-gradient(90deg,#1e6bff,#00c9a7)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1
            }}>{calcDday()}</div>
            <div style={{ fontSize:10, color:'#8896b3', marginTop:2 }}>2026.06.03 선거일</div>
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display:'flex', gap:6 }}>
          {[['chat','💬 법무봇'], ['calc','💵 비용계산']].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex:1, padding:'6px 0', fontSize:11, fontWeight:700,
              background: tab===t ? 'linear-gradient(135deg,#1e6bff,#0047cc)' : '#1a2236',
              color: tab===t ? '#fff' : '#8896b3',
              border: tab===t ? 'none' : '1px solid #1e2d45',
              borderRadius:8, cursor:'pointer', fontFamily:"'Noto Sans KR',sans-serif"
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── 채팅 탭 ── */}
      {tab === 'chat' && (
        <>
          {/* 빠른 질문 */}
          <div style={{
            display:'flex', gap:6, padding:'8px 12px', overflowX:'auto', flexShrink:0,
            background:'#111827', borderBottom:'1px solid #1e2d45'
          }}>
            {QUICK.map((q, i) => (
              <button key={i} onClick={() => sendMessage(q.q)} style={{
                whiteSpace:'nowrap', padding:'5px 10px', fontSize:11,
                background:'#1a2236', border:'1px solid #1e2d45',
                borderRadius:20, color:'#8896b3', cursor:'pointer',
                fontFamily:"'Noto Sans KR',sans-serif", flexShrink:0
              }}>
                {q.icon} {q.label}
              </button>
            ))}
          </div>

          {/* 메시지 목록 */}
          <div style={{ flex:1, overflowY:'auto', padding:'14px 12px', display:'flex', flexDirection:'column', gap:12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display:'flex', gap:8, flexDirection: m.role==='user' ? 'row-reverse' : 'row',
                alignItems:'flex-start'
              }}>
                {m.role === 'assistant' && (
                  <div style={{
                    width:28, height:28, borderRadius:7, flexShrink:0,
                    background:'linear-gradient(135deg,#1e6bff,#00c9a7)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:13
                  }}>⚖️</div>
                )}
                <div style={{
                  maxWidth:'80%', padding:'10px 13px', borderRadius:12, fontSize:13, lineHeight:1.75,
                  background: m.role==='user' ? '#1a3a6b' : '#141e30',
                  border: m.role==='user' ? '1px solid #1e3d6b' : '1px solid #1e2d45',
                  color:'#e8edf5',
                  borderTopRightRadius: m.role==='user' ? 2 : 12,
                  borderTopLeftRadius: m.role==='assistant' ? 2 : 12,
                  wordBreak:'break-word'
                }}
                  dangerouslySetInnerHTML={{ __html: renderText(m.content) }}
                />
              </div>
            ))}
            {loading && (
              <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                <div style={{
                  width:28, height:28, borderRadius:7,
                  background:'linear-gradient(135deg,#1e6bff,#00c9a7)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:13
                }}>⚖️</div>
                <div style={{
                  padding:'10px 13px', borderRadius:12, background:'#141e30',
                  border:'1px solid #1e2d45', borderTopLeftRadius:2
                }}>
                  <div style={{ display:'flex', gap:4 }}>
                    {[0,1,2].map(i => (
                      <span key={i} style={{
                        width:6, height:6, borderRadius:'50%', background:'#1e6bff',
                        display:'inline-block',
                        animation:`bounce 1.2s ${i*0.2}s infinite`
                      }}/>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력창 */}
          <div style={{
            padding:'10px 12px', background:'#111827',
            borderTop:'1px solid #1e2d45', flexShrink:0
          }}>
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="선거법, 회계처리, 선거운동 방법 등 질문하세요..."
                rows={1}
                style={{
                  flex:1, background:'#1a2236', border:'1px solid #1e2d45',
                  borderRadius:12, padding:'10px 13px', color:'#e8edf5',
                  fontSize:13, fontFamily:"'Noto Sans KR',sans-serif",
                  resize:'none', outline:'none', lineHeight:1.5,
                  minHeight:44, maxHeight:120
                }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
              />
              <button onClick={() => sendMessage()} disabled={loading || !input.trim()} style={{
                width:44, height:44, flexShrink:0,
                background: loading || !input.trim() ? '#1a2236' : 'linear-gradient(135deg,#1e6bff,#0047cc)',
                border:'none', borderRadius:12, color:'#fff', fontSize:18,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                opacity: loading || !input.trim() ? 0.4 : 1
              }}>↑</button>
            </div>
            <div style={{ fontSize:10, color:'#4a5878', marginTop:6, textAlign:'center' }}>
              ⚠️ 참고용 정보입니다. 중요 사안은 순천시선거관리위원회(061-729-1390)에 확인하세요.
            </div>
          </div>
        </>
      )}

      {/* ── 비용계산 탭 ── */}
      {tab === 'calc' && (
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#e8edf5', marginBottom:4 }}>💵 선거비용 잔여 계산기</div>
          <div style={{ fontSize:11, color:'#8896b3', marginBottom:16 }}>
            순천시 제7선거구 제한액: <strong style={{ color:'#00c9a7' }}>52,289,440원</strong>
          </div>

          <div style={{
            background:'#141e30', border:'1px solid #1e2d45',
            borderRadius:12, padding:16, marginBottom:12
          }}>
            <div style={{ fontSize:11, color:'#8896b3', marginBottom:8 }}>현재 지출액 입력</div>
            <input
              type="number"
              placeholder="예: 5000000"
              value={spend}
              onChange={e => setSpend(e.target.value)}
              style={{
                width:'100%', background:'#1a2236', border:'1px solid #1e2d45',
                borderRadius:8, padding:'10px 13px', color:'#e8edf5',
                fontSize:14, fontFamily:"'Noto Sans KR',sans-serif", outline:'none'
              }}
            />
          </div>

          {spendNum > 0 && (
            <div style={{
              background: spendNum > LIMIT ? 'rgba(255,71,87,0.1)' : '#141e30',
              border: `1px solid ${spendNum > LIMIT ? '#ff4757' : '#1e2d45'}`,
              borderRadius:12, padding:16
            }}>
              {spendNum > LIMIT ? (
                <>
                  <div style={{ fontSize:15, fontWeight:700, color:'#ff4757', marginBottom:8 }}>⛔ 제한액 초과!</div>
                  <div style={{ fontSize:13, color:'#ff4757' }}>초과금액: <strong>{(spendNum-LIMIT).toLocaleString()}원</strong></div>
                  <div style={{ fontSize:12, color:'#8896b3', marginTop:6 }}>처벌·당선무효 위험이 있습니다. 즉시 확인하세요.</div>
                </>
              ) : (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                    <span style={{ fontSize:12, color:'#8896b3' }}>잔여</span>
                    <span style={{ fontSize:16, fontWeight:700, color:'#00c9a7' }}>{remain.toLocaleString()}원</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                    <span style={{ fontSize:12, color:'#8896b3' }}>사용률</span>
                    <span style={{ fontSize:13, color:'#e8edf5' }}>{pct}%</span>
                  </div>
                  {/* 프로그레스 바 */}
                  <div style={{ background:'#1a2236', borderRadius:4, height:8, overflow:'hidden', marginBottom:10 }}>
                    <div style={{
                      width:`${Math.min(pct, 100)}%`, height:'100%', borderRadius:4,
                      background: over200 ? 'linear-gradient(90deg,#ffa502,#ff4757)' : 'linear-gradient(90deg,#1e6bff,#00c9a7)',
                      transition:'width 0.3s'
                    }}/>
                  </div>
                  <div style={{ fontSize:12, color: over200 ? '#ffa502' : '#00c9a7', fontWeight:600 }}>
                    {over200 ? '⚠️ 1/200 기준(261,447원) 초과 중' : '✅ 1/200 기준 이내'}
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop:16, fontSize:11, color:'#4a5878', lineHeight:1.7 }}>
            * 1/200 기준: 261,447원<br/>
            * 15% 이상 득표 시 전액 보전<br/>
            * 10~15%: 50% 보전 / 10% 미만: 미보전
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%,80%,100%{transform:translateY(0);opacity:.4}
          40%{transform:translateY(-5px);opacity:1}
        }
      `}</style>
    </div>
  );
}
