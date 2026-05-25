// ─────────────────────────────────────────────
// Mafia42 Replay Analyzer — background.js
// (Manifest V3 Service Worker)
// ─────────────────────────────────────────────

"use strict";

// ══════════════════════════════════════════════
//  설정
// ══════════════════════════════════════════════

const AWS_ENDPOINTS = {
  kr: (id) => `https://o2zj8uijbj.execute-api.ap-northeast-2.amazonaws.com/GetMafiaChat?id=${id}&lang=kr`,
  en: (id) => `https://lwlexm3imq2lvqcst4kjr6322u0acknn.lambda-url.us-east-1.on.aws/?id=${id}&lang=en`,
  ar: (id) => `https://tmypkh5un3yriyvto7qrbenl7a0jvyje.lambda-url.me-south-1.on.aws/?id=${id}&lang=ar`,
  jp: (id) => `https://uqnenskmsmv4hl3fivzxnqe4ay0fyuke.lambda-url.ap-northeast-1.on.aws/?id=${id}&lang=jp`,
  tw: (id) => `https://aqxjqczzmryk225l25muuwfjai0dkfdq.lambda-url.ap-southeast-1.on.aws/?id=${id}&lang=tw`,
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemma-3-27b-it";

// ══════════════════════════════════════════════
//  메시지 라우터
// ══════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ANALYZE") {
    handleAnalyze(msg.url, sender.tab?.id)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 비동기 응답
  }

  if (msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return false;
  }
});

// ══════════════════════════════════════════════
//  진행 단계 전송 헬퍼
// ══════════════════════════════════════════════

function sendStep(tabId, step) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "ANALYZE_STEP", step }).catch(() => {});
}

// ══════════════════════════════════════════════
//  URL 파싱
// ══════════════════════════════════════════════

/**
 * "https://mafia42.com/history/kr/b915538b..."
 *  → { lang: "kr", roomId: "b915538b..." }
 */
function parseReplayUrl(url) {
  const { pathname } = new URL(url);
  // pathname: /history/kr/<roomId>
  const parts = pathname.split("/").filter(Boolean);
  // parts[0] = "history", parts[1] = lang, parts[2] = roomId
  if (parts.length < 3 || parts[0] !== "history") {
    throw new Error("올바른 마피아42 리플레이 URL이 아닙니다.");
  }
  const lang = parts[1];
  const roomId = parts[2];
  if (!AWS_ENDPOINTS[lang]) {
    throw new Error(`지원하지 않는 언어팩입니다: ${lang}`);
  }
  return { lang, roomId };
}

// ══════════════════════════════════════════════
//  1단계: AWS Lambda에서 리플레이 HTML fetch
// ══════════════════════════════════════════════

async function fetchReplayHtml(lang, roomId) {
  const awsUrl = AWS_ENDPOINTS[lang](roomId);
  const res = await fetch(awsUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`AWS 엔드포인트 오류: HTTP ${res.status}`);
  }
  return res.text();
}

// ══════════════════════════════════════════════
//  2단계: HTML 파싱
//  (MV3 Service Worker에는 DOMParser가 없어 content_script에 위임)
// ══════════════════════════════════════════════

function normalizeText(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * chat-bubble의 클래스 목록에서 채널을 판별
 * - MEGAPHONE 포함 → "MEGAPHONE"
 * - *CHAT으로 끝나는 것 (MAFIACHAT, CHAT 등) → 해당 값
 * - 그 외 → "CHAT"
 */
function detectChannel(classList) {
  const classes = [...classList].map((c) => c.toUpperCase());
  if (classes.some((c) => c.includes("MEGAPHONE"))) return "MEGAPHONE";
  const chatClass = classes.find((c) => c.endsWith("CHAT") && c !== "CHAT-BUBBLE");
  return chatClass ?? "CHAT";
}

/**
 * jobthumb_mafia.png → "mafia"
 */
function extractJob(imgSrc) {
  const m = String(imgSrc ?? "").match(/jobthumb_([^./?]+)\.(?:png|jpg|jpeg|webp|gif|svg)/i);
  return m ? m[1].toLowerCase() : null;
}

function parseReplayDocumentWithDomParser(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // ── 승리팀 ─────────────────────────────────
  const winnerEl = doc.querySelector(".team-container.display-flex.center.game-end-type");
  const winningTeam = normalizeText(winnerEl?.textContent) || null;

  // ── 플레이어 테이블 ─────────────────────────
  // #user-table-container 는 display:none 이지만 DOM은 존재함
  const users = [];
  doc.querySelectorAll("#user-table .item").forEach((item, idx) => {
    const nickname = normalizeText(item.querySelector(".nick-name")?.textContent) || null;
    const jobSrc = item.querySelector("img.job-icon-img")?.getAttribute("src");
    const job = extractJob(jobSrc);
    users.push({ number: idx + 1, nickname, job });
  });

  // ── 채팅/시스템 로그 ──────────────────────
  // section.table 의 직계 자식만 순회 (querySelectorAll은 중첩 포함이라 children 사용)
  const section = doc.querySelector("section.table");
  if (!section) throw new Error("리플레이 데이터를 찾을 수 없습니다.");

  const logs = [];
  const cultMode = users.some((u) => u.job === "cultleader");

  for (const el of section.children) {
    // ── 시스템 메시지 ──
    if (el.classList.contains("system")) {
      const message = normalizeText(el.querySelector("b")?.textContent || el.textContent);
      if (message) logs.push({ type: "system", message });
      continue;
    }

    // ── 채팅 메시지 ──
    if (el.classList.contains("chat-data-container")) {
      const nickname = normalizeText(el.querySelector(".nick-name")?.textContent) || null;

      // 첫 번째 버블 (with-nickname)
      el.querySelectorAll(".chat-bubble").forEach((bubble) => {
        const message = normalizeText(bubble.textContent);
        if (!message) return;
        const channel = detectChannel(bubble.classList);
        logs.push({ type: "chat", channel, nickname, message });
      });
    }
  }

  return { winningTeam, users, logs, cultMode };
}

async function parseReplayDocument(html, tabId) {
  if (typeof DOMParser !== "undefined") {
    return parseReplayDocumentWithDomParser(html);
  }

  if (!tabId) {
    throw new Error("리플레이 파싱에 필요한 탭 정보를 찾지 못했습니다.");
  }

  const response = await new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "PARSE_REPLAY_HTML", html }, (res) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error("리플레이 파싱 채널 연결에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."));
        return;
      }
      resolve(res);
    });
  });

  if (!response?.success || !response.parsed) {
    throw new Error(response?.error || "리플레이 파싱에 실패했습니다.");
  }

  return response.parsed;
}

// ══════════════════════════════════════════════
//  3단계: 로그 → 텍스트 직렬화
// ══════════════════════════════════════════════

function serializeLogs({ winningTeam, users, logs }) {
  let text = "";

  if (winningTeam) text += `[WINNING_TEAM] ${winningTeam}\n\n`;

  for (const entry of logs) {
    if (entry.type === "system") {
      text += `[SYSTEM] ${entry.message}\n`;
    } else if (entry.type === "chat") {
      text += `[${entry.channel}] [${entry.nickname}]: ${entry.message}\n`;
    }
  }

  if (users.length > 0) {
    text += "\n[USER_TABLE]\n";
    for (const u of users) {
      text += `#${u.number} [${u.nickname}] job=${u.job ?? "unknown"}\n`;
    }
  }

  return text;
}

// ══════════════════════════════════════════════
//  4단계: context 파일 로드 (번들 리소스)
// ══════════════════════════════════════════════

async function loadContext(cultMode) {
  const filename = cultMode ? "context_cult.txt" : "context.txt";
  const url = chrome.runtime.getURL(`assets/${filename}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`컨텍스트 파일 로드 실패: ${filename}`);
  return res.text();
}

// ══════════════════════════════════════════════
//  5단계: OpenRouter AI 분석
// ══════════════════════════════════════════════

async function analyzeWithAI(logText, contextText, apiKey) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://mafia42.com",
      "X-Title": "Mafia42 Replay Analyzer",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `You are an expert analyst for Mafia game replays. Analyze the provided chat logs and user information from a Mafia game replay. Identify key events, player interactions, and potential strategies used by the players. Summarize the overall flow of the game, including any notable moments or turning points. Provide insights into player behavior and possible motivations based on the chat content and user data. Keep your analysis concise, factual, and focused on the gameplay aspects without speculation. Output a well-structured summary that captures the essence of the game replay.
Here is the context of the game:\n\n${contextText}
Here are the chat logs and user information:\n\n${logText}
Respond in Korean. Do not include any meta phrases or speculative language.`,
        },
      ],
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("API 키가 유효하지 않습니다.");
    if (res.status === 429) throw new Error("API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.");
    throw new Error(`AI API 오류: HTTP ${res.status} — ${body.slice(0, 120)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI 응답이 비어 있습니다.");
  return text;
}

// ══════════════════════════════════════════════
//  메인 분석 오케스트레이터
// ══════════════════════════════════════════════

async function handleAnalyze(replayUrl, tabId) {
  // ── API 키 확인 ────────────────────────────
  const { openrouterKey } = await chrome.storage.sync.get("openrouterKey");
  if (!openrouterKey) {
    return { success: false, noKey: true, error: "API 키가 설정되지 않았습니다." };
  }

  // ── URL 파싱 ───────────────────────────────
  const { lang, roomId } = parseReplayUrl(replayUrl);

  // ── Step 0: 로그 수집 ──────────────────────
  sendStep(tabId, 0);
  const html = await fetchReplayHtml(lang, roomId);

  // ── Step 1: HTML 파싱 ─────────────────────
  sendStep(tabId, 1);
  const parsed = await parseReplayDocument(html, tabId);
  const { winningTeam, users, cultMode } = parsed;
  const logText = serializeLogs(parsed);

  // ── Step 2: AI 분석 요청 ───────────────────
  sendStep(tabId, 2);
  const contextText = await loadContext(cultMode);
  const analysisText = await analyzeWithAI(logText, contextText, openrouterKey);

  // ── Step 3: 결과 처리 ─────────────────────
  sendStep(tabId, 3);

  return {
    success: true,
    winningTeam,
    users,
    analysisText,
    cultMode,
  };
}
