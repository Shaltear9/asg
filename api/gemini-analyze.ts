// api/gemini-analyze.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_ENDPOINT =
    'https://yunwu.ai/v1beta/models/gemini-2.0-flash:generateContent';

function bufferToBase64(buf: ArrayBuffer): string {
    // Vercel Node 运行时里可以用 Buffer 来转
    return Buffer.from(buf).toString('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY 未配置' });
    }

    try {
        // 读 body（Vercel Node 默认已帮你 parse JSON，如果没 parse 就按字符串再转一次）
        let bodyData: any = req.body;
        if (typeof bodyData === 'string') {
            try {
                bodyData = JSON.parse(bodyData);
            } catch {
                return res.status(400).json({ error: 'Invalid JSON body' });
            }
        }
        bodyData = bodyData || {};

        const { scriptText, videoUrl } = bodyData as {
            scriptText?: string;
            videoUrl?: string | null;
        };

        if (!scriptText?.trim() && !videoUrl) {
            return res
                .status(400)
                .json({ error: '请至少提供视频或剧本/描述之一。' });
        }

        const parts: any[] = [];

        // 1) 如果有视频 URL：先从 Blob 拉下来，再转 base64，塞进 inline_data
        if (videoUrl) {
            const videoResp = await fetch(videoUrl);
            if (!videoResp.ok) {
                const t = await videoResp.text().catch(() => '');
                return res.status(502).json({
                    error: '下载视频失败（Blob URL 不可访问或已过期）。',
                    status: videoResp.status,
                    body: t,
                });
            }

            const arrayBuf = await videoResp.arrayBuffer();
            const base64Video = bufferToBase64(arrayBuf);

            parts.push({
                inline_data: {
                    mime_type: 'video/mp4', // 或根据需要改成实际类型
                    data: base64Video,
                },
            });
        }

        // 2) 文本提示
        const scriptSegment = (scriptText || '').trim();

        const textPrompt = `
You are a professional film score composer.
You will receive a video (and optionally its script / description).
Your goal is to create a single, cohesive music generation prompt that acts as the soundtrack for the entire video.

Return a JSON object with the following fields:
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

        const upstreamBody = {
            contents: [
                {
                    role: 'user',
                    parts,
                },
            ],
        };

        const upstreamRes = await fetch(GEMINI_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(upstreamBody),
        });

        const upstreamText = await upstreamRes.text();

        if (!upstreamRes.ok) {
            return res.status(upstreamRes.status).json({
                error: 'Gemini upstream error',
                status: upstreamRes.status,
                body: upstreamText,
            });
        }

        // yunwu 代理的结构基本跟官方一致：candidates[0].content.parts[0].text
        let text: string | null = null;
        try {
            const data = JSON.parse(upstreamText);
            text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        } catch {
            text = upstreamText;
        }

        if (!text || typeof text !== 'string') {
            return res
                .status(500)
                .json({ error: 'Gemini 返回的结果中没有文本内容。' });
        }

        // 期望模型返回 JSON 字符串，保险起见只截取最外层大括号间的内容
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        const jsonSlice =
            firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
                ? text.slice(firstBrace, lastBrace + 1)
                : text;

        let parsed: any;
        try {
            parsed = JSON.parse(jsonSlice);
        } catch (e) {
            return res.status(500).json({
                error: 'Gemini 返回的 JSON 格式不合法，解析失败。',
                raw: text,
            });
        }

        return res.status(200).json(parsed);
    } catch (err: any) {
        console.error('[api/gemini-analyze] error:', err);
        return res.status(500).json({
            error: err?.message || 'Unknown server error',
        });
    }
}
