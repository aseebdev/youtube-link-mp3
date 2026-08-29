const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");

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

const denoExecutable =
    process.platform === "win32"
        ? "deno.exe"
        : "deno";

const denoPath = path.join(
    __dirname,
    "node_modules",
    "deno",
    denoExecutable
);

// ============================================================
// VERIFY DENO
// ============================================================

console.log("Platform:", process.platform);
console.log("Architecture:", process.arch);
console.log("Deno path:", denoPath);
console.log("Deno exists:", fs.existsSync(denoPath));

// ============================================================
// CREATE DOWNLOAD FOLDER
// ------------------------------------------------------------
// SPEED TIP (do this outside the code, once, on the server):
// Mount this folder as tmpfs (RAM-backed) so every write/read/
// delete during conversion is instant instead of hitting disk:
//
//   sudo mkdir -p /path/to/project/downloads
//   sudo mount -t tmpfs -o size=512M tmpfs /path/to/project/downloads
//
// This alone can shave real time off every single conversion.
// ============================================================

if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, {
        recursive: true
    });
}

// ============================================================
// WARM UP DENO AT BOOT
// ------------------------------------------------------------
// yt-dlp shells out to Deno on every /convert call to solve
// YouTube's JS signature challenge. A cold Deno process adds
// real fixed latency to the FIRST request after boot (OS file
// cache, JIT, etc. all cold). Running one throwaway invocation
// at startup warms that path so real requests don't pay for it.
// ============================================================

if (fs.existsSync(denoPath)) {
    execFile(denoPath, ["--version"], (error) => {
        if (error) {
            console.error("Deno warm-up failed:", error.message);
        } else {
            console.log("Deno warmed up and ready.");
        }
    });
} else {
    console.error("Deno executable not found at boot:", denoPath);
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "10kb"
    })
);

app.use(
    express.static(publicPath, {
        etag: true
    })
);

// ============================================================
// CONVERT YOUTUBE VIDEO TO MP3
// ============================================================

app.post("/convert", async (req, res) => {

    const { url } = req.body;

    // --------------------------------------------------------
    // Validate input
    // --------------------------------------------------------

    if (!url || typeof url !== "string") {
        return res.status(400).json({
            success: false,
            error: "Please provide a YouTube URL."
        });
    }

    const cleanUrl = url.trim();

    // --------------------------------------------------------
    // Validate URL
    // --------------------------------------------------------

    let parsedUrl;

    try {
        parsedUrl = new URL(cleanUrl);
    } catch {
        return res.status(400).json({
            success: false,
            error: "Invalid URL."
        });
    }

    // --------------------------------------------------------
    // Allowed YouTube hosts
    // --------------------------------------------------------

    const allowedHosts = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be"
    ];

    const hostname =
        parsedUrl.hostname.toLowerCase();

    if (!allowedHosts.includes(hostname)) {
        return res.status(400).json({
            success: false,
            error: "Only YouTube URLs are supported."
        });
    }

    // --------------------------------------------------------
    // Check Deno
    // --------------------------------------------------------

    if (!fs.existsSync(denoPath)) {

        console.error(
            "Deno executable not found:",
            denoPath
        );

        return res.status(500).json({
            success: false,
            error:
                "Server JavaScript runtime is not available."
        });
    }

    // --------------------------------------------------------
    // Unique temporary file ID
    // --------------------------------------------------------

    const id = crypto.randomUUID();

    const outputTemplate = path.join(
        downloadsPath,
        id + ".%(ext)s"
    );

    console.log("");
    console.log("======================================");
    console.log("Starting conversion");
    console.log("ID:", id);
    console.log("URL:", cleanUrl);
    console.log("Platform:", process.platform);
    console.log("Deno:", denoPath);
    console.log("Deno exists:", fs.existsSync(denoPath));
    console.log("FFmpeg:", ffmpegPath);
    console.log("======================================");

    const timeLabel = `conversion-${id}`;
    console.time(timeLabel);

    try {

        // ====================================================
        // YT-DLP — MAX SPEED + MAX (LOSSLESS-SOURCE) MP3 QUALITY
        // ====================================================

        await youtubedl(cleanUrl, {

            noPlaylist: true,

            // --------------------------------------------------
            // FORMAT SELECTION
            // --------------------------------------------------
            // "bestaudio*" (no "/best" fallback) guarantees we
            // NEVER silently pull a combined video+audio stream.
            // That fallback was the single biggest hidden speed
            // killer — downloading an entire video just to keep
            // the audio track. Audio-only streams are also
            // smaller, so this is a pure speed win with zero
            // quality trade-off.
            // --------------------------------------------------
            format: "bestaudio*",

            // Highest MP3 quality — untouched, non-negotiable.
            extractAudio: true,
            audioFormat: "mp3",
            audioQuality: "0",

            // JavaScript runtime
            jsRuntimes: `deno:${denoPath}`,

            // FFmpeg
            ffmpegLocation:
                path.dirname(ffmpegPath),

            // Output
            output: outputTemplate,

            // =================================================
            // DOWNLOAD SPEED
            // =================================================

            // Multi-connection segmented downloading via aria2c.
            // Requires aria2c installed on the server:
            //   Debian/Ubuntu: sudo apt install aria2
            //   macOS:         brew install aria2
            // If aria2c is not available, remove these two lines
            // and yt-dlp will fall back to its built-in downloader
            // (still faster than before thanks to the other fixes,
            // just not as fast as aria2c).
            externalDownloader: "aria2c",
            externalDownloaderArgs: "-x 16 -s 16 -k 1M",

            // Download fragmented streams concurrently
            concurrentFragments: 16,

            // No artificial delay between retries
            retries: 3,
            retrySleep: 0,

            // Skip work we don't need — pure overhead removal
            writeThumbnail: false,
            writeInfoJson: false,

            // =================================================
            // COOKIES
            // =================================================

            cookies:
                path.join(
                    __dirname,
                    "cookies.txt"
                ),

            // =================================================
            // USER AGENT
            // =================================================

            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/124.0 Safari/537.36"
        });

        console.timeEnd(timeLabel);

        // ====================================================
        // FIND GENERATED MP3
        // ====================================================

        const mp3File =
            id + ".mp3";

        const mp3Path =
            path.join(
                downloadsPath,
                mp3File
            );

        if (!fs.existsSync(mp3Path)) {

            console.error(
                "MP3 file was not found."
            );

            return res.status(500).json({
                success: false,
                error:
                    "Conversion finished, but the MP3 file was not found."
            });
        }

        console.log(
            "SUCCESS:",
            mp3File
        );

        // ====================================================
        // RETURN DOWNLOAD URL
        // ====================================================

        return res.json({
            success: true,
            file:
                "/download/" +
                encodeURIComponent(mp3File)
        });

    } catch (error) {

        console.timeEnd(timeLabel);

        console.error("");
        console.error(
            "========== CONVERSION ERROR =========="
        );

        console.error(
            "Message:",
            error.message
        );

        console.error(
            "Name:",
            error.name
        );

        console.error(
            "Code:",
            error.code
        );

        if (error.stderr) {
            console.error(
                "stderr:",
                error.stderr
            );
        }

        if (error.stdout) {
            console.error(
                "stdout:",
                error.stdout
            );
        }

        console.error(
            "======================================"
        );

        // ====================================================
        // CLEAN FAILED TEMP FILES
        // ====================================================

        try {

            const files =
                fs.readdirSync(
                    downloadsPath
                );

            for (const file of files) {

                if (file.startsWith(id)) {

                    try {

                        fs.unlinkSync(
                            path.join(
                                downloadsPath,
                                file
                            )
                        );

                    } catch {
                        // Ignore cleanup errors
                    }
                }
            }

        } catch {
            // Ignore cleanup errors
        }

        // ====================================================
        // YOUTUBE BOT ERROR
        // ====================================================

        const errorText =
            (
                error.stderr ||
                error.message ||
                ""
            ).toLowerCase();

        if (
            errorText.includes(
                "sign in to confirm"
            ) ||
            errorText.includes(
                "not a bot"
            )
        ) {

            return res.status(503).json({
                success: false,
                error:
                    "YouTube is temporarily blocking this server. Please try again later."
            });
        }

        // ====================================================
        // JAVASCRIPT RUNTIME ERROR
        // ====================================================

        if (
            errorText.includes(
                "javascript runtime"
            ) ||
            errorText.includes(
                "no supported javascript runtime"
            )
        ) {

            return res.status(500).json({
                success: false,
                error:
                    "YouTube JavaScript runtime is unavailable on the server."
            });
        }

        // ====================================================
        // ARIA2C MISSING ERROR
        // ====================================================

        if (
            errorText.includes("aria2c") &&
            (errorText.includes("not found") ||
             errorText.includes("no such file") ||
             errorText.includes("enoent"))
        ) {

            return res.status(500).json({
                success: false,
                error:
                    "aria2c is not installed on the server. Install it (e.g. 'apt install aria2') or remove the externalDownloader option."
            });
        }

        // ====================================================
        // GENERAL ERROR
        // ====================================================

        return res.status(500).json({
            success: false,
            error:
                "Unable to convert this video. Please try another YouTube URL."
        });
    }
});

// ============================================================
// DOWNLOAD MP3
// STREAM DIRECTLY TO USER
// ============================================================

app.get(
    "/download/:filename",
    (req, res) => {

        const filename =
            path.basename(
                req.params.filename
            );

        const filePath =
            path.join(
                downloadsPath,
                filename
            );

        // ----------------------------------------------------
        // Security check
        // ----------------------------------------------------

        if (
            !filename.endsWith(".mp3") ||
            filename.includes("..")
        ) {

            return res
                .status(400)
                .send("Invalid file.");
        }

        // ----------------------------------------------------
        // File doesn't exist
        // ----------------------------------------------------

        if (!fs.existsSync(filePath)) {

            return res
                .status(404)
                .send("File not found.");
        }

        console.log(
            "Sending file:",
            filename
        );

        // ----------------------------------------------------
        // Stream file directly to browser
        // ----------------------------------------------------

        res.download(
            filePath,
            "RR-audioFlux.mp3",
            {
                maxAge: 0
            },
            (error) => {

                // ------------------------------------------------
                // Delete temporary file
                // ------------------------------------------------

                try {

                    if (
                        fs.existsSync(
                            filePath
                        )
                    ) {

                        fs.unlinkSync(
                            filePath
                        );

                        console.log(
                            "Temporary file deleted:",
                            filename
                        );
                    }

                } catch (deleteError) {

                    console.error(
                        "File cleanup failed:",
                        deleteError.message
                    );
                }

                if (error) {

                    console.error(
                        "Download error:",
                        error.message
                    );
                }
            }
        );
    }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    "/health",
    (req, res) => {

        res.json({
            success: true,
            status: "online"
        });
    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "Server running on port " +
            PORT
        );

        console.log(
            "Project folder:",
            __dirname
        );

        console.log(
            "Platform:",
            process.platform
        );

        console.log(
            "Architecture:",
            process.arch
        );

        console.log(
            "Deno path:",
            denoPath
        );

        console.log(
            "Deno exists:",
            fs.existsSync(denoPath)
        );

        console.log(
            "FFmpeg path:",
            ffmpegPath
        );

        console.log(
            "======================================"
        );
    }
);