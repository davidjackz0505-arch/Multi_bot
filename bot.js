const TelegramBot = require("node-telegram-bot-api");
const { BakongKHQR, khqrData } = require("bakong-khqr");
const QRCode = require("qrcode");
const { createCanvas, loadImage } = require("canvas");
const { getTikTokData } = require("./downloader");
const User = require("./models/User");
require("dotenv").config();

// CONFIG
const BAKONG_ACCOUNT = process.env.BAKONG_ACCOUNT_ID;
const MERCHANT_NAME = process.env.MERCHANT_NAME || "Lorn David";
const PAYWAY_LINK = "https://link.payway.com.kh/ABAPAYFB405176Y";

// Global State
const state = { stats: { downloads: 0, total_users: 0 }, userList: [] };

// Helper: Escape Markdown
const escapeMarkdown = (text) =>
  text ? text.replace(/[_*[\]()~>#+=|{}.!-]/g, "\\$&") : "";

// --- 🎨 KHQR CARD GENERATOR ---
async function generateKHQRCard(qrText, name, currencyType) {
  const width = 600,
    height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Red Header
  ctx.fillStyle = "#EE282D";
  ctx.fillRect(0, 0, width, 160);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 80px Arial";
  ctx.textAlign = "center";
  ctx.fillText("KHQR", width / 2, 110);

  // QR
  const qrBuffer = await QRCode.toBuffer(qrText, { width: 450, margin: 1 });
  const qrImage = await loadImage(qrBuffer);
  ctx.drawImage(qrImage, (width - 450) / 2, 220, 450, 450);

  // Text
  ctx.fillStyle = "#000000";
  ctx.font = "bold 35px Arial";
  ctx.fillText(name, width / 2, 730);
  ctx.fillStyle = "#555555";
  ctx.font = "30px Arial";
  ctx.fillText(
    currencyType === khqrData.currency.usd ? "USD ($)" : "KHR (៛)",
    width / 2,
    780
  );

  // Footer
  ctx.fillStyle = "#EE282D";
  ctx.font = "bold 25px Arial";
  ctx.fillText("Powered by Bakong", width / 2, 850);

  return canvas.toBuffer();
}

const setupBot = (token, domain, createTempLink, io) => {
  let bot;
  const bakong = new BakongKHQR();

  // 🚀 CONNECTION LOGIC
  if (domain && !domain.includes("localhost")) {
    console.log(`🌍 CLOUD MODE: Webhook Active`);
    bot = new TelegramBot(token);
    bot.setWebHook(`${domain}/bot${token}`);
  } else {
    console.log("💻 LOCAL MODE: Polling Active");
    bot = new TelegramBot(token, { polling: true });
    bot.deleteWebHook().catch(() => {});
  }

  // --- MENUS ---
  const mainMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💎 Donate Support", callback_data: "menu_donate_select" },
          { text: "📞 Support", url: "https://t.me/LornDavid" },
        ],
      ],
    },
  };

  const currencyMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🇺🇸 USD", callback_data: "donate_final_usd" },
          { text: "🇰🇭 KHR", callback_data: "donate_final_khr" },
        ],
        [{ text: "🔙 Back", callback_data: "cmd_start" }],
      ],
    },
  };

  // --- 📩 MESSAGE HANDLER ---
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    // 1. 👋 WARM WELCOME
    if (text === "/start") {
      const name = escapeMarkdown(msg.from.first_name);
      const welcome = `
👋 **Hello ${name}!**

I am **Nexus**, your professional TikTok Downloader.

✨ **Features:**
• 🚫 No Watermark
• ⚡ Ultra-Fast Speed
• ♾️ Unlimited Downloads
• 📱 HD Quality

👇 **Send me a TikTok link to begin!**
      `;
      bot.sendMessage(chatId, welcome, { parse_mode: "Markdown", ...mainMenu });
      return;
    }

    // 2. 🎬 DOWNLOAD LOGIC (Concurrent)
    if (text.includes("tiktok.com")) {
      // Send a temporary "Processing" message
      const statusMsg = await bot.sendMessage(chatId, "⏳ **Processing...**", {
        parse_mode: "Markdown",
      });

      try {
        const data = await getTikTokData(text);

        if (data.status === "success") {
          // Update status to "Sending"
          await bot.editMessageText("🚀 **Sending Video...**", {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "Markdown",
          });

          bot.sendChatAction(chatId, "upload_video");

          // Send Video
          await bot.sendVideo(chatId, data.videoUrl, {
            caption: `✨ Downloaded by @nodevid_bot`,
          });

          // Clean up: Delete status message
          bot.deleteMessage(chatId, statusMsg.message_id);

          // Update DB stats
          state.stats.downloads++;
          await User.updateOne(
            { telegramId: chatId },
            {
              $inc: { downloads: 1 },
              firstName: msg.from.first_name,
              lastActive: Date.now(),
            },
            { upsert: true }
          );
        } else {
          bot.editMessageText("❌ **Failed.** Link expired or private.", {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "Markdown",
          });
        }
      } catch (err) {
        console.error(err);
        bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
      }
    }
  });

  // --- 🔘 BUTTON HANDLER ---
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === "cmd_start") {
      bot.editMessageText("👋 **Welcome back!** Send a link to download.", {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
        ...mainMenu,
      });
    }

    if (action === "menu_donate_select") {
      bot.editMessageText("💖 **Select Currency:**", {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
        ...currencyMenu,
      });
    }

    if (action.startsWith("donate_final")) {
      const isUSD = action.includes("usd");
      const currency = isUSD ? khqrData.currency.usd : khqrData.currency.khr;
      try {
        const khqr = bakong.generateIndividual({
          bakongAccountID: BAKONG_ACCOUNT,
          merchantName: MERCHANT_NAME,
          merchantCity: "Phnom Penh",
          acquiringBank: "Bakong",
          currency: currency,
          billNumber: `INV-${Date.now().toString().slice(-6)}`,
        });
        if (khqr.status.code === 0) {
          const card = await generateKHQRCard(
            khqr.data.qr,
            MERCHANT_NAME,
            currency
          );
          bot.sendPhoto(chatId, card, {
            caption: `💸 **Donate via ${
              isUSD ? "USD" : "KHR"
            }**\nScan via ABA/Bakong.\n\n🔗 [PayWay Link](${PAYWAY_LINK})`,
            parse_mode: "Markdown",
          });
        }
      } catch (e) {
        bot.sendMessage(chatId, "❌ Error generating QR");
      }
    }
    bot.answerCallbackQuery(query.id);
  });

  return bot;
};

module.exports = { setupBot, state };
