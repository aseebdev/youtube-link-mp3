const videoUrl =
    document.getElementById("videoUrl");

const convertButton =
    document.getElementById("convertButton");

const clearButton =
    document.getElementById("clearButton");

const status =
    document.getElementById("status");

const cursorGlow =
    document.querySelector(".cursor-glow");

// ============================================================
// CURSOR GLOW
// ============================================================

let mouseX = 0;
let mouseY = 0;

let glowX = 0;
let glowY = 0;

let glowFrame = 0;

if (
    cursorGlow &&
    window.matchMedia(
        "(hover: hover) and (pointer: fine)"
    ).matches
) {

    document.addEventListener(
        "mousemove",
        function (event) {

            mouseX = event.clientX;
            mouseY = event.clientY;

            if (!glowFrame) {

                glowFrame =
                    requestAnimationFrame(
                        updateCursorGlow
                    );
            }
        },
        {
            passive: true
        }
    );
}

function updateCursorGlow() {

    glowX +=
        (mouseX - glowX) *
        0.16;

    glowY +=
        (mouseY - glowY) *
        0.16;

    cursorGlow.style.transform =
        "translate3d(" +
        glowX +
        "px," +
        glowY +
        "px,0) translate3d(-50%,-50%,0)";

    const dx =
        Math.abs(
            mouseX - glowX
        );

    const dy =
        Math.abs(
            mouseY - glowY
        );

    if (
        dx > 0.5 ||
        dy > 0.5
    ) {

        glowFrame =
            requestAnimationFrame(
                updateCursorGlow
            );

    } else {

        glowFrame = 0;
    }
}

// ============================================================
// INPUT
// ============================================================

if (videoUrl) {

    videoUrl.addEventListener(
        "input",
        function () {

            if (clearButton) {

                clearButton.classList.toggle(
                    "visible",
                    videoUrl.value.length > 0
                );
            }
        }
    );
}

// ============================================================
// CLEAR BUTTON
// ============================================================

if (clearButton) {

    clearButton.addEventListener(
        "click",
        function () {

            videoUrl.value = "";

            clearButton.classList.remove(
                "visible"
            );

            setStatus(
                "Ready",
                ""
            );

            videoUrl.focus();
        }
    );
}

// ============================================================
// CONVERT BUTTON
// ============================================================

if (convertButton) {

    convertButton.addEventListener(
        "click",
        convertAudio
    );
}

// ============================================================
// ENTER KEY
// ============================================================

if (videoUrl) {

    videoUrl.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Enter"
            ) {

                event.preventDefault();

                convertAudio();
            }
        }
    );
}

// ============================================================
// CONVERT
// ============================================================

async function convertAudio() {

    const url =
        videoUrl.value.trim();

    // --------------------------------------------------------
    // Validate URL
    // --------------------------------------------------------

    if (!url) {

        setStatus(
            "Please paste a YouTube URL.",
            "error"
        );

        videoUrl.focus();

        return;
    }

    // --------------------------------------------------------
    // Prevent duplicate requests
    // --------------------------------------------------------

    if (convertButton.disabled) {
        return;
    }

    convertButton.disabled = true;

    const buttonText =
        convertButton.querySelector(
            ".button-text"
        );

    if (buttonText) {

        buttonText.textContent =
            "PROCESSING...";
    }

    setStatus(
        "Extracting audio... please wait.",
        ""
    );

    try {

        // ====================================================
        // REQUEST SERVER
        // ====================================================

        const response =
            await fetch(
                "/convert",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json, audio/mpeg, */*"
                    },

                    body:
                        JSON.stringify({
                            url: url
                        })
                }
            );

        // ====================================================
        // RESPONSE TYPE
        // ====================================================

        const contentType =
            (
                response.headers.get(
                    "content-type"
                ) || ""
            ).toLowerCase();

        // ====================================================
        // SERVER ERROR
        // ====================================================

        if (!response.ok) {

            let errorMessage =
                "Server error (" +
                response.status +
                ").";

            if (
                contentType.includes(
                    "application/json"
                )
            ) {

                try {

                    const errorData =
                        await response.json();

                    if (
                        errorData &&
                        errorData.error
                    ) {

                        errorMessage =
                            errorData.error;
                    }

                } catch (jsonError) {

                    console.error(
                        "Error JSON parsing failed:",
                        jsonError
                    );
                }

            } else {

                try {

                    const text =
                        await response.text();

                    if (text.trim()) {

                        console.error(
                            "Server response:",
                            text
                        );
                    }

                } catch {}
            }

            throw new Error(
                errorMessage
            );
        }

        // ====================================================
        // DIRECT AUDIO RESPONSE
        // ====================================================

        if (
            contentType.includes(
                "audio/"
            ) ||
            contentType.includes(
                "application/octet-stream"
            )
        ) {

            const blob =
                await response.blob();

            if (!blob.size) {

                throw new Error(
                    "The MP3 file is empty."
                );
            }

            downloadBlob(
                blob,
                "audio.mp3"
            );

            setStatus(
                "MP3 ready! Your download has started.",
                "success"
            );

            resetButton();

            return;
        }

        // ====================================================
        // JSON RESPONSE
        // ====================================================

        if (
            contentType.includes(
                "application/json"
            )
        ) {

            const data =
                await response.json();

            if (
                !data ||
                data.success !== true
            ) {

                throw new Error(
                    data?.error ||
                    "Conversion failed."
                );
            }

            if (!data.file) {

                throw new Error(
                    "Server did not provide a download file."
                );
            }

            // =================================================
            // NATIVE BROWSER DOWNLOAD
            // =================================================

            // The browser handles the file transfer directly.
            // The complete MP3 is NOT loaded into JavaScript.

            const link =
                document.createElement("a");

            link.href =
                data.file;

            link.download =
                "audio.mp3";

            link.style.display =
                "none";

            document.body.appendChild(
                link
            );

            link.click();

            link.remove();

            setStatus(
                "MP3 ready! Your download has started.",
                "success"
            );

            resetButton();

            return;
        }

        // ====================================================
        // UNKNOWN RESPONSE
        // ====================================================

        throw new Error(
            "The server returned an unexpected response."
        );

    } catch (error) {

        console.error(
            "Conversion error:",
            error
        );

        setStatus(
            error.message ||
            "Something went wrong.",
            "error"
        );

    } finally {

        convertButton.disabled =
            false;

        if (buttonText) {

            buttonText.textContent =
                "CONVERT TO MP3";
        }
    }
}

// ============================================================
// DOWNLOAD BLOB
// ============================================================

function downloadBlob(
    blob,
    filename
) {

    const downloadUrl =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement("a");

    link.href =
        downloadUrl;

    link.download =
        filename;

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();

    setTimeout(
        function () {

            URL.revokeObjectURL(
                downloadUrl
            );

        },
        1000
    );
}

// ============================================================
// STATUS
// ============================================================

function setStatus(
    message,
    type
) {

    if (!status) {
        return;
    }

    status.textContent =
        message;

    status.className =
        "status";

    if (type) {

        status.classList.add(
            type
        );
    }
}

// ============================================================
// BUTTON RESET
// ============================================================

function resetButton() {

    const buttonText =
        convertButton.querySelector(
            ".button-text"
        );

    if (buttonText) {

        buttonText.textContent =
            "CONVERT TO MP3";
    }
}