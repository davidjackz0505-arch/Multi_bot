const axios = require("axios");
const https = require("https");

// 🕵️‍♂️ ANTI-BLOCK: User-Agent Rotator
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
];

const getRandomAgent = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// 🚀 HIGH PERFORMANCE NETWORK AGENT
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: Infinity, // ⚡ Allow unlimited concurrent downloads
  maxFreeSockets: 50,
  timeout: 60000,
});

const client = axios.create({
  httpsAgent,
  timeout: 10000, // ⚡ 10s timeout (Fail fast, retry fast)
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTikTokData(url) {
  let attempts = 0;
  const maxAttempts = 100; // 🔄 RETRY UP TO 100 TIMES

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const apiUrl = `https://tikwm.com/api/?url=${url}&hd=1`;

      if (attempts % 10 === 0)
        console.log(`[Attempt ${attempts}] Fetching Metadata...`);

      const response = await client.get(apiUrl, {
        headers: { "User-Agent": getRandomAgent() },
      });

      if (response.data.code === 0) {
        const data = response.data.data;
        const cover = data.cover;
        const author = data.author ? data.author.nickname : "TikTok User";
        const title = data.title || "Video";

        // 🧠 Smart Quality Select
        let videoUrl = data.hdplay || data.play;
        let sizeBytes = data.hdsize || data.size || 0;

        // Auto-Downgrade if HD is missing or too big (>48MB)
        let sizeMB = parseFloat((sizeBytes / (1024 * 1024)).toFixed(2));
        if (sizeMB > 48) {
          videoUrl = data.play;
        }

        return {
          status: "success",
          videoUrl: videoUrl,
          cover: cover,
          author: author,
          title: title,
          sizeMB: sizeMB,
        };
      }

      await sleep(500); // Wait 0.5s before retry
    } catch (error) {
      if (error.response && error.response.status === 404) break;
      await sleep(500);
    }
  }

  return { status: "error", message: "Server busy. Please try again." };
}

module.exports = { getTikTokData, client };
