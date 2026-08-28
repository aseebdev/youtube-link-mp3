const videoUrl = document.getElementById("videoUrl");
const convertButton = document.getElementById("convertButton");
const clearButton = document.getElementById("clearButton");
const status = document.getElementById("status");
const cursorGlow = document.querySelector(".cursor-glow");

// ============================================================
// SMOOTH CURSOR GLOW
// ============================================================

let mouseX = 0;
let mouseY = 0;
let glowX = 0;
let glowY = 0;

let glowAnimationFrame = null;

document.addEventListener(
    "mousemove",
    (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;

        if (!glowAnimationFrame) {
            glowAnimationFrame = requestAnimationFrame(updateCursorGlow);
        }
    },
    { passive: true }
);

function updateCursorGlow() {
    glowAnimationFrame = null;

    // Smooth interpolation
    glowX += (mouseX - glowX) * 0.14;
    glowY += (mouseY - glowY) * 0.14;

    cursorGlow.style.transform =
        `translate3d(${glowX}px, ${glowY}px, 0) translate3d(-50%, -50%, 0)`;

    // Keep animating while the glow is still moving
    const distanceX = Math.abs(mouseX - glowX);
    const distanceY = Math.abs(mouseY - glowY);

    if (distanceX > 0.5 || distanceY > 0.5) {
        glowAnimationFrame = requestAnimationFrame(updateCursorGlow);
    }
}


// ============================================================
// INPUT
// ============================================================

videoUrl.addEventListener("input", () => {
    clearButton.classList.toggle(
        "visible",
        videoUrl.value.length > 0
    );
});


// ============================================================
// CLEAR BUTTON
// ============================================================

clearButton.addEventListener("click", () => {
    videoUrl.value = "";

    clearButton.classList.remove("visible");

    videoUrl.focus();
});


// ============================================================
// CONVERT BUTTON
// ============================================================

convertButton.addEventListener("click", convertAudio);


// ============================================================
// ENTER KEY
// ============================================================

videoUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        convertAudio();
    }
});


// ============================================================
// AUDIO CONVERSION
// ============================================================

async function convertAudio() {
    const url = videoUrl.value.trim();

    // Prevent empty submission
    if (!url) {
        setStatus(
            "Please paste a video URL.",
            "error"
        );

        videoUrl.focus();

        return;
    }

    // Prevent duplicate requests
    if (convertButton.disabled) {
        return;
    }

    convertButton.disabled = true;

    const buttonText =
        convertButton.querySelector(".button-text");

    if (buttonText) {
        buttonText.textContent = "PROCESSING...";
    }

    setStatus(
        "Extracting audio... please wait.",
        ""
    );

    try {
        const response = await fetch("/convert", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                url
            })
        });

        // Handle HTTP errors
        if (!response.ok) {
            throw new Error(
                `Server error (${response.status}).`
            );
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(
                data.error ||
                "Conversion failed."
            );
        }

        setStatus(
            "MP3 ready! Your download will start now.",
            "success"
        );

        // Create download link
        const link = document.createElement("a");

        link.href = data.file;
        link.download = "audio.mp3";

        document.body.appendChild(link);

        link.click();

        link.remove();

        // Reset status after 4 seconds
        setTimeout(() => {
            setStatus(
                "Ready for another conversion.",
                ""
            );
        }, 4000);

    } catch (error) {
        console.error(error);

        setStatus(
            error.message ||
            "Something went wrong.",
            "error"
        );

    } finally {
        convertButton.disabled = false;

        if (buttonText) {
            buttonText.textContent =
                "CONVERT TO MP3";
        }
    }
}


// ============================================================
// STATUS
// ============================================================

function setStatus(message, type) {
    status.textContent = message;

    status.className = "status";

    if (type) {
        status.classList.add(type);
    }
}