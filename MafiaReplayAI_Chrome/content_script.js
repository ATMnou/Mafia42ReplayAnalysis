// ─────────────────────────────────────────────
// Mafia42 Replay Analyzer — content_script.js
// ─────────────────────────────────────────────

(function () {
  "use strict";

  // ── 중복 실행 방지 ──────────────────────────
  if (document.getElementById("m42-analyzer-root")) return;

  // ── 현재 URL이 리플레이 페이지인지 확인 ────
  const isReplayPage = /\/history\/(kr|en)\/[a-f0-9]+/.test(location.pathname);
  if (!isReplayPage) return;

  // ══════════════════════════════════════════
  //  스타일 주입
  // ══════════════════════════════════════════
  const style = document.createElement("style");
  style.textContent = `
    /* ── 폰트 ── */
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap');

    /* ── 변수 ── */
    #m42-analyzer-root {
      --m42-bg:        #0e0f14;
      --m42-surface:   #161820;
      --m42-border:    #2a2d3e;
      --m42-accent:    #c8a96e;       /* 마피아 금색 */
      --m42-accent2:   #7b5ea7;       /* 보조 보라 */
      --m42-text:      #d6d8e0;
      --m42-muted:     #6b6f82;
      --m42-success:   #4caf82;
      --m42-danger:    #e05c5c;
      --m42-radius:    10px;
      --m42-panel-w:   420px;
      --m42-font:      'Noto Sans KR', sans-serif;
      --m42-mono:      'JetBrains Mono', monospace;
      --m42-transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* ── 트리거 버튼 ── */
    #m42-trigger-btn {
      position: fixed;
      bottom: 32px;
      right: 32px;
      z-index: 999998;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: var(--m42-accent);
      color: #0e0f14;
      font-family: var(--m42-font);
      font-size: 13px;
      font-weight: 700;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(200, 169, 110, 0.35), 0 1px 4px rgba(0,0,0,0.5);
      transition: transform var(--m42-transition), box-shadow var(--m42-transition), opacity var(--m42-transition);
      letter-spacing: 0.02em;
    }
    #m42-trigger-btn:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 8px 32px rgba(200, 169, 110, 0.5), 0 2px 8px rgba(0,0,0,0.5);
    }
    #m42-trigger-btn:active {
      transform: scale(0.97);
    }
    #m42-trigger-btn.hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px);
    }
    #m42-trigger-btn svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    /* ── 오버레이 배경 ── */
    #m42-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(8, 9, 14, 0.6);
      backdrop-filter: blur(2px);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--m42-transition);
    }
    #m42-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── 사이드 패널 ── */
    #m42-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 1000000;
      width: var(--m42-panel-w);
      max-width: 100vw;
      background: var(--m42-bg);
      border-left: 1px solid var(--m42-border);
      display: flex;
      flex-direction: column;
      font-family: var(--m42-font);
      color: var(--m42-text);
      transform: translateX(100%);
      transition: transform var(--m42-transition);
      box-shadow: -8px 0 48px rgba(0,0,0,0.6);
    }
    #m42-panel.open {
      transform: translateX(0);
    }

    /* ── 패널 헤더 ── */
    #m42-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px 16px;
      border-bottom: 1px solid var(--m42-border);
      background: var(--m42-surface);
      flex-shrink: 0;
    }
    #m42-panel-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 700;
      color: var(--m42-accent);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    #m42-panel-title svg {
      width: 18px;
      height: 18px;
    }
    #m42-close-btn {
      width: 32px;
      height: 32px;
      border: 1px solid var(--m42-border);
      background: transparent;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--m42-muted);
      transition: color var(--m42-transition), border-color var(--m42-transition), background var(--m42-transition);
    }
    #m42-close-btn:hover {
      color: var(--m42-text);
      border-color: var(--m42-accent);
      background: rgba(200, 169, 110, 0.08);
    }
    #m42-close-btn svg {
      width: 14px;
      height: 14px;
    }

    /* ── 게임 정보 배지 영역 ── */
    #m42-meta {
      padding: 14px 20px;
      border-bottom: 1px solid var(--m42-border);
      background: var(--m42-surface);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .m42-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      font-family: var(--m42-mono);
      letter-spacing: 0.03em;
    }
    .m42-badge-url {
      background: rgba(123, 94, 167, 0.15);
      color: #a98ccc;
      border: 1px solid rgba(123, 94, 167, 0.3);
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .m42-badge-cult {
      background: rgba(224, 92, 92, 0.12);
      color: var(--m42-danger);
      border: 1px solid rgba(224, 92, 92, 0.25);
    }

    /* ── 분석 버튼 ── */
    #m42-analyze-btn {
      margin: 16px 20px;
      padding: 13px 20px;
      background: linear-gradient(135deg, var(--m42-accent) 0%, #b8973a 100%);
      color: #0e0f14;
      font-family: var(--m42-font);
      font-size: 13px;
      font-weight: 700;
      border: none;
      border-radius: var(--m42-radius);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      letter-spacing: 0.03em;
      transition: opacity var(--m42-transition), transform var(--m42-transition);
      flex-shrink: 0;
    }
    #m42-analyze-btn:hover:not(:disabled) {
      opacity: 0.9;
      transform: translateY(-1px);
    }
    #m42-analyze-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    #m42-analyze-btn svg {
      width: 15px;
      height: 15px;
    }

    /* ── 결과 본문 스크롤 영역 ── */
    #m42-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 20px 24px;
      scrollbar-width: thin;
      scrollbar-color: var(--m42-border) transparent;
    }
    #m42-body::-webkit-scrollbar { width: 4px; }
    #m42-body::-webkit-scrollbar-track { background: transparent; }
    #m42-body::-webkit-scrollbar-thumb { background: var(--m42-border); border-radius: 2px; }

    /* ── 상태 표시 영역 ── */
    #m42-status {
      margin-top: 16px;
    }

    /* 로딩 */
    .m42-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 40px 20px;
      color: var(--m42-muted);
      font-size: 13px;
      text-align: center;
    }
    .m42-spinner {
      width: 36px;
      height: 36px;
      border: 2px solid var(--m42-border);
      border-top-color: var(--m42-accent);
      border-radius: 50%;
      animation: m42-spin 0.8s linear infinite;
    }
    @keyframes m42-spin { to { transform: rotate(360deg); } }
    .m42-loading-step {
      font-family: var(--m42-mono);
      font-size: 11px;
      color: var(--m42-muted);
    }
    .m42-loading-step.active {
      color: var(--m42-accent);
    }
    .m42-loading-steps {
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: left;
      min-width: 180px;
    }
    .m42-step-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .m42-step-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--m42-border);
      flex-shrink: 0;
      transition: background 0.3s;
    }
    .m42-step-dot.done { background: var(--m42-success); }
    .m42-step-dot.active {
      background: var(--m42-accent);
      box-shadow: 0 0 6px rgba(200,169,110,0.6);
      animation: m42-pulse 1s ease-in-out infinite;
    }
    @keyframes m42-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

    /* 에러 */
    .m42-error {
      margin-top: 16px;
      padding: 14px 16px;
      background: rgba(224, 92, 92, 0.08);
      border: 1px solid rgba(224, 92, 92, 0.25);
      border-radius: var(--m42-radius);
      color: var(--m42-danger);
      font-size: 12px;
      font-family: var(--m42-mono);
      line-height: 1.6;
    }
    .m42-error-title {
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 12px;
    }

    /* API 키 없음 안내 */
    .m42-no-key {
      margin-top: 16px;
      padding: 20px;
      background: rgba(200, 169, 110, 0.06);
      border: 1px dashed rgba(200, 169, 110, 0.3);
      border-radius: var(--m42-radius);
      text-align: center;
    }
    .m42-no-key p {
      font-size: 13px;
      color: var(--m42-muted);
      margin: 0 0 12px;
      line-height: 1.6;
    }
    .m42-settings-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: transparent;
      border: 1px solid var(--m42-accent);
      color: var(--m42-accent);
      font-family: var(--m42-font);
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: background var(--m42-transition);
    }
    .m42-settings-link:hover {
      background: rgba(200, 169, 110, 0.1);
    }

    /* ── 결과 카드 ── */
    .m42-result {
      animation: m42-fadein 0.3s ease;
    }
    @keyframes m42-fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }

    /* 승리팀 배너 */
    .m42-winner-banner {
      margin-top: 16px;
      padding: 14px 18px;
      border-radius: var(--m42-radius);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: center;
    }
    .m42-winner-mafia {
      background: rgba(224, 92, 92, 0.12);
      border: 1px solid rgba(224, 92, 92, 0.3);
      color: var(--m42-danger);
    }
    .m42-winner-citizen {
      background: rgba(76, 175, 130, 0.1);
      border: 1px solid rgba(76, 175, 130, 0.25);
      color: var(--m42-success);
    }
    .m42-winner-other {
      background: rgba(200, 169, 110, 0.1);
      border: 1px solid rgba(200, 169, 110, 0.25);
      color: var(--m42-accent);
    }

    /* 섹션 헤더 */
    .m42-section-label {
      margin-top: 20px;
      margin-bottom: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--m42-muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .m42-section-label::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--m42-border);
    }

    /* 플레이어 테이블 */
    .m42-user-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .m42-user-table th {
      padding: 6px 10px;
      text-align: left;
      color: var(--m42-muted);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--m42-border);
    }
    .m42-user-table td {
      padding: 7px 10px;
      border-bottom: 1px solid rgba(42, 45, 62, 0.5);
      color: var(--m42-text);
      font-family: var(--m42-mono);
      font-size: 11px;
    }
    .m42-user-table tr:last-child td { border-bottom: none; }
    .m42-user-table tr:hover td { background: rgba(255,255,255,0.02); }
    .m42-job-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      border: 1px solid transparent;
    }
    .m42-job-pill[class*="m42-job-"] {
      color: var(--m42-job-color, var(--m42-muted));
      background: color-mix(in srgb, var(--m42-job-color, var(--m42-muted)) 16%, transparent);
      border-color: color-mix(in srgb, var(--m42-job-color, var(--m42-muted)) 34%, transparent);
    }

    .m42-job-spy { --m42-job-color: #e3469d; }
    .m42-job-beastman { --m42-job-color: #c27224; }
    .m42-job-madam { --m42-job-color: #b20001; }
    .m42-job-thief { --m42-job-color: #287cc7; }
    .m42-job-witch { --m42-job-color: #b62be6; }
    .m42-job-scientist { --m42-job-color: #f1fc77; }
    .m42-job-swindler { --m42-job-color: #d0473f; }
    .m42-job-hitman { --m42-job-color: #bfc3cb; }
    .m42-job-godfather { --m42-job-color: #4d260d; }

    .m42-job-vigilante { --m42-job-color: #192e6c; }
    .m42-job-agent { --m42-job-color: #95c7ff; }
    .m42-job-doctor { --m42-job-color: #f4f4fe; }
    .m42-job-soldier { --m42-job-color: #0cb39f; }
    .m42-job-politician { --m42-job-color: #008cae; }
    .m42-job-shaman { --m42-job-color: #fdaf08; }
    .m42-job-couple { --m42-job-color: #f2e3f6; }
    .m42-job-gangster { --m42-job-color: #6ab20a; }
    .m42-job-reporter { --m42-job-color: #aab1c1; }
    .m42-job-detective { --m42-job-color: #f27d16; }
    .m42-job-ghoul { --m42-job-color: #8e665a; }
    .m42-job-terrorlist,
    .m42-job-terrorist { --m42-job-color: #b800b0; }
    .m42-job-priest { --m42-job-color: #5d5e6d; }
    .m42-job-prophet { --m42-job-color: #cbb9b0; }
    .m42-job-judge { --m42-job-color: #be4613; }
    .m42-job-nurse { --m42-job-color: #ffadd5; }
    .m42-job-magician { --m42-job-color: #8c87e4; }
    .m42-job-hacker { --m42-job-color: #385a58; }
    .m42-job-mentalist { --m42-job-color: #ff7f50; }
    .m42-job-mercenary { --m42-job-color: #617041; }
    .m42-job-administrator { --m42-job-color: #f6ff68; }
    .m42-job-cabal { --m42-job-color: #242424; }
    .m42-job-paparazzi { --m42-job-color: #df86b7; }
    .m42-job-hypnotist { --m42-job-color: #745386; }
    .m42-job-fortuneteller { --m42-job-color: #514e75; }

    .m42-job-cultleader { --m42-job-color: #b5a888; }
    .m42-job-fanatic { --m42-job-color: #563c18; }

    .m42-job-mafia { --m42-job-color: #e05c5c; }
    .m42-job-police { --m42-job-color: #8bc0f0; }
    .m42-job-citizen,
    .m42-job-unknown { --m42-job-color: #6b6f82; }

    /* AI 분석 텍스트 */
    .m42-analysis-box {
      background: var(--m42-surface);
      border: 1px solid var(--m42-border);
      border-radius: var(--m42-radius);
      padding: 16px;
      font-size: 13px;
      line-height: 1.75;
      color: var(--m42-text);
      white-space: pre-wrap;
      word-break: keep-all;
    }

    /* 재분석 버튼 */
    .m42-rerun-btn {
      margin-top: 16px;
      width: 100%;
      padding: 10px;
      background: transparent;
      border: 1px solid var(--m42-border);
      border-radius: var(--m42-radius);
      color: var(--m42-muted);
      font-family: var(--m42-font);
      font-size: 12px;
      cursor: pointer;
      transition: border-color var(--m42-transition), color var(--m42-transition);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .m42-rerun-btn:hover {
      border-color: var(--m42-accent);
      color: var(--m42-accent);
    }
  `;
  document.head.appendChild(style);

  // ══════════════════════════════════════════
  //  DOM 생성
  // ══════════════════════════════════════════

  // 루트 컨테이너 (CSS 변수 스코프)
  const root = document.createElement("div");
  root.id = "m42-analyzer-root";
  document.body.appendChild(root);

  // 오버레이
  const overlay = document.createElement("div");
  overlay.id = "m42-overlay";
  root.appendChild(overlay);

  // 트리거 버튼 (우하단 FAB)
  const triggerBtn = document.createElement("button");
  triggerBtn.id = "m42-trigger-btn";
  triggerBtn.innerHTML = `
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M5.5 8h5M8 5.5v5" stroke-linecap="round"/>
    </svg>
    리플레이 분석
  `;
  root.appendChild(triggerBtn);

  // 패널
  const panel = document.createElement("div");
  panel.id = "m42-panel";
  panel.innerHTML = `
    <div id="m42-panel-header">
      <div id="m42-panel-title">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 2L11 7H16L12 10.5L13.5 16L9 13L4.5 16L6 10.5L2 7H7L9 2Z" stroke-linejoin="round"/>
        </svg>
        Mafia42 Analyzer
      </div>
      <button id="m42-close-btn" title="닫기">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M2 2l10 10M12 2L2 12"/>
        </svg>
      </button>
    </div>

    <div id="m42-meta">
      <span class="m42-badge m42-badge-url" id="m42-url-badge" title="${location.href}">
        ${location.pathname}
      </span>
    </div>

    <button id="m42-analyze-btn">
      <svg viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M7.5 1v13M1 7.5h13"/>
      </svg>
      AI 분석 시작
    </button>

    <div id="m42-body">
      <div id="m42-status"></div>
    </div>
  `;
  root.appendChild(panel);

  // ══════════════════════════════════════════
  //  유틸리티
  // ══════════════════════════════════════════

  function setStatus(html) {
    document.getElementById("m42-status").innerHTML = html;
  }

  function getJobClass(job) {
    if (!job) return "m42-job-unknown";
    return "m42-job-" + job.toLowerCase();
  }

  function getJobLabel(job) {
    const map = {
      citizen: "시민",
      mafia: "마피아",
      spy: "스파이",
      beastman: "짐승인간",
      madam: "마담",
      thief: "도둑",
      witch: "마녀",
      scientist: "과학자",
      swindler: "사기꾼",
      hitman: "청부업자",
      godfather: "대부",
      villain: "악인",
      police: "경찰",
      vigilante: "자경단원",
      agent: "요원",
      doctor: "의사",
      soldier: "군인",
      politician: "정치인",
      shaman: "영매",
      couple: "연인",
      gangster: "건달",
      reporter: "기자",
      detective: "사립탐정",
      ghoul: "도굴꾼",
      terrorlist: "테러리스트",
      priest: "성직자",
      prophet: "예언자",
      judge: "판사",
      nurse: "간호사",
      magician: "마술사",
      hacker: "해커",
      mentalist: "심리학자",
      mercenary: "용병",
      administrator: "공무원",
      cabal: "비밀결사",
      paparazzi: "파파라치",
      hypnotist: "최면술사",
      fortuneteller: "점쟁이",
      cultleader: "교주",
      fanatic: "광신도",
    };
    return map[job] || (job ?? "알수없음");
  }

  function getWinnerClass(text) {
    if (!text) return "m42-winner-other";
    const t = text.toLowerCase();
    if (t.includes("마피아") || t.includes("mafia")) return "m42-winner-mafia";
    if (t.includes("시민") || t.includes("citizen")) return "m42-winner-citizen";
    return "m42-winner-other";
  }

  // ── 단계 로딩 UI ─────────────────────────
  const STEPS = ["게임 로그 수집 중", "HTML 파싱 중", "AI 분석 요청 중", "결과 처리 중"];

  function renderLoading(activeStep = 0) {
    const stepsHtml = STEPS.map((label, i) => {
      const state = i < activeStep ? "done" : i === activeStep ? "active" : "";
      return `
        <div class="m42-step-row">
          <div class="m42-step-dot ${state}"></div>
          <span class="m42-loading-step ${state}">${label}</span>
        </div>`;
    }).join("");

    setStatus(`
      <div class="m42-loading">
        <div class="m42-spinner"></div>
        <div class="m42-loading-steps">${stepsHtml}</div>
      </div>
    `);
  }

  function updateStep(step) {
    const dots = document.querySelectorAll(".m42-step-dot");
    const labels = document.querySelectorAll(".m42-loading-step");
    dots.forEach((d, i) => {
      d.className = "m42-step-dot" + (i < step ? " done" : i === step ? " active" : "");
    });
    labels.forEach((l, i) => {
      l.className = "m42-loading-step" + (i === step ? " active" : "");
    });
  }

  // ── 결과 렌더링 ───────────────────────────
  function renderResult(data) {
    const { users = [], winningTeam, analysisText } = data;

    const winnerHtml = winningTeam ? `<div class="m42-winner-banner ${getWinnerClass(winningTeam)}">🏆 ${winningTeam}</div>` : "";

    const usersHtml =
      users.length > 0
        ? `
        <div class="m42-section-label">참가자</div>
        <table class="m42-user-table">
          <thead><tr><th>#</th><th>닉네임</th><th>직업</th></tr></thead>
          <tbody>
            ${users
              .map(
                (u) => `
              <tr>
                <td>${u.number}</td>
                <td>${u.nickname ?? "—"}</td>
                <td><span class="m42-job-pill ${getJobClass(u.job)}">${getJobLabel(u.job)}</span></td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
        : "";

    const analysisHtml = analysisText
      ? `
        <div class="m42-section-label">AI 분석</div>
        <div class="m42-analysis-box">${analysisText}</div>`
      : "";

    setStatus(`
      <div class="m42-result">
        ${winnerHtml}
        ${usersHtml}
        ${analysisHtml}
        <button class="m42-rerun-btn" id="m42-rerun-btn">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5c1.5 0 2.8.7 3.7 1.8"/>
            <path d="M10.5 1.5v2.8h-2.8"/>
          </svg>
          다시 분석
        </button>
      </div>
    `);

    document.getElementById("m42-rerun-btn")?.addEventListener("click", runAnalysis);
  }

  // ── 에러 렌더링 ───────────────────────────
  function renderError(msg) {
    setStatus(`
      <div class="m42-error">
        <div class="m42-error-title">오류 발생</div>
        ${msg}
      </div>
      <button class="m42-rerun-btn" id="m42-rerun-btn" style="margin-top:12px">다시 시도</button>
    `);
    document.getElementById("m42-rerun-btn")?.addEventListener("click", runAnalysis);
  }

  // ── API 키 없음 UI ────────────────────────
  function renderNoKey() {
    setStatus(`
      <div class="m42-no-key">
        <p>OpenRouter API 키가 설정되지 않았습니다.<br>확장 프로그램 설정에서 키를 입력해 주세요.</p>
        <button class="m42-settings-link" id="m42-open-settings">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="6" r="2"/>
            <path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.5 2.5l.7.7M8.8 8.8l.7.7M2.5 9.5l.7-.7M8.8 3.2l.7-.7"/>
          </svg>
          설정 열기
        </button>
      </div>
    `);
    document.getElementById("m42-open-settings")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
    });
  }

  // ══════════════════════════════════════════
  //  재시도용 핸들러 (renderResult/renderError 내 버튼에서 호출)
  // ══════════════════════════════════════════
  function runAnalysis() {
    document.getElementById("m42-analyze-btn").click();
  }

  // ── Background가 위임한 HTML 파싱 (DOMParser 사용 가능 환경) ──
  function normalizeReplayText(text) {
    return String(text ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function detectReplayChannel(classList) {
    const classes = [...classList].map((c) => c.toUpperCase());
    if (classes.some((c) => c.includes("MEGAPHONE"))) return "MEGAPHONE";
    const chatClass = classes.find((c) => c.endsWith("CHAT") && c !== "CHAT-BUBBLE");
    return chatClass ?? "CHAT";
  }

  function extractReplayJob(imgSrc) {
    const m = String(imgSrc ?? "").match(/jobthumb_([^./?]+)\.(?:png|jpg|jpeg|webp|gif|svg)/i);
    return m ? m[1].toLowerCase() : null;
  }

  function parseReplayHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const winnerEl = doc.querySelector(".team-container.display-flex.center.game-end-type");
    const winningTeam = normalizeReplayText(winnerEl?.textContent) || null;

    const users = [];
    doc.querySelectorAll("#user-table .item").forEach((item, idx) => {
      const nickname = normalizeReplayText(item.querySelector(".nick-name")?.textContent) || null;
      const jobSrc = item.querySelector("img.job-icon-img")?.getAttribute("src");
      const job = extractReplayJob(jobSrc);
      users.push({ number: idx + 1, nickname, job });
    });

    const section = doc.querySelector("section.table");
    if (!section) throw new Error("리플레이 데이터를 찾을 수 없습니다.");

    const logs = [];
    const cultMode = users.some((u) => u.job === "cultleader");

    for (const el of section.children) {
      if (el.classList.contains("system")) {
        const message = normalizeReplayText(el.querySelector("b")?.textContent || el.textContent);
        if (message) logs.push({ type: "system", message });
        continue;
      }

      if (el.classList.contains("chat-data-container")) {
        const nickname = normalizeReplayText(el.querySelector(".nick-name")?.textContent) || null;

        el.querySelectorAll(".chat-bubble").forEach((bubble) => {
          const message = normalizeReplayText(bubble.textContent);
          if (!message) return;
          const channel = detectReplayChannel(bubble.classList);
          logs.push({ type: "chat", channel, nickname, message });
        });
      }
    }

    return { winningTeam, users, logs, cultMode };
  }

  // ── Background에서 오는 진행 단계 메시지 ──
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "PARSE_REPLAY_HTML") {
      try {
        const parsed = parseReplayHtml(msg.html || "");
        sendResponse({ success: true, parsed });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || "리플레이 파싱에 실패했습니다." });
      }
      return true;
    }

    if (msg.type === "ANALYZE_STEP") {
      updateStep(msg.step);
    }

    return false;
  });

  // ── 교주 모드 배지 추가 (Background 응답 후) ──
  function maybeAddCultBadge(isCult) {
    if (!isCult) return;
    const meta = document.getElementById("m42-meta");
    if (meta && !document.getElementById("m42-cult-badge")) {
      const badge = document.createElement("span");
      badge.id = "m42-cult-badge";
      badge.className = "m42-badge m42-badge-cult";
      badge.textContent = "⚠ 교주 게임";
      meta.appendChild(badge);
    }
  }

  // ══════════════════════════════════════════
  //  패널 열기 / 닫기
  // ══════════════════════════════════════════
  function openPanel() {
    panel.classList.add("open");
    overlay.classList.add("visible");
    triggerBtn.classList.add("hidden");
  }

  function closePanel() {
    panel.classList.remove("open");
    overlay.classList.remove("visible");
    triggerBtn.classList.remove("hidden");
  }

  triggerBtn.addEventListener("click", openPanel);
  overlay.addEventListener("click", closePanel);
  document.getElementById("m42-close-btn").addEventListener("click", closePanel);

  // ── 분석 시작 버튼 ────────────────────────
  document.getElementById("m42-analyze-btn").addEventListener("click", async () => {
    const analyzeBtn = document.getElementById("m42-analyze-btn");
    analyzeBtn.disabled = true;
    renderLoading(0);

    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "ANALYZE", url: location.href }, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });

      if (res.cultMode) maybeAddCultBadge(true);

      if (!res.success) {
        res.noKey ? renderNoKey() : renderError(res.error || "알 수 없는 오류");
      } else {
        renderResult(res);
      }
    } catch (err) {
      renderError(err.message);
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  // ── ESC 키로 닫기 ─────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  console.log("[M42 Analyzer] content_script 로드 완료:", location.href);
})();
