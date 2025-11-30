import { GoogleGenAI, Type } from "@google/genai";
import type { ScriptAnalysis } from '../types';

//单例客户端，复用连接
let ai: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
    if (!ai) {
        const API_KEY = process.env.API_KEY;
        if (!API_KEY) {
            throw new Error("API_KEY environment variable not set. Please ensure it's configured.");
        }
        ai = new GoogleGenAI({
            apiKey: API_KEY,
            httpOptions: {
                //继续走你的代理，不改这一行
                baseUrl: "https://yunwu.ai",
            },
        });
    }
    return ai;
}

// 浏览器环境下把 File 转成 base64 字符串
async function fileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    // window.btoa 在浏览器里可用
    return btoa(binary);
}

/**
 * 多模态脚本分析：
 * - scriptText: 文本脚本/描述，可为空
 * - videoFile: 上传的视频 File，可为空
 *
 * 至少要有一个存在（在 App.tsx 里已经判断过）
 */
export async function analyzeScriptAndGeneratePrompts(
    scriptText: string,
    videoFile?: File
): Promise<ScriptAnalysis> {
    const aiClient = getAiClient();
    const model = "gemini-2.5-flash";

    // 1. 构造提示词（不直接把脚本插进长 prompt，而是放到单独 text part）
    const systemPrompt = `
You are a professional film score composer.
You will receive:
- Optionally: a video (movie clip / short video).
- Optionally: a script or description of the video.

Your goal is to create a SINGLE, cohesive music generation prompt
that acts as the soundtrack for the entire video.

Output JSON with the following fields:
1. summary: A brief 1-sentence summary of the video's content.
2. mood: 2-3 words describing the emotional tone (e.g., "Melancholic, Hopeful").
3. title: A creative title for the soundtrack.
4. music_prompt: A detailed description for an AI music generator (Suno),
   focusing on instruments, tempo, genre, and atmosphere.
   - Do NOT include lyrics.
   - Keep it under 450 characters.
`.trim();

    const parts: any[] = [];

    // 2. 如果有视频，把它作为 inlineData 传进去（多模态）
    if (videoFile) {
        console.log('[Gemini] attaching video file to request', {
            name: videoFile.name,
            type: videoFile.type,
            size: videoFile.size,
        });

        const base64 = await fileToBase64(videoFile);

        parts.push({
            inlineData: {
                data: base64,
                mimeType: videoFile.type || "video/mp4",
            },
        });
    }

    // 3. 把系统提示和脚本文本作为 text 部分
    const scriptTextForModel =
        scriptText && scriptText.trim().length > 0
            ? scriptText
            : "(No script text provided. Infer as much as possible from the video alone.)";

    parts.push(
        { text: systemPrompt },
        {
            text: `SCRIPT_OR_DESCRIPTION:\n${scriptTextForModel}`,
        }
    );

    // 4. 调用代理版 Gemini 的 generateContent
    const response = await aiClient.models.generateContent({
        model,
        contents: [
            {
                role: "user",
                parts,
            },
        ],
        config: {
            // 让代理直接帮你做 JSON 结构化输出
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: { type: Type.STRING },
                    mood: { type: Type.STRING },
                    title: { type: Type.STRING },
                    music_prompt: { type: Type.STRING },
                },
                required: ["summary", "mood", "title", "music_prompt"],
            },
        },
    });

    const jsonText = (response.text || "").toString().trim();
    console.log('[Gemini] raw jsonText:', jsonText);

    if (!jsonText) {
        throw new Error("Empty response from Gemini.");
    }

    try {
        const parsedResult = JSON.parse(jsonText);
        const result: ScriptAnalysis = {
            summary: parsedResult.summary ?? "",
            mood: parsedResult.mood ?? "",
            title: parsedResult.title ?? "",
            music_prompt: parsedResult.music_prompt ?? "",
        };
        return result;
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonText, e);
        throw new Error("The AI returned an invalid JSON format. Please try again or check the console log.");
    }
}
