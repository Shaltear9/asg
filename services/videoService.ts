export async function analyzeVideo(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/analyze-video", {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        throw new Error(" ”∆µ∑÷Œˆ ß∞‹");
    }

    const data = await res.json();
    return data.description;
}
