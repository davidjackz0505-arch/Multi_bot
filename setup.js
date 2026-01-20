const fs = require("fs");
const path = require("path");
const https = require("https");

const binDir = path.join(__dirname, "bin");
const ytDlpPath = path.join(binDir, "yt-dlp");

// Ensure bin folder exists
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir);
}

// Download URL for Linux (Render uses Linux)
const url =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

console.log("⬇️  Downloading yt-dlp binary for Linux...");

const file = fs.createWriteStream(ytDlpPath);

https
  .get(url, (response) => {
    if (response.statusCode !== 200) {
      console.error(`❌ Failed to download: ${response.statusCode}`);
      process.exit(1);
    }

    response.pipe(file);

    file.on("finish", () => {
      file.close();
      // Make it executable (Critical for Linux/Render)
      fs.chmodSync(ytDlpPath, 0o755);
      console.log("✅ yt-dlp downloaded and made executable!");
    });
  })
  .on("error", (err) => {
    fs.unlink(ytDlpPath, () => {}); // Delete partial file
    console.error("❌ Error downloading:", err.message);
    process.exit(1);
  });
