const videoUrl = document.getElementById("videoUrl");

const convertButton =
    document.getElementById("convertButton");

const clearButton =
    document.getElementById("clearButton");

const status =
    document.getElementById("status");

const cursorGlow =
    document.querySelector(".cursor-glow");


document.addEventListener("mousemove", (event) => {

    cursorGlow.style.left =
        event.clientX + "px";

    cursorGlow.style.top =
        event.clientY + "px";

});
document.addEventListener("mousemove", (event) => {
    const glow = document.querySelector(".cursor-glow");

    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
});


videoUrl.addEventListener("input", () => {

    clearButton.classList.toggle(
        "visible",
        videoUrl.value.length > 0
    );

});


clearButton.addEventListener("click", () => {

    videoUrl.value = "";

    clearButton.classList.remove("visible");

    videoUrl.focus();

});


convertButton.addEventListener("click", convertAudio);


videoUrl.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        convertAudio();
    }

});


async function convertAudio() {

    const url = videoUrl.value.trim();

    if (!url) {

        setStatus(
            "Please paste a video URL.",
            "error"
        );

        videoUrl.focus();

        return;
    }


    convertButton.disabled = true;

    convertButton.querySelector(".button-text")
        .textContent = "PROCESSING...";

    setStatus(
        "Extracting audio... please wait.",
        ""
    );


    try {

        const response = await fetch("/convert", {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                url
            })

        });


        const data =
            await response.json();


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


        const link =
            document.createElement("a");

        link.href = data.file;

        link.download = "audio.mp3";

        document.body.appendChild(link);

        link.click();

        link.remove();


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

        convertButton.querySelector(".button-text")
            .textContent =
            "CONVERT TO MP3";

    }

}


function setStatus(message, type) {

    status.textContent = message;

    status.className = "status";

    if (type) {
        status.classList.add(type);
    }

}