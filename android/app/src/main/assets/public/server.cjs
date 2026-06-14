var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var geminiClient = null;
function getGeminiClient() {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is missing. Please set it in the Secrets panel.");
    }
    geminiClient = new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return geminiClient;
}
app.post("/api/generate-lyrics", async (req, res) => {
  const { title, artist, album } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Missing song 'title' in request body." });
  }
  try {
    const ai = getGeminiClient();
    const prompt = `Write a beautiful, creative, and evocative song lyric matching the mood and title of this song:
Song: "${title}" by ${artist || "Unknown Artist"} (from the album "${album || "Single"}").
Ensure the lyrics contain a nice structure (Verse 1, Chorus, Verse 2, Chorus, Bridge, Outro).
Keep it clean, poetical, and appropriate.
Do not output any introductory or concluding speech, just output the formatted lyrics themselves directly.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt
    });
    const text = response.text;
    if (!text) {
      throw new Error("Received empty response from lyrics parser model.");
    }
    return res.json({ lyrics: text.trim() });
  } catch (error) {
    console.error("Error generating lyrics:", error);
    return res.status(500).json({
      error: "Failed to generate lyrics. Verify internet connection.",
      details: error.message
    });
  }
});
var INVIDIOUS_INSTANCES = [
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://inv.vern.cc",
  "https://invidious.privacydev.net",
  "https://invidious.projectsegfau.lt",
  "https://iv.ggtyler.dev"
];
async function searchYoutube(query) {
  const cleanedQuery = query.replace(/[^\w\s-]/g, "").trim();
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Searching Youtube for "${cleanedQuery}" using: ${instance}`);
      const searchUrl = `${instance}/api/v1/search?q=${encodeURIComponent(cleanedQuery)}&type=video`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(6e3) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const video = data.find((item) => item.type === "video");
        if (video && video.videoId) {
          return video.videoId;
        }
      }
    } catch (e) {
      console.error(`Invidious search failed for instance ${instance}:`, e);
    }
  }
  return null;
}
async function getAudioStreamUrl(videoId) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Fetching adaptive formats for video ${videoId} using: ${instance}`);
      const videoUrl = `${instance}/api/v1/videos/${videoId}`;
      const res = await fetch(videoUrl, { signal: AbortSignal.timeout(6e3) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.adaptiveFormats) {
        const audioFormats = data.adaptiveFormats.filter((f) => f.type && f.type.startsWith("audio/"));
        if (audioFormats.length > 0) {
          audioFormats.sort((a, b) => {
            const brA = parseInt(a.bitrate) || 0;
            const brB = parseInt(b.bitrate) || 0;
            return brB - brA;
          });
          const bestFormat = audioFormats[0];
          if (bestFormat.url) {
            return {
              url: bestFormat.url,
              mimeType: bestFormat.type.split(";")[0] || "audio/mp4"
            };
          }
        }
      }
    } catch (e) {
      console.error(`Invidious format fetch failed for instance ${instance}:`, e);
    }
  }
  return null;
}
app.post("/api/collect-song-metadata", async (req, res) => {
  const { filename } = req.body;
  if (!filename || typeof filename !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'filename' in request body." });
  }
  try {
    const ai = getGeminiClient();
    const prompt = `You are a high-fidelity music metadata resolver.
Analyze the local file name: "${filename}".
1. Extract or search for the accurate, official Song Title, Artist name, and Album title.
2. Search and fetch the authentic, official, complete lyrics of this song.
Ensure the output is formatted precisely in JSON format matching the schema rules requested.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            title: { type: import_genai.Type.STRING, description: "Official Song Title" },
            artist: { type: import_genai.Type.STRING, description: "Official Artist/Band Name" },
            album: { type: import_genai.Type.STRING, description: "Official Album name the song is from" },
            lyrics: { type: import_genai.Type.STRING, description: "Authentic full lyrics of the song with linebreaks" },
            imagePrompt: { type: import_genai.Type.STRING, description: "A beautiful, evocative, text-free 1-sentence prompt for generating modern CD album cover artwork matching this song's vibe and genre" }
          },
          required: ["title", "artist", "album", "lyrics", "imagePrompt"]
        }
      }
    });
    const text = response.text;
    if (!text) {
      throw new Error("Received empty response from music search model.");
    }
    const { title, artist, album, lyrics, imagePrompt } = JSON.parse(text);
    let coverUrl = "";
    try {
      console.log(`Generating CD Artwork for "${title}" using prompt: ${imagePrompt}`);
      const imgResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: `A professional, beautiful, minimal CD album art front cover with no text or words, graphic art illustration style, square aspect ratio, matching: ${imagePrompt}` }]
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });
      const part = imgResponse.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (part?.inlineData?.data) {
        coverUrl = `data:image/png;base64,${part.inlineData.data}`;
      }
    } catch (imgError) {
      console.error("AI Cover Art generation failed or quota exceeded. Will fallback to Canvas artwork in client:", imgError);
    }
    return res.json({
      title: title || filename.replace(/\.[^/.]+$/, ""),
      artist: artist || "Unknown Artist",
      album: album || "Single",
      lyrics: lyrics || "No lyrics found.",
      coverUrl: coverUrl || null
    });
  } catch (error) {
    console.error("Error collecting metadata:", error);
    return res.status(500).json({
      error: "Failed to automatically collect song metadata from filename.",
      details: error.message
    });
  }
});
app.post("/api/download-yt-audio", async (req, res) => {
  const { title, artist } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Missing 'title' in request body." });
  }
  try {
    const query = `${title} ${artist || ""}`.trim();
    const videoId = await searchYoutube(query);
    if (!videoId) {
      return res.status(404).json({ error: "Song could not be located on YouTube." });
    }
    const streamInfo = await getAudioStreamUrl(videoId);
    if (!streamInfo) {
      return res.status(404).json({ error: "Highest quality audio stream not found." });
    }
    console.log(`Downloading direct audio stream from URL`);
    const audioRes = await fetch(streamInfo.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
      }
    });
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio. Native status: ${audioRes.status}`);
    }
    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.setHeader("Content-Type", streamInfo.mimeType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `attachment; filename="output.bin"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error downloading YouTube audio stream:", error);
    return res.status(500).json({
      error: "YouTube audio stream retrieval failure.",
      details: error.message
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
