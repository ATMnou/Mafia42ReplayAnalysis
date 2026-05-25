import axios from "axios";
import * as cheerio from "cheerio";
import { OpenAI } from "openai/client.js";
import fs from "fs";
import dotenv from "dotenv";
import { log } from "console";

dotenv.config();

// 설정
const mafiaUrl = "https://mafia42.com/history/kr/ef95e750b13de4e1bcf8132e33d84b16"; // readline 귀찮음

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

function normalizeText(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectChatChannel(className) {
  const classes = String(className ?? "")
    .split(/\s+/)
    .filter(Boolean);

  const megaphoneToken = classes.find((token) => token.toUpperCase().includes("MEGAPHONE"));
  if (megaphoneToken) {
    return "MEGAPHONE";
  }

  const channel = classes.find((token) => token.toUpperCase().endsWith("CHAT") && token.toLowerCase() !== "chat-bubble");

  return channel ? channel.toUpperCase() : "CHAT";
}

function extractJobFromIconSrc(iconSrc) {
  const src = String(iconSrc ?? "");
  const match = src.match(/jobthumb_([^./?]+)\.(?:png|jpg|jpeg|webp|gif|svg)/i);
  return match ? match[1].toLowerCase() : null;
}

function extractUsersFromUserTable($) {
  const users = [];

  $("#user-table-container #user-table .item").each((index, itemEl) => {
    const $item = $(itemEl);
    const nickname = normalizeText($item.find(".nick-name").first().text()) || null;
    const jobIconSrc = $item.find("img.job-icon-img").first().attr("src");
    const job = extractJobFromIconSrc(jobIconSrc);

    users.push({
      number: index + 1,
      nickname,
      job,
    });
  });

  return users;
}

function extractWinningTeam($) {
  const winnerText = normalizeText($(".team-container.display-flex.center.game-end-type").first().text());
  return winnerText || null;
}

function extractReplayLogs($) {
  const logs = [];
  const chatLogs = [];
  const systemLogs = [];
  const users = extractUsersFromUserTable($);
  const winningTeam = extractWinningTeam($);

  const timelineItems = $("section.table").first().children(".system, .chat-data-container");

  timelineItems.each((_, element) => {
    const $item = $(element);

    if ($item.hasClass("system")) {
      const message = normalizeText($item.find("b").first().text() || $item.text());
      if (!message) return;

      const entry = {
        type: "system",
        message,
      };

      logs.push(entry);
      systemLogs.push(entry);
      return;
    }

    const nickname = normalizeText($item.find(".nick-name").first().text()) || null;
    const bubbles = $item.find(".chat-bubble");

    bubbles.each((__, bubbleEl) => {
      const $bubble = $(bubbleEl);
      const message = normalizeText($bubble.text());
      if (!message) return;

      const entry = {
        type: "chat",
        channel: detectChatChannel($bubble.attr("class")),
        nickname,
        message,
      };

      logs.push(entry);
      chatLogs.push(entry);
    });
  });

  return { logs, chatLogs, systemLogs, users, winningTeam };
}

async function fetchMafiaChatHistory(shareUrl) {
  try {
    const urlObj = new URL(shareUrl);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);

    const lang = pathParts[1];
    const roomId = pathParts[2];

    if (!roomId || !lang) {
      throw new Error("올바른 마피아42 리플레이 URL 형식이 아닙니다.");
    }

    let targetAwsUrl = "";
    if (lang === "kr") {
      targetAwsUrl = `https://o2zj8uijbj.execute-api.ap-northeast-2.amazonaws.com/GetMafiaChat?id=${roomId}&lang=${lang}`;
    } else if (lang === "en") {
      targetAwsUrl = `https://lwlexm3imq2lvqcst4kjr6322u0acknn.lambda-url.us-east-1.on.aws/?id=${roomId}&lang=${lang}`;
    } else {
      throw new Error(`지원하지 않거나 처리가 필요한 언어팩입니다: ${lang}`);
    }

    const response = await axios.get(targetAwsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const realHtmlBody = response.data;

    const $ = cheerio.load(realHtmlBody);
    const { logs, chatLogs, systemLogs, users, winningTeam } = extractReplayLogs($);

    return {
      success: true,
      logs,
      users,
      winningTeam,
    };
  } catch (error) {
    console.error("크롤링 중 에러가 발생했습니다:", error.message);
    return { success: false, error: error.message };
  }
}

const result = await fetchMafiaChatHistory(mafiaUrl);

let logtext = "";
let cultmode = false;
if (result.success) {
  console.log("크롤링 성공!");

  if (result.winningTeam) {
    logtext += `[WINNING_TEAM] ${result.winningTeam}\n\n`;
  }

  result.logs.forEach((entry) => {
    if (entry.type === "system") {
      logtext += `[SYSTEM] ${entry.message}\n`;
    } else if (entry.type === "chat") {
      logtext += `[${entry.channel}] [${entry.nickname}]: ${entry.message}\n`;
    } else {
      logtext += `[UNKNOWN] ${entry.message}\n`;
    }
  });

  if (Array.isArray(result.users) && result.users.length > 0) {
    logtext += "\n[USER_TABLE]\n";
    result.users.forEach((user) => {
      logtext += `#${user.number} [${user.nickname}] job=${user.job ?? "unknown"}\n`;
      if (user.job === "cultleader") {
        cultmode = true;
      }
    });
  }
  // console.log(logtext);
  console.log("로그 텍스트를 성공적으로 생성했습니다. 분석을 시작합니다...");

  // 모델 수정시 경고: Context가 매우 길기 때문에 비용을 고려해야 하지만, 파라미터가 너무 낮은 모델은 오히려 분석 품질이 떨어질 수 있습니다. 모델 선택에 신중을 기하세요.

  let contextText; // 컨텍스트 텍스트는 폴더에 포함됨

  if (cultmode) {
    const cultContextFilePath = "./context_cult.txt"; // 교주 모드 지원을 위한 확장된 컨텍스트 파일 (16,244자)
    contextText = fs.readFileSync(cultContextFilePath, "utf-8");
  } else {
    const contextFilePath = "./context.txt"; // 8인(랭크 게임) 최적화 컨텍스트 파일 (15,103자)
    contextText = fs.readFileSync(contextFilePath, "utf-8");
  }

  const response = await client.chat.completions.create({
    model: "google/gemma-4-26b-a4b-it",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an expert analyst for Mafia game replays. Analyze the provided chat logs and user information from a Mafia game replay. Identify key events, player interactions, and potential strategies used by the players. Summarize the overall flow of the game, including any notable moments or turning points. Provide insights into player behavior and possible motivations based on the chat content and user data. Keep your analysis concise, factual, and focused on the gameplay aspects without speculation. Output a well-structured summary that captures the essence of the game replay.
            Here is the context of the game replay:\n\n${contextText}
            Here are the chat logs and user information:\n\n${logtext}
            Respond with Korean language. Do not include any meta phrases or speculative language in your analysis.`,
          },
        ],
      },
    ],
  });

  console.log("AI 분석 결과:");
  console.log(response.choices[0].message.content);
}
