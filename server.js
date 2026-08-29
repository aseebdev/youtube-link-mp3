const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const { execFile } = require("child_process");
const util = require("util");

const execFileAsync = util.promisify(execFile);

const app = express();

const PORT = process.env.PORT || 3000;
const publicPath = path.join(__dirname, "public");
const downloadsPath = path.join(__dirname, "downloads");

// ============================================================
// PACKAGES
// ============================================================

const youtubedl = require("youtube-dl-exec");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

// ============================================================
// CROSS-PLATFORM DENO PATH
// ============================================================

const denoExecutable = process.platform === "win32" ? "deno.exe" : "deno";

const denoPath = path.join(
    __dirname,
    "node_modules",
    "deno",
    denoExecutable
);

// ============================================================
// HELPERS
// ============================================================

function fileExists(filePath) {
    return fsp
        .access(filePath, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
}

async function ensureDownloadsFolder() {
    await fsp.mkdir(downloadsPath, { recursive: true });
}

async function cleanupFilesByPrefix(prefix) {
    try {
        const files = await fsp.readdir(downloadsPath);

        await Promise.allSettled(
            files
                .filter((file) => file.startsWith(prefix))
                .map((file) =>
                    fsp.unlink(path.join(downloadsPath, file))
                )
        );
    } catch {
        // Ignore cleanup errors
    }
}

function isYouTubeHost(hostname) {
    const allowedHosts = new Set([
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be"
    ]);

    return allowedHosts.has(hostname.toLowerCase());
}

function getSafeErrorText(error) {
    return String(error?.stderr || error?.message || "").toLowerCase();
}

function logErrorBlock(error) {
    console.error("");
    console.error("========== CONVERSION ERROR ==========");
    console.error("Message:", error?.message || "Unknown error");
    console.error("Name:", error?.name || "Unknown");
    console.error("Code:", error?.code || "Unknown");

    if (error?.stderr) {
        console.error("stderr:", error.stderr);
    }

    if (error?.stdout) {
        console.error("stdout:", error.stdout);
    }

    console.error("======================================");
}

function buildDownloadHeaders(filename) {
    return {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="RR-audioFlux.mp3"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Content-Type-Options": "nosniff"
    };
}

// ============================================================
// STARTUP
// ============================================================

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "10kb"
    })
);

app.use(
    express.static(publicPath, {
        etag: true,
        maxAge: "1h"
    })
);

// ============================================================
// BOOT PREP
// ============================================================

async function boot() {
    await ensureDownloadsFolder();

    console.log("Platform:", process.platform);
    console.log("Architecture:", process.arch);
    console.log("Deno path:", denoPath);
    console.log("Deno exists:", fs.existsSync(denoPath));
    console.log("FFmpeg path:", ffmpegPath);
    console.log("Downloads path:", downloadsPath);

    if (fs.existsSync(denoPath)) {
        try {
            const result = await execFileAsync(denoPath, ["--version"]);
            console.log("Deno warmed up and ready.");
            if (result?.stdout) {
                console.log(result.stdout.trim());
            }
        } catch (error) {
            console.error("Deno warm-up failed:", error.message);
        }
    } else {
        console.error("Deno executable not found at boot:", denoPath);
    }
}

// ============================================================
// CONVERT YOUTUBE VIDEO TO MP3
// ============================================================

app.post("/convert", async (req, res) => {
    const { url } = req.body || {};

    if (!url || typeof url !== "string") {
        return res.status(400).json({
            success: false,
            error: "Please provide a YouTube URL."
        });
    }

    const cleanUrl = url.trim();

    let parsedUrl;
    try {
        parsedUrl = new URL(cleanUrl);
    } catch {
        return res.status(400).json({
            success: false,
            error: "Invalid URL."
        });
    }

    if (!isYouTubeHost(parsedUrl.hostname)) {
        return res.status(400).json({
            success: false,
            error: "Only YouTube URLs are supported."
        });
    }

    if (!fs.existsSync(denoPath)) {
        console.error("Deno executable not found:", denoPath);

        return res.status(500).json({
            success: false,
            error: "Server JavaScript runtime is not available."
        });
    }

    const id = crypto.randomUUID();
    const outputTemplate = path.join(downloadsPath, `${id}.%(ext)s`);
    const mp3File = `${id}.mp3`;
    const mp3Path = path.join(downloadsPath, mp3File);

    console.log("");
    console.log("======================================");
    console.log("Starting conversion");
    console.log("ID:", id);
    console.log("URL:", cleanUrl);
    console.log("Platform:", process.platform);
    console.log("Deno:", denoPath);
    console.log("Deno exists:", fs.existsSync(denoPath));
    console.log("FFmpeg:", ffmpegPath);
    console.log("Output:", mp3Path);
    console.log("======================================");

    const timeLabel = `conversion-${id}`;
    console.time(timeLabel);

    try {
        await youtubedl(cleanUrl, {
            noPlaylist: true,

            // Reliable best-audio selection
            format: "bestaudio/best",

            // Best MP3 quality
            extractAudio: true,
            audioFormat: "mp3",
            audioQuality: "0",

            // Runtime for YouTube JS challenge solving
            jsRuntimes: `deno:${denoPath}`,

            // FFmpeg location
            ffmpegLocation: path.dirname(ffmpegPath),

            // Output
            output: outputTemplate,

            // Render-friendly performance tuning
            concurrentFragments: 8,
            bufferSize: "16K",
            retries: 3,
            retrySleep: 0,
            socketTimeout: 30,

            // Remove unnecessary extra work
            writeThumbnail: false,
            writeInfoJson: false,
            writeDescription: false,
            writeComments: false,
            writeAllThumbnails: false,
            noWarnings: true,
            preferFreeFormats: false,

            // Keep extraction path lean
            noCheckCertificates: false,
            windowsFilenames: false,
            paths: downloadsPath,

            // Cookies if available
            cookies: path.join(__dirname, "cookies.txt"),

            // UA
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0 Safari/537.36"
        });

        console.timeEnd(timeLabel);

        const mp3Exists = await fileExists(mp3Path);

        if (!mp3Exists) {
            console.error("MP3 file was not found.");

            return res.status(500).json({
                success: false,
                error: "Conversion finished, but the MP3 file was not found."
            });
        }

        console.log("SUCCESS:", mp3File);

        return res.json({
            success: true,
            file: "/download/" + encodeURIComponent(mp3File)
        });
    } catch (error) {
        console.timeEnd(timeLabel);
        logErrorBlock(error);
        await cleanupFilesByPrefix(id);

        const errorText = getSafeErrorText(error);

        if (
            errorText.includes("sign in to confirm") ||
            errorText.includes("not a bot") ||
            errorText.includes("confirm you're not a bot") ||
            errorText.includes("video unavailable") ||
            errorText.includes("requested format is not available")
        ) {
            return res.status(503).json({
                success: false,
                error: "YouTube is temporarily blocking this server. Please try again later."
            });
        }

        if (
            errorText.includes("javascript runtime") ||
            errorText.includes("no supported javascript runtime") ||
            errorText.includes("deno")
        ) {
            return res.status(500).json({
                success: false,
                error: "YouTube JavaScript runtime is unavailable on the server."
            });
        }

        if (
            errorText.includes("ffmpeg") ||
            errorText.includes("ffprobe")
        ) {
            return res.status(500).json({
                success: false,
                error: "FFmpeg is unavailable on the server."
            });
        }

        return res.status(500).json({
            success: false,
            error: "Unable to convert this video. Please try another YouTube URL."
        });
    }
});

// ============================================================
// DOWNLOAD MP3
// STREAM DIRECTLY TO USER
// ============================================================

app.get("/download/:filename", async (req, res) => {
    const filename = path.basename(req.params.filename || "");
    const filePath = path.join(downloadsPath, filename);

    if (!filename.endsWith(".mp3") || filename.includes("..")) {
        return res.status(400).send("Invalid file.");
    }

    const exists = await fileExists(filePath);

    if (!exists) {
        return res.status(404).send("File not found.");
    }

    console.log("Sending file:", filename);

    try {
        const stat = await fsp.stat(filePath);

        res.set(buildDownloadHeaders(filename));
        res.set("Content-Length", stat.size);

        const stream = fs.createReadStream(filePath);

        stream.on("error", async (error) => {
            console.error("Stream error:", error.message);

            if (!res.headersSent) {
                res.status(500).send("Download failed.");
            } else {
                res.destroy(error);
            }

            try {
                if (await fileExists(filePath)) {
                    await fsp.unlink(filePath);
                    console.log("Temporary file deleted after stream error:", filename);
                }
            } catch (deleteError) {
                console.error("File cleanup failed:", deleteError.message);
            }
        });

        res.on("finish", async () => {
            try {
                if (await fileExists(filePath)) {
                    await fsp.unlink(filePath);
                    console.log("Temporary file deleted:", filename);
                }
            } catch (deleteError) {
                console.error("File cleanup failed:", deleteError.message);
            }
        });

        stream.pipe(res);
    } catch (error) {
        console.error("Download error:", error.message);

        try {
            if (await fileExists(filePath)) {
                await fsp.unlink(filePath);
                console.log("Temporary file deleted after download failure:", filename);
            }
        } catch (deleteError) {
            console.error("File cleanup failed:", deleteError.message);
        }

        return res.status(500).send("Download failed.");
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
    res.json({
        success: true,
        status: "online"
    });
});

// ============================================================
// START SERVER
// ============================================================

boot()
    .then(() => {
        app.listen(PORT, () => {
            console.log("======================================");
            console.log("Server running on port " + PORT);
            console.log("Project folder:", __dirname);
            console.log("Platform:", process.platform);
            console.log("Architecture:", process.arch);
            console.log("Deno path:", denoPath);
            console.log("Deno exists:", fs.existsSync(denoPath));
            console.log("FFmpeg path:", ffmpegPath);
            console.log("Downloads path:", downloadsPath);
            console.log("======================================");
        });
    })
    .catch((error) => {
        console.error("Fatal boot error:", error.message);
        process.exit(1);
    });
