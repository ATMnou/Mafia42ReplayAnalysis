// ─────────────────────────────────────────────
// Mafia42 Replay Analyzer — options.js
// ─────────────────────────────────────────────

"use strict";

// ── DOM 참조 ────────────────────────────────
const apiKeyInput = document.getElementById("api-key-input");
const toggleMaskBtn = document.getElementById("toggle-mask-btn");
const eyeIcon = document.getElementById("eye-icon");
const modelSelect = document.getElementById("model-select");
const saveBtn = document.getElementById("save-btn");
const keyPreviewWrap = document.getElementById("key-preview-wrap");
const keyPreviewText = document.getElementById("key-preview-text");
const clearKeyBtn = document.getElementById("clear-key-btn");
const keyField = document.getElementById("key-field");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toast-msg");
const toastIcon = document.getElementById("toast-icon");

// ── 아이콘 SVG 조각 ─────────────────────────
const EYE_OPEN = `
  <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
  <circle cx="8" cy="8" r="2"/>
`;
const EYE_SHUT = `
  <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
  <path d="M1 1l14 14" stroke-linecap="round"/>
`;
const ICON_CHECK = `<path d="M2 7l3.5 3.5L13 3"/>`;
const ICON_ERROR = `<path d="M7.5 4v4M7.5 10.5v.5"/><circle cx="7.5" cy="7.5" r="6"/>`;

// ══════════════════════════════════════════════
//  초기화: 저장된 값 불러오기
// ══════════════════════════════════════════════
async function init() {
  const { openrouterKey, selectedModel } = await chrome.storage.sync.get(["openrouterKey", "selectedModel"]);

  if (openrouterKey) {
    showKeyPreview(openrouterKey);
  }

  if (selectedModel) {
    modelSelect.value = selectedModel;
  }
}

// ══════════════════════════════════════════════
//  키 미리보기 표시 / 숨기기
// ══════════════════════════════════════════════
function maskKey(key) {
  if (!key || key.length < 10) return key;
  // "sk-or-v1-xxxx...yyyy" → "sk-or-••••••••••xxxx"
  const prefix = key.slice(0, 6); // "sk-or-"
  const tail = key.slice(-4); // 마지막 4자
  return `${prefix}${"•".repeat(10)}${tail}`;
}

function showKeyPreview(key) {
  keyPreviewText.textContent = maskKey(key);
  keyPreviewWrap.style.display = "block";
  // 키가 있을 땐 입력 필드 placeholder만 변경 (유지)
  apiKeyInput.placeholder = "새 키를 입력하면 덮어씁니다";
  apiKeyInput.value = "";
  setInputState(apiKeyInput, "");
}

function hideKeyPreview() {
  keyPreviewWrap.style.display = "none";
  apiKeyInput.placeholder = "sk-or-v1-...";
  apiKeyInput.value = "";
  setInputState(apiKeyInput, "");
}

// ══════════════════════════════════════════════
//  입력 상태 (valid / error / 기본)
// ══════════════════════════════════════════════
function setInputState(input, state) {
  input.classList.remove("valid", "error");
  if (state) input.classList.add(state);
}

apiKeyInput.addEventListener("input", () => {
  const val = apiKeyInput.value.trim();
  if (!val) {
    setInputState(apiKeyInput, "");
    return;
  }
  // OpenRouter 키 형식: sk-or- 로 시작
  const looks_valid = val.startsWith("sk-or-") && val.length > 20;
  setInputState(apiKeyInput, looks_valid ? "valid" : "error");
});

// ══════════════════════════════════════════════
//  마스크 토글
// ══════════════════════════════════════════════
let masked = true;

toggleMaskBtn.addEventListener("click", () => {
  masked = !masked;
  apiKeyInput.type = masked ? "password" : "text";
  eyeIcon.innerHTML = masked ? EYE_OPEN : EYE_SHUT;
});

// ══════════════════════════════════════════════
//  키 삭제
// ══════════════════════════════════════════════
clearKeyBtn.addEventListener("click", async () => {
  await chrome.storage.sync.remove("openrouterKey");
  hideKeyPreview();
  showToast("API 키가 삭제되었습니다.", "error");
});

// ══════════════════════════════════════════════
//  저장
// ══════════════════════════════════════════════
saveBtn.addEventListener("click", async () => {
  const newKey = apiKeyInput.value.trim();
  const modelValue = modelSelect.value;

  // 새 키가 입력된 경우 유효성 검사
  if (newKey) {
    if (!newKey.startsWith("sk-or-") || newKey.length < 20) {
      setInputState(apiKeyInput, "error");
      showToast("올바른 OpenRouter 키 형식이 아닙니다.", "error");
      apiKeyInput.focus();
      return;
    }
  }

  saveBtn.disabled = true;

  try {
    const toSave = { selectedModel: modelValue };
    if (newKey) toSave.openrouterKey = newKey;

    await chrome.storage.sync.set(toSave);

    // 키 미리보기 갱신
    if (newKey) {
      showKeyPreview(newKey);
      showToast("설정이 저장되었습니다.", "success");
    } else {
      showToast("모델 설정이 저장되었습니다.", "success");
    }
  } catch (err) {
    showToast(`저장 실패: ${err.message}`, "error");
  } finally {
    saveBtn.disabled = false;
  }
});

// ══════════════════════════════════════════════
//  토스트
// ══════════════════════════════════════════════
let toastTimer = null;

function showToast(msg, type = "success") {
  toastMsg.textContent = msg;
  toastIcon.innerHTML = type === "success" ? ICON_CHECK : ICON_ERROR;
  toast.className = `show ${type}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

// ── 시작 ────────────────────────────────────
init();
