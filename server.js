const express = require("express");
const { execFile } = require("child_process");
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

// Create downloads folder
if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, {
        recursive: true
    });
}

app.use(express.json());

app.use(express.static(publicPath));


app.post("/convert", async (req, res) => {

    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            success: false,
            error: "Please provide a video URL."
        });
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(url);
    } catch {
        return res.status(400).json({
            success: false,
            error: "Invalid URL."
        });
    }

    const allowedHosts = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be"
    ];

    if (
        !allowedHosts.includes(
            parsedUrl.hostname.toLowerCase()
        )
    ) {
        return res.status(400).json({
            success: false,
            error: "Only YouTube URLs are supported."
        });
    }

    const id = crypto.randomUUID();

    const outputTemplate = path.join(
        downloadsPath,
        `${id}.%(ext)s`
    );

    console.log("Starting conversion...");
    console.log("URL:", url);
    console.log("FFmpeg:", ffmpegPath);

    try {

        await youtubedl(
            url,
            {
                noPlaylist: true,

                extractAudio: true,

                audioFormat: "mp3",

                audioQuality: "0",

                jsRuntimes: "deno",

                ffmpegLocation: path.dirname(
                    ffmpegPath
                ),

                output: outputTemplate
            }
        );

        const files = fs.readdirSync(
            downloadsPath
        );

        const mp3File = files.find(file =>
            file.startsWith(id) &&
            file.toLowerCase().endsWith(".mp3")
        );

        if (!mp3File) {
            return res.status(500).json({
                success: false,
                error:
                    "Conversion finished, but the MP3 file was not found."
            });
        }

        console.log("SUCCESS:", mp3File);

        res.json({
            success: true,
            file:
                `/download/${encodeURIComponent(
                    mp3File
                )}`
        });

    } catch (error) {

        console.error("\n========== CONVERSION ERROR ==========");

        console.error("Message:");
        console.error(error.message);

        console.error("Name:");
        console.error(error.name);

        console.error("Code:");
        console.error(error.code);

        console.error("stdout:");
        console.error(error.stdout);

        console.error("stderr:");
        console.error(error.stderr);

        console.error("Full error:");
        console.error(error);

        console.error("=====================================\n");

        res.status(500).json({
            success: false,
            error:
                error.stderr ||
                error.message ||
                "Conversion failed."
        });

    }

});


app.get("/download/:filename", (req, res) => {

    const filename = path.basename(
        req.params.filename
    );

    const filePath = path.join(
        downloadsPath,
        filename
    );

    if (!fs.existsSync(filePath)) {
        return res
            .status(404)
            .send("File not found.");
    }

    res.download(
        filePath,
        filename
    );

});


app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
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