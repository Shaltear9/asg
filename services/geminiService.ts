// src/services/geminiService.ts
import type { ScriptAnalysis } from '../types';

// 第三方代理的完整地址（来自你的视频理解 OpenAPI 文档）
const GEMINI_ENDPOINT =
    'https://yunwu.ai/v1beta/models/gemini-2.0-flash:generateContent';

// Vite 在 vite.config.ts 里已经把 env 注入到了 process.env.API_KEY
// （GEMINI_API_KEY 设置在 Vercel 环境变量里）
const GEMINI_API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.warn(
        '[Gemini] GEMINI_API_KEY 未配置，调用接口一定会失败，请在 Vercel 环境变量中设置 GEMINI_API_KEY。'
    );
}

/**
 * 浏览器端 File -> base64（取掉 data:xxx;base64, 头）
 */
async function fileToBase64(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('File read error'));
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                return reject(new Error('Unexpected FileReader result type'));
            }
            const [, base64] = result.split(',');
            resolve(base64 || result);
        };
        reader.readAsDataURL(file);
    });
}

/**
 * 根据剧本 +（可选）视频 调用 Gemini，返回 ScriptAnalysis：
 * - summary
 * - mood
 * - title
 * - music_prompt
 */
export async function analyzeScriptAndGeneratePrompts(
    scriptText: string,
    videoFile?: File | null
): Promise<ScriptAnalysis> {
    if (!scriptText.trim() && !videoFile) {
        throw new Error('请至少提供视频或剧本/描述之一。');
    }

    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY 未配置，请在 Vercel 环境变量中设置。');
    }

    // 组装 parts（视频 + 文本）
    const parts: any[] = [];

    // 1) 可选：视频 part（多模态）
    if (videoFile) {
        const base64Video = await fileToBase64(videoFile);

        // 这里使用官方 REST 文档的字段名：inlineData + mimeType + data
        // yunwu.ai 是对接官方 Gemini API 的网关，这种写法是兼容的
        parts.push({
            inlineData: {
                mimeType: videoFile.type || 'video/mp4',
                data: base64Video,
            },
        });
    }

    // 2) 文本 part（系统指令 + 用户剧本）
    const scriptSegment = scriptText.trim();

    const textPrompt = `
You are a professional film score composer.
You will receive a video (and optionally its script / description).
Your goal is to create a single, cohesive music generation prompt that acts as the soundtrack for the entire video.

Output JSON with the following fields:
1. summary: A brief 1-sentence summary of the video's content.
2. mood: 2-3 words describing the emotional tone (e.g., "Melancholic, Hopeful").
3. title: A creative title for the soundtrack.
4. music_prompt: A detailed description for an AI music generator (Suno).
   - Focus on instruments, tempo, genre, and atmosphere.
   - Do NOT include lyrics.
   - Keep it under 450 characters.

${scriptSegment
            ? `Here is the script or description of the video:\n\n${scriptSegment}`
            : 'No script was provided. Infer everything from the video only.'
        }
  `.trim();

    parts.push({ text: textPrompt });

    // 3) 请求体（严格参考你 txt 的 OpenAPI + 官方 JSON Mode 写法）
    const body = {
        contents: [
            {
                role: 'user',
                parts,
            },
        ],
        generationConfig: {
            // JSON Mode：要求返回值为 JSON 字符串
            response_mime_type: 'application/json',
            response_schema: {
                type: 'object',
                properties: {
                    summary: { type: 'string' },
                    mood: { type: 'string' },
                    title: { type: 'string' },
                    music_prompt: { type: 'string' },
                },
                required: ['summary', 'mood', 'title', 'music_prompt'],
            },
        },
    };

    // 4) 直接调用 yunwu.ai 的 Gemini 代理
    const res = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(
            `Gemini API Error ${res.status}: ${errText || res.statusText}`
        );
    }

    const data = await res.json();

    // 按官方结构：candidates[0].content.parts[0].text 里面是一段 JSON 字符串
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || typeof text !== 'string') {
        console.error('Unexpected Gemini response:', data);
        throw new Error('Gemini 返回的结果中没有文本内容。');
    }

    try {
        const parsed = JSON.parse(text);
        return parsed as ScriptAnalysis;
    } catch (e) {
        console.error('Failed to parse JSON text from Gemini:', text);
        throw new Error('Gemini 返回的 JSON 格式不合法，解析失败。');
    }
}
