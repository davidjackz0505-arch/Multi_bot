const fs = require("fs");
const path = require("path");
const https = require("https");

const binDir = path.join(__dirname, "bin");
const ytDlpPath = path.join(binDir, "yt-dlp");

// Ensure bin folder exists
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir);
}

// 🔗 Function to download with Redirect Handling
const downloadFile = (url, destination) => {
  console.log(`⬇️  Fetching: ${url}`);

  https
    .get(url, (response) => {
      // 🔄 Handle Redirects (302 / 301)
      if (response.statusCode === 302 || response.statusCode === 301) {
        const newUrl = response.headers.location;
        console.log(`➡️  Redirecting to: ${newUrl}`);
        return downloadFile(newUrl, destination);
      }

      // ❌ Handle Errors
      if (response.statusCode !== 200) {
        console.error(
          `❌ Download failed. Status Code: ${response.statusCode}`,
        );
        if (response.statusCode === 403)
          console.error("⚠️  Rate limited by GitHub or Access Denied.");
        process.exit(1);
      }

      // ✅ Download File
      const file = fs.createWriteStream(destination);
      response.pipe(file);

      file.on("finish", () => {
        file.close();
        // Make executable
        fs.chmodSync(destination, 0o755);
        console.log("✅ yt-dlp installed successfully!");
      });
    })
    .on("error", (err) => {
      fs.unlink(destination, () => {});
      console.error("❌ Network Error:", err.message);
      process.exit(1);
    });
};

// Start Download
const downloadUrl =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
downloadFile(downloadUrl, ytDlpPath);
