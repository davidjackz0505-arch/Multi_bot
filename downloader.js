const { exec } = require("yt-dlp-exec");
const fs = require("fs");
const axios = require("axios");
const ffmpegPath = require("ffmpeg-static");

// 🚀 ULTRA FAST CLIENT
const client = axios.create({ timeout: 15000 });

// ==========================================
// ⚡ CORE: SINGLE-PASS DOWNLOADER (Fastest Response)
// ==========================================
// Fetches Metadata AND Downloads in a single command.
async function singlePassDownload(url, outputPath, formatArgs) {
    try {
        console.log(`⚡ Processing: ${url}`);
        const output = await exec(url, {
            output: outputPath,
            ...formatArgs,
            printJson: true,        // Gets metadata while downloading
            noWarnings: true,
            noCallHome: true,
            noPlaylist: true,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ffmpegLocation: ffmpegPath
        });

        const info = JSON.parse(output.stdout);
        
        return {
            status: "success",
            title: info.title || "Media",
            author: info.uploader || "Artist",
            cover: info.thumbnail || "",
            filePath: outputPath
        };
    } catch (error) {
        console.error("DL Error:", error.message);
        return { status: "error", message: "Download failed or restricted." };
    }
}

// ==========================================
// 🎵 YOUTUBE (Auto-Audio / MP3)
// ==========================================
async function fetchYouTubeAudio(url, outputBase) {
    const finalPath = `${outputBase}.mp3`;
    
    // Command flags for Best Audio
    const flags = {
        format: 'bestaudio',
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '0', 
    };

    return singlePassDownload(url, outputBase, flags).then(res => {
        // Fix filename if yt-dlp appended extension automatically
        if (res.status === "success") res.filePath = finalPath;
        return res;
    });
}

// ==========================================
// 🎥 TIKTOK (API + Fallback)
// ==========================================
async function fetchTikTok(url, outputPath) {
    try {
        // 1. Try Fast API first
        const apiUrl = `https://tikwm.com/api/?url=${url}&hd=1`;
        const response = await client.get(apiUrl);

        if (response.data.code === 0) {
            const data = response.data.data;
            const writer = fs.createWriteStream(outputPath);
            
            const stream = await client({ url: data.hdplay || data.play, method: 'GET', responseType: 'stream' });
            stream.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve({
                    status: "success",
                    title: data.title || "TikTok",
                    author: data.author.nickname,
                    cover: data.cover,
                    filePath: outputPath
                }));
                writer.on('error', reject);
            });
        }
        throw new Error("API Limit");
    } catch (e) {
        // 2. Fallback to Engine
        return singlePassDownload(url, outputPath, { format: 'best[ext=mp4]/best' });
    }
}

// ==========================================
// 📥 FACEBOOK / INSTAGRAM
// ==========================================
async function fetchUniversal(url, outputPath) {
    // Force MP4 format for Telegram compatibility
    return singlePassDownload(url, outputPath, { format: 'best[ext=mp4]/best' });
}

module.exports = { fetchTikTok, fetchYouTubeAudio, fetchUniversal };