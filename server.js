const express = require("express");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

const publicPath = path.join(__dirname, "public");
const downloadsPath = path.join(__dirname, "downloads");
const binPath = path.join(
    __dirname,
    "bin"
);

const ytDlpPath = path.join(
    binPath,
    "yt-dlp.exe"
);

const ffmpegPath = path.join(
    binPath,
    "ffmpeg.exe"
);


// Create downloads folder if missing

if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, {
        recursive: true
    });
}


// Check required programs

if (!fs.existsSync(ytDlpPath)) {
    console.error("ERROR: yt-dlp.exe not found:");
    console.error(ytDlpPath);
}

if (!fs.existsSync(ffmpegPath)) {
    console.error("ERROR: ffmpeg.exe not found:");
    console.error(ffmpegPath);
}


app.use(express.json());

app.use(
    express.static(publicPath)
);


app.post("/convert", (req, res) => {

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


    if (!fs.existsSync(ytDlpPath)) {
        return res.status(500).json({
            success: false,
            error: "yt-dlp.exe was not found in the bin folder."
        });
    }


    if (!fs.existsSync(ffmpegPath)) {
        return res.status(500).json({
            success: false,
            error: "ffmpeg.exe was not found in the bin folder."
        });
    }


    const id = crypto.randomUUID();


    const outputTemplate = path.join(
        downloadsPath,
        `${id}.%(ext)s`
    );


    const args = [
        "--no-playlist",

        "--extract-audio",

        "--audio-format",
        "mp3",

        "--audio-quality",
        "0",

        "--force-ipv4",

        "--ffmpeg-location",
        binPath,

        "--output",
        outputTemplate,

        url
    ];


    console.log("\n==============================");
    console.log("Starting conversion...");
    console.log("URL:", url);
    console.log("yt-dlp:", ytDlpPath);
    console.log("FFmpeg folder:", binPath);
    console.log("==============================\n");


    execFile(
        ytDlpPath,
        args,
        {
            windowsHide: true,

            cwd: __dirname,

            maxBuffer: 20 * 1024 * 1024
        },

        (error, stdout, stderr) => {

            console.log("yt-dlp stdout:");
            console.log(stdout);

            if (stderr) {
                console.error(
                    "yt-dlp stderr:"
                );

                console.error(stderr);
            }


            if (error) {

                console.error(
                    "Conversion process failed:"
                );

                console.error(error);


                return res.status(500).json({
                    success: false,

                    error:
                        stderr ||
                        error.message ||
                        "Conversion failed. Check the terminal for details."
                });
            }


            let mp3File;


            const printedPath = stdout
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean)
                .find(line =>
                    line.toLowerCase().endsWith(".mp3")
                );


            if (
                printedPath &&
                fs.existsSync(printedPath)
            ) {

                mp3File = path.basename(
                    printedPath
                );

            } else {

                const files =
                    fs.readdirSync(downloadsPath);


                mp3File = files.find(file =>
                    file.startsWith(id) &&
                    file.toLowerCase().endsWith(".mp3")
                );
            }


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
                "SUCCESS:"
            );

            console.log(
                mp3File
            );


            res.json({
                success: true,

                file:
                    `/download/${encodeURIComponent(
                        mp3File
                    )}`
            });

        }
    );

});


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


        if (!fs.existsSync(filePath)) {

            return res
                .status(404)
                .send(
                    "File not found."
                );
        }


        res.download(
            filePath,
            filename
        );

    }
);


app.listen(
    PORT,

    () => {

        console.log(
            `\nServer running at http://localhost:${PORT}`
        );

        console.log(
            "Project folder:",
            __dirname
        );

        console.log(
            "yt-dlp found:",
            fs.existsSync(ytDlpPath)
        );

        console.log(
            "FFmpeg found:",
            fs.existsSync(ffmpegPath)
        );

    }
);