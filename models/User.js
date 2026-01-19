const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName: String,
  username: String,
  joinedAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },

  // 📊 DETAILED TRACKING
  downloads: {
    total:     { type: Number, default: 0 },
    tiktok:    { type: Number, default: 0 },
    youtube:   { type: Number, default: 0 },
    facebook:  { type: Number, default: 0 }, // New
    instagram: { type: Number, default: 0 }  // New
  }
});

module.exports = mongoose.model("User", userSchema);