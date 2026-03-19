import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(process.cwd(), "config.json");

// Initial config
const DEFAULT_CONFIG = {
  api: {
    llm: {
      url: "https://api.ricoxueai.cn",
      key: "sk-QSAF0CDwfedw1CqbiO3Aqfih22K6zYfmvlPVv3ohuYbIDqNm",
      model: "gemini-3.1-flash-lite-preview"
    },
    image: {
      url: "https://api.ricoxueai.cn",
      key: "sk-QSAF0CDwfedw1CqbiO3Aqfih22K6zYfmvlPVv3ohuYbIDqNm",
      model: "dall-e-3"
    }
  },
  step2: {
    title: "产品信息提取",
    prompt: "请详细提取这张狗粮包装正面图上的所有文字和产品信息，包括品牌、口味、主要成分、适用犬种、重量等。输出为结构化的 Markdown。",
  },
  step3: {
    title: "产品细节角色卡",
    prompt: "已经上传了图片的正面、侧面、背面，和宠粮的细节图，最终生成一张图内包含包装的长宽高和，正面、侧面、背面和粮的细节，和提炼一下提供的包装文字信息，展示买点。\n\n产品信息: {{extractedInfo}}\n包装尺寸: 长{{length}}cm, 宽{{width}}cm, 厚{{thickness}}cm\n颗粒特征: {{kibbleTraits}}",
  },
  step4: {
    title: "广告文案生成",
    styles: [
      { id: 'minimal', label: '极简', desc: '纯粹、高端、留白', prompt: '极简风格：侧重于纯粹、高端、留白感，文字精炼。' },
      { id: 'emotional', label: '情感', desc: '温馨、羁绊、有温度', prompt: '情感风格：侧重于宠物与主人的羁绊，温馨、感人、有温度。' },
      { id: 'scientific', label: '科学', desc: '专业、营养、健康', prompt: '科学风格：侧重于营养成分、研发背景、专业数据、健康保障。' },
      { id: 'adventurous', label: '活力', desc: '户外、快乐、运动', prompt: '活力风格：侧重于户外、运动、狗狗的活力与快乐。' }
    ],
    durations: [
      { id: '15s', label: '15秒', value: '15秒短视频文案' },
      { id: '30s', label: '30秒', value: '30秒标准视频文案' },
      { id: '60s', label: '60秒', value: '60秒深度视频文案' }
    ]
  },
  step5: {
    title: "分镜图生成",
    activeGrid: "12",
    grids: {
      "6": { label: "6宫格提示词", desc: "2行3列布局", prompt: "### **系统引导词：【分镜图生成专家】**\n\n**身份设定：** 您是一位资深广告创意总监兼分镜图艺术家...\n\n1. **布局：** 严格遵循参考图片的网格结构，生成一张**6分镜图**（通常为 2行 x 3列）。\n2. **风格：** 彩色写实风格，16:9 比例。" },
      "9": { label: "9宫格提示词", desc: "3行3列布局", prompt: "### **系统引导词：【分镜图生成专家】**\n\n**身份设定：** 您是一位资深广告创意总监兼分镜图艺术家...\n\n1. **布局：** 严格遵循参考图片的网格结构，生成一张**9分镜图**（通常为 3行 x 3列）。\n2. **风格：** 彩色写实风格，16:9 比例。" },
      "12": { label: "12宫格提示词", desc: "3行4列布局", prompt: "### **系统引导词：【分镜图生成专家】**\n\n**身份设定：** 您是一位资深广告创意总监兼分镜图艺术家...\n\n1. **布局：** 严格遵循参考图片的网格结构，生成一张**12分镜图**（通常为 3行 x 4列）。\n2. **风格：** 必须模仿参考图片的视觉风格：\n    * **画风：** 高对比度、电影感/漫画感的**彩色写实风格** (Full Color Realistic Style)。\n    * **色彩：** 鲜艳、生动、具有电影质感。\n    * **比例：** 16:9。" }
    },
    visualStyle: "Full Color Realistic",
    composition: "test"
  }
};

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Login
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === "admin123") {
      res.json({ success: true, token: "fake-jwt-token" });
    } else {
      res.status(401).json({ success: false, message: "账号或密码错误" });
    }
  });

  // API: Get Config
  app.get("/api/config", (req, res) => {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    res.json(config);
  });

  // API: Update Config
  app.post("/api/config", (req, res) => {
    const config = req.body;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
