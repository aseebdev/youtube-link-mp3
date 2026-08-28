const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const publicPath = path.join(__dirname, "public");
const downloadsPath = path.join(__dirname, "downloads");

// Node packages
const youtubedl = require("youtube-dl-exec");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;


// ============================================================
// CREATE TEMPORARY DOWNLOAD FOLDER
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

app.use(express.json({
    limit: "10kb"
}));

app.use(express.static(publicPath, {
    etag: true
}));


// ============================================================
// CONVERT YOUTUBE VIDEO TO MP3
// ============================================================

app.post("/convert", async (req, res) => {

    const { url } = req.body;

    // Validate input
    if (!url || typeof url !== "string") {

        return res.status(400).json({
            success: false,
            error: "Please provide a YouTube URL."
        });

    }

    const cleanUrl = url.trim();

    let parsedUrl;

    // Validate URL
    try {

        parsedUrl = new URL(cleanUrl);

    } catch {

        return res.status(400).json({
            success: false,
            error: "Invalid URL."
        });

    }


    // ========================================================
    // ALLOWED YOUTUBE HOSTS
    // ========================================================

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


    // ========================================================
    // UNIQUE FILE ID
    // ========================================================

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
    console.log("FFmpeg:", ffmpegPath);
    console.log("======================================");


    try {

        // ====================================================
        // YT-DLP
        // ====================================================

        await youtubedl(
            cleanUrl,
            {
                noPlaylist: true,

                extractAudio: true,

                audioFormat: "mp3",

                audioQuality: "0",

                jsRuntimes: `deno:${denoPath}`,

                remoteComponents: "ejs:npm",

                ffmpegLocation:
                    path.dirname(ffmpegPath),

                output: outputTemplate
            }
        );


        // ====================================================
        // FIND GENERATED MP3
        // ====================================================

        const files =
            fs.readdirSync(downloadsPath);

        const mp3File =
            files.find(
                function (file) {

                    return (
                        file.startsWith(id) &&
                        file.toLowerCase().endsWith(".mp3")
                    );

                }
            );


        if (!mp3File) {

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
        // RETURN JSON TO EXISTING FRONTEND
        // ====================================================

        return res.json({
            success: true,
            file: "/download/" + encodeURIComponent(mp3File)
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

                    fs.unlink(
                        path.join(
                            downloadsPath,
                            file
                        ),
                        function () {}
                    );

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


        return res.status(500).json({
            success: false,
            error:
                "Unable to convert this video. Please try another YouTube URL."
        });

    }

});


// ============================================================
// DOWNLOAD MP3
// SEND TO USER THEN DELETE FROM SERVER
// ============================================================

app.get("/download/:filename", (req, res) => {

    const filename =
        path.basename(
            req.params.filename
        );

    const filePath =
        path.join(
            downloadsPath,
            filename
        );


    // File doesn't exist
    if (!fs.existsSync(filePath)) {

        return res.status(404).send(
            "File not found."
        );

    }


    console.log(
        "Sending file:",
        filename
    );


    // ========================================================
    // SEND FILE TO USER
    // ========================================================

    res.download(
        filePath,
        "audio.mp3",
        function (error) {

            // =================================================
            // DELETE AFTER DOWNLOAD
            // =================================================

            fs.unlink(
                filePath,
                function (deleteError) {

                    if (deleteError) {

                        console.error(
                            "File cleanup failed:",
                            deleteError.message
                        );

                    } else {

                        console.log(
                            "Temporary file deleted:",
                            filename
                        );

                    }

                }
            );


            if (error) {

                console.error(
                    "Download error:",
                    error.message
                );

            }

        }
    );

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

app.listen(PORT, () => {

    console.log(
        "Server running on port " + PORT
    );

    console.log(
        "Project folder:",
        __dirname
    );

    console.log(
        "FFmpeg path:",
        ffmpegPath
    );

});