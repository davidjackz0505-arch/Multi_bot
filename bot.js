const TelegramBot = require("node-telegram-bot-api");
const { BakongKHQR, khqrData } = require("bakong-khqr");
const QRCode = require("qrcode");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { fetchTikTok, fetchYouTubeAudio, fetchUniversal } = require("./downloader");
const User = require("./models/User");
require("dotenv").config();

// CONFIG
const BAKONG_ACCOUNT = process.env.BAKONG_ACCOUNT_ID;
const MERCHANT_NAME = process.env.MERCHANT_NAME || "Lorn David";
const PAYWAY_LINK = "https://link.payway.com.kh/ABAPAYFB405176Y";
const GITHUB_LINK = "https://github.com/lorndavid/botdownloadtiktok";

// TEMP FOLDER
const TEMP_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const state = { stats: { downloads: 0, total_users: 0 }, userList: [] };
const escapeHTML = (text) => text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "Media";

// --- KHQR ---
async function generateKHQRCard(qrText, name, currencyType) {
  const width = 600, height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  // Modern Gradient Background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#EE282D");
  gradient.addColorStop(1, "#B91C21");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, 180);
  
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 180, width, height - 180);

  ctx.fillStyle = "#ffffff"; 
  ctx.font = "bold 80px sans-serif"; 
  ctx.textAlign = "center"; 
  ctx.fillText("KHQR", width / 2, 120);
  
  const qrBuffer = await QRCode.toBuffer(qrText, { width: 450, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
  const qrImage = await loadImage(qrBuffer);
  ctx.drawImage(qrImage, (width - 450) / 2, 240, 450, 450);
  
  ctx.fillStyle = "#1a1a1a"; ctx.font = "bold 35px sans-serif"; ctx.fillText(name, width / 2, 750);
  ctx.fillStyle = "#666666"; ctx.font = "30px sans-serif";
  ctx.fillText(currencyType === khqrData.currency.usd ? "USD ($)" : "KHR (៛)", width / 2, 800);
  ctx.fillStyle = "#EE282D"; ctx.font = "bold 25px sans-serif"; ctx.fillText("Powered by Bakong", width / 2, 870);
  return canvas.toBuffer();
}

const setupBot = (token, domain, createTempLink, io) => {
  let bot;
  const bakong = new BakongKHQR();

  if (domain && !domain.includes("localhost")) {
    console.log(`🌍 CLOUD MODE: Webhook Active`);
    bot = new TelegramBot(token);
    bot.setWebHook(`${domain}/bot${token}`);
  } else {
    console.log("💻 LOCAL MODE: Polling Active");
    bot = new TelegramBot(token, { polling: true });
    bot.deleteWebHook().catch(() => {});
  }

  bot.setMyCommands([
    { command: "start", description: "🏠 Home" },
    { command: "help", description: "❓ Guide" },
    { command: "source", description: "👨‍💻 Code" },
    { command: "contact", description: "📞 Support" }
  ]);

  // --- MODERN MENUS ---
  const mainMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💎 Donate", callback_data: "menu_donate" },
          { text: "📞 Support", url: "https://t.me/Tutuvid" }
        ],
        [
            { text: "👨‍💻 Open Source Code", url: GITHUB_LINK }
        ]
      ]
    }
  };

  const backMenu = { reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "cmd_start" }]] } };
  
  // --- MESSAGE HANDLER ---
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // 🔗 1. DEEP LINKING SUPPORT
    if (text.startsWith("/start")) {
        const args = text.split(" ");
        if (args.length > 1 && args[1].startsWith("http")) {
            processLink(chatId, args[1], msg.from.first_name);
            return;
        }
        
        const name = escapeHTML(msg.from.first_name);
        const welcome = `
<b>Hey ${name}!</b> 👋

I am <b>Nexus</b>, your premium media assistant.
Paste a link, and I'll handle the rest.

🔥 <b>Supported:</b>
• <b>YouTube</b> → Auto MP3 🎵
• <b>TikTok</b> → No Watermark 🎬
• <b>Reels</b> → FB & Instagram 📸
        `;
        bot.sendMessage(chatId, welcome, { parse_mode: "HTML", ...mainMenu });
        return;
    }

    if (text === "/help") return bot.sendMessage(chatId, "📌 <b>Simple Guide:</b>\n\nJust <b>Paste a Link</b>.\nI will auto-detect the best format for you.", { parse_mode: "HTML", ...backMenu });
    if (text === "/contact") return bot.sendMessage(chatId, "📞 <b>Support:</b> @Tutuvid", { parse_mode: "HTML" });
    if (text === "/source") return bot.sendMessage(chatId, `👨‍💻 <a href="${GITHUB_LINK}">View Source Code</a>`, { parse_mode: "HTML" });

    // 2. AUTO DETECT LINK
    if (text.startsWith("http")) {
        processLink(chatId, text, msg.from.first_name);
    }
  });

  // --- 🚀 FAST PROCESSOR ---
  async function processLink(chatId, url, firstName) {
    let platform = "other";
    let isAudio = false;

    // 🧠 Auto-Audio Detection for YouTube (Your Request)
    if (url.match(/youtube\.com|youtu\.be/)) { 
        platform = "youtube"; 
        isAudio = true; 
    } 
    else if (url.includes("tiktok")) platform = "tiktok";
    else if (url.includes("instagram")) platform = "instagram";
    else if (url.includes("facebook") || url.includes("fb.watch")) platform = "facebook";

    // 1. Initial Status
    const msg = await bot.sendMessage(chatId, `🔎 <b>Analyzing Link...</b>`, { parse_mode: "HTML" });

    // 2. Prepare Paths
    const uniqueId = uuidv4();
    const basePath = path.join(TEMP_DIR, uniqueId);
    let finalPath = basePath + (isAudio ? ".mp3" : ".mp4");

    try {
        let data;
        
        // Update Status to Downloading
        // Note: We don't await this edit to keep things fast, just fire and forget
        bot.editMessageText(`⬇️ <b>Downloading...</b>`, { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML" }).catch(()=>{});

        // 3. EXECUTE DOWNLOADER
        if (isAudio) {
            data = await fetchYouTubeAudio(url, basePath);
            if (!fs.existsSync(finalPath) && fs.existsSync(basePath + ".mp3")) finalPath = basePath + ".mp3";
        } else if (platform === "tiktok") {
            data = await fetchTikTok(url, finalPath);
        } else {
            data = await fetchUniversal(url, finalPath);
        }

        // 4. UPLOAD
        if (data.status === "success" && fs.existsSync(finalPath)) {
            await bot.editMessageText(`📤 <b>Uploading...</b>`, { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML" });
            bot.sendChatAction(chatId, isAudio ? "upload_voice" : "upload_video");

            const caption = `<b>${escapeHTML(data.title)}</b>\n────────────────\n👤 <i>${escapeHTML(data.author)}</i>\n🤖 <i>via @nodevid_bot</i>`;

            if (isAudio) {
                await bot.sendAudio(chatId, finalPath, {
                    caption: caption, parse_mode: "HTML",
                    title: data.title, performer: data.author, thumbnail: data.cover
                });
            } else {
                await bot.sendVideo(chatId, finalPath, { 
                    caption: caption, parse_mode: "HTML",
                    width: 720, height: 1280 
                });
            }

            // Cleanup
            bot.deleteMessage(chatId, msg.message_id);
            updateStats(chatId, firstName, platform);
            
        } else {
            bot.editMessageText(`❌ <b>Failed.</b>\n<i>${data.message || "Invalid Link"}</i>`, { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML" });
        }
    } catch (e) {
        console.error(e);
        bot.deleteMessage(chatId, msg.message_id).catch(()=>{});
        bot.sendMessage(chatId, "❌ <b>Server Busy.</b> Try again later.", {parse_mode: "HTML"});
    } finally {
        // 🧹 Aggressive Cleanup
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (fs.existsSync(basePath)) fs.unlinkSync(basePath);
        if (fs.existsSync(basePath + ".mp3")) fs.unlinkSync(basePath + ".mp3");
    }
  }

  async function updateStats(chatId, name, platform) {
      state.stats.downloads++;
      const inc = { "downloads.total": 1 };
      if (platform !== "other") inc[`downloads.${platform}`] = 1;
      await User.updateOne({ telegramId: chatId }, { $set: { lastActive: Date.now(), firstName: name }, $inc: inc }, { upsert: true });
  }

  // --- BUTTONS ---
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === "cmd_start") bot.editMessageText(`👋 <b>Welcome back!</b>\nPaste a link to start.`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: "HTML", ...mainMenu });
    
    // Donate
    if (action === "menu_donate") {
        const currency = khqrData.currency.usd;
        try {
            const khqr = bakong.generateIndividual({ bakongAccountID: BAKONG_ACCOUNT, merchantName: MERCHANT_NAME, merchantCity: "PP", acquiringBank: "Bakong", currency, billNumber: `INV-${Date.now().toString().slice(-6)}` });
            if (khqr.status.code === 0) {
                const card = await generateKHQRCard(khqr.data.qr, MERCHANT_NAME, currency);
                bot.sendPhoto(chatId, card, { caption: `💸 <b>Donate Support</b>\nScan with ABA/Bakong to support the server!`, parse_mode: "HTML" }, { filename: 'donate.png' });
            }
        } catch (e) { bot.answerCallbackQuery(query.id, { text: "Error generating QR", show_alert: true }); }
    }
    bot.answerCallbackQuery(query.id);
  });
  return bot;
};

module.exports = { setupBot, state };