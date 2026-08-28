const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

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
// ============================================================

if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, {
        recursive: true
    });
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

    try {

        // ====================================================
        // YT-DLP — SPEED + MAXIMUM MP3 QUALITY
        // ====================================================

        await youtubedl(cleanUrl, {

            noPlaylist: true,

            // Best available YouTube audio source
            format: "bestaudio/best",

            // Highest MP3 quality
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

            // Download fragmented streams concurrently
            concurrentFragments: 8,

            // No artificial delays
            retries: 3,
            retrySleep: 1,

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