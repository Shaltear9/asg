import type { SunoTask } from "../types";

const SUNO_API_URL = "https://api.sunoapi.org/api/v1";

interface GenerateResponse {
    code: number;
    msg: string;
    data: {
        taskId: string;
    };
}

// 根据轮询.txt文档修正接口
interface WavRecordInfoResponse {
    code: number;
    msg: string;
    data: {
        taskId: string;
        musicId: string;
        callbackUrl: string;
        completeTime: string;
        response: {
            audioWavUrl: string;
        };
        successFlag: 'PENDING' | 'SUCCESS' | 'CREATE_TASK_FAILED' | 'GENERATE_WAV_FAILED' | 'CALLBACK_EXCEPTION';
        createTime: string;
        errorCode: number | null;
        errorMessage: string | null;
    };
}

/**
 * Triggers music generation via Suno API.
 * Using "Inspiration Mode" (customMode: false) allows us to pass a descriptive prompt
 * and let the model decide on the lyrics (or lack thereof) and composition.
 */
export async function generateMusic(prompt: string, apiKey: string, instrumental: boolean = true): Promise<string> {
    if (!apiKey) throw new Error("Suno API Key is required.");

    // The API requires callBackUrl even if we are polling.
    const body = {
        prompt: prompt,
        customMode: false,
        instrumental: instrumental,
        model: "V5",
        callBackUrl: "https://webhook.site/8e599e44-1a3e-4630-bbbf-9dc75d9bd674"
    };

    let response;
    try {
        response = await fetch(`${SUNO_API_URL}/generate`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });
    } catch (networkError) {
        throw new Error(`Network error during generation request: ${networkError instanceof Error ? networkError.message : String(networkError)}`);
    }

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Suno API Request Failed (${response.status}): ${errText}`);
    }

    const res: GenerateResponse = await response.json();

    if (res.code !== 200) {
        throw new Error(`Suno API Error (${res.code}): ${res.msg}`);
    }

    return res.data.taskId;
}

/**
 * Polls the task status until it is complete or fails.
 * @param taskId The ID returned from generation
 * @param apiKey The user's API key
 * @param onProgress Optional callback to update status message in UI
 */
export async function pollForMusic(
    taskId: string,
    apiKey: string,
    onProgress?: (status: string) => void
): Promise<SunoTask[]> {
    const MAX_ATTEMPTS = 60; // 5 minutes
    const INTERVAL = 5000; // 5 seconds

    let consecutiveErrors = 0;
    let lastKnownStatus = "Initializing";

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await new Promise(resolve => setTimeout(resolve, INTERVAL));

        try {
            // 修正轮询接口为 /api/v1/wav/record-info
            const response = await fetch(`${SUNO_API_URL}/wav/record-info?taskId=${taskId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                consecutiveErrors++;
                const errText = await response.text();
                console.warn(`Polling HTTP Error (${response.status}):`, errText);
                if (consecutiveErrors >= 5) throw new Error(`Repeated API errors (${response.status}): ${errText}`);
                if (onProgress) onProgress(`Connection issue... retrying (${i + 1}/${MAX_ATTEMPTS})`);
                continue;
            }

            const res: WavRecordInfoResponse = await response.json();

            if (res.code !== 200) {
                consecutiveErrors++;
                console.warn(`Polling API Error (${res.code}):`, res.msg);
                if (consecutiveErrors >= 5) throw new Error(`Repeated API error code ${res.code}: ${res.msg}`);
                continue;
            }

            consecutiveErrors = 0;
            const data = res.data;

            if (!data) {
                if (onProgress) onProgress(`Waiting for data... (${i + 1}/${MAX_ATTEMPTS})`);
                continue;
            }

            const status = (data.successFlag || 'UNKNOWN').toUpperCase();
            lastKnownStatus = status;

            if (onProgress) {
                onProgress(`Status: ${status} (${Math.round(((i + 1) * INTERVAL) / 1000)}s)`);
            }

            // 检查任务状态
            if (status === 'SUCCESS') {
                // 成功状态，检查是否有音频URL
                if (data.response?.audioWavUrl) {
                    console.log("Suno Generation Success:", data);
                    return [{
                        id: data.taskId,
                        status: 'SUCCESS',
                        audio_url: data.response.audioWavUrl,
                        title: 'Generated Track',
                        prompt: prompt // 这里需要从外部传入prompt，或者可以从其他途径获取
                    }];
                } else {
                    throw new Error("Generation marked as complete, but audio URL was missing from the response.");
                }
            }

            if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_WAV_FAILED' || status === 'CALLBACK_EXCEPTION') {
                throw new Error(`Suno API task failed: ${data.errorMessage || 'Unknown error'}`);
            }

            // 对于PENDING状态，继续轮询

        } catch (e) {
            // Check if it's a fatal error we just threw
            if (e instanceof Error && (
                e.message.includes("Repeated API") ||
                e.message.includes("Suno API task failed") ||
                e.message.includes("Generation marked as complete")
            )) {
                throw e;
            }
            console.warn("Polling loop exception:", e);
        }
    }

    throw new Error(`Timeout waiting for music generation. Last known status: ${lastKnownStatus}.`);
}