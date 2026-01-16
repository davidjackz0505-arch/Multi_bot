process.env.UV_THREADPOOL_SIZE = 128; // 🚀 MAX POWER

require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const path = require("path");
const compression = require("compression");
const { setupBot, state } = require("./bot");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// DB
mongoose
  .connect(process.env.MONGO_URI, { maxPoolSize: 100 })
  .then(() => console.log("✅ DB Connected"))
  .catch((e) => console.log("❌ DB Error", e));

app.use(compression());
app.use(bodyParser.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

const TOKEN = process.env.TELEGRAM_TOKEN;
const DOMAIN =
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${process.env.PORT || 3000}`;
const PORT = process.env.PORT || 3000;

// Bot
const bot = setupBot(TOKEN, DOMAIN, null, io);

// Dashboard
app.get("/", async (req, res) => {
  try {
    const [totalUsers, downloads, users, chartRaw] = await Promise.all([
      User.countDocuments(),
      User.aggregate([
        { $group: { _id: null, total: { $sum: "$downloads" } } },
      ]),
      User.find().sort({ lastActive: -1 }).limit(10).lean(),
      User.aggregate([
        { $match: { joinedAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$joinedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.render("dashboard", {
      stats: {
        downloads: downloads[0]?.total || 0,
        total_users: totalUsers,
        active_now: state.userList.length,
      },
      chartData: {
        labels: chartRaw.map((d) => d._id),
        values: chartRaw.map((d) => d.count),
      },
      users: state.userList,
      dbUsers: users,
      uptime: process.uptime(),
    });
  } catch (e) {
    res.render("dashboard", {
      stats: { downloads: 0, total_users: 0, active_now: 0 },
      chartData: { labels: [], values: [] },
      users: [],
      dbUsers: [],
      uptime: 0,
    });
  }
});

// Webhook
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Crash Guard
process.on("uncaughtException", (e) => console.error("🚨 Uncaught:", e));

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
