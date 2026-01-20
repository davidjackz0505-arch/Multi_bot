const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const ffmpegPath = require("ffmpeg-static");

// 🔑 POINT TO THE BINARY FROM SETUP.JS
const YTDLP_PATH = path.join(__dirname, "bin", "yt-dlp");

const client = axios.create({ timeout: 20000 });

// ==========================================
// 🛠️ HELPER: RUN CUSTOM BINARY
// ==========================================
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    // Spawn the manual binary we downloaded
    const process = spawn(YTDLP_PATH, args);

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => (stdout += data.toString()));
    process.stderr.on("data", (data) => (stderr += data.toString()));

    process.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else {
        console.error("YTDLP Error:", stderr);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

// ==========================================
// 📥 UNIVERSAL DOWNLOADER (Video)
// ==========================================
async function fetchVideo(url, outputPath) {
  try {
    console.log(`⚡ Processing Video: ${url}`);

    const args = [
      url,
      "--output",
      outputPath,
      "--ffmpeg-location",
      ffmpegPath,
      "--format",
      "best[ext=mp4]/best", // Force MP4
      "--print-json",
      "--no-warnings",
      "--no-call-home",
      "--no-playlist",
      "--user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];

    const jsonOutput = await runYtDlp(args);
    const info = JSON.parse(jsonOutput);

    return {
      status: "success",
      title: info.title || "Video",
      author: info.uploader || "Creator",
      cover: info.thumbnail || "",
      filePath: outputPath,
    };
  } catch (error) {
    console.error("Video DL Error:", error.message);
    // Fallback for TikTok
    if (url.includes("tiktok")) return fetchTikTokAPI(url, outputPath);
    return { status: "error", message: "Download failed." };
  }
}

// ==========================================
// 🎵 YOUTUBE AUDIO (MP3)
// ==========================================
async function fetchAudio(url, outputBase) {
  // Note: yt-dlp will auto-append .mp3, so we pass the base path
  // We let bot.js handle finding the final file with .mp3 extension

  try {
    console.log(`🎵 Processing Audio: ${url}`);

    const args = [
      url,
      "--output",
      outputBase, // Don't add extension here, yt-dlp does it
      "--ffmpeg-location",
      ffmpegPath,
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--print-json",
      "--no-warnings",
      "--no-playlist",
    ];

    const jsonOutput = await runYtDlp(args);
    const info = JSON.parse(jsonOutput);

    return {
      status: "success",
      title: info.title || "Audio",
      author: info.uploader || "Artist",
      cover: info.thumbnail || "",
      // Return base path; bot.js checks for .mp3
      filePath: outputBase,
    };
  } catch (error) {
    console.error("Audio DL Error:", error.message);
    return { status: "error", message: "Conversion failed." };
  }
}

// ==========================================
// 🛠️ TIKTOK API FALLBACK
// ==========================================
async function fetchTikTokAPI(url, outputPath) {
  try {
    const apiUrl = `https://tikwm.com/api/?url=${url}&hd=1`;
    const response = await client.get(apiUrl);
    if (response.data.code === 0) {
      const data = response.data.data;
      const writer = fs.createWriteStream(outputPath);
      const streamResp = await client({
        url: data.play,
        method: "GET",
        responseType: "stream",
      });
      streamResp.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () =>
          resolve({
            status: "success",
            title: data.title,
            author: data.author.nickname,
            cover: data.cover,
            filePath: outputPath,
          }),
        );
        writer.on("error", reject);
      });
    }
    throw new Error("API Failed");
  } catch (e) {
    return { status: "error", message: "TikTok Download Failed" };
  }
}

// Map universal to video fetcher
const fetchUniversal = fetchVideo;
const fetchTikTok = fetchVideo; // Try engine first, then fallback to API
const fetchYouTubeAudio = fetchAudio;

module.exports = { fetchTikTok, fetchYouTubeAudio, fetchUniversal };
