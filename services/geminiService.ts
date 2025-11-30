// services/geminiService.ts
import type { ScriptAnalysis } from '../types';

/**
 * 前端只调用自己的 /api/gemini-analyze，不直接访问 yunwu
 */
export async function analyzeScriptAndGeneratePrompts(
    scriptText: string,
    videoUrl?: string | null
): Promise<ScriptAnalysis> {
    if (!scriptText.trim() && !videoUrl) {
        throw new Error('请至少提供视频或剧本/描述之一。');
    }

    const res = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            scriptText,
            videoUrl: videoUrl ?? null,
        }),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(
            `Gemini API Error ${res.status}: ${errText || res.statusText}`
        );
    }

    const data = (await res.json()) as ScriptAnalysis;
    return data;
}
