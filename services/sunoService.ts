import type { SunoTask } from "../types";

const SUNO_API_BASE = "https://api.sunoapi.org";

interface GenerateResponse {
    code: number;
    msg: string;
    data: {
        taskId: string;
    };
}

interface TrackData {
    id: string;
    audioUrl: string;
    streamAudioUrl: string;
    imageUrl: string;
    prompt: string;
    modelName: string;
    title: string;
    tags: string;
    createTime: string;
    duration: number;
}

interface TaskInfoResponse {
    code: number;
    msg: string;
    data: {
        taskId: string;
        parentMusicId: string;
        param: string;
        response: {
            taskId: string;
            sunoData: TrackData[];
        };
        status: 'PENDING' | 'TEXT_SUCCESS' | 'FIRST_SUCCESS' | 'SUCCESS' | 'CREATE_TASK_FAILED' | 'GENERATE_AUDIO_FAILED' | 'CALLBACK_EXCEPTION' | 'SENSITIVE_WORD_ERROR';
        type: string;
        operationType: 'generate' | 'extend' | 'upload_cover' | 'upload_extend';
        errorCode: number | null;
        errorMessage: string | null;
    };
}

/**
 * 生成音乐 - 使用Suno API
 */
export async function generateMusic(
    prompt: string,
    apiKey: string,
    instrumental: boolean = true,
    title?: string,
    style?: string
): Promise<string> {
    if (!apiKey) throw new Error("Suno API Key is required.");

    const body = {
        prompt: prompt,
        style: style || "Cinematic",
        title: title || "Generated Soundtrack",
        customMode: true,
        instrumental: instrumental,
        model: "V3_5" // 使用V3.5模型，根据需求可以改为V4
    };

    const response = await fetch(`${SUNO_API_BASE}/api/v1/generate`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Suno API Request Failed (${response.status}): ${errorText}`);
    }

    const result: GenerateResponse = await response.json();

    if (result.code !== 200) {
        throw new Error(`Suno API Error (${result.code}): ${result.msg}`);
    }

    return result.data.taskId;
}

/**
 * 轮询任务状态直到完成或失败
 */
export async function pollForMusic(
    taskId: string,
    apiKey: string,
    onProgress?: (status: string, progress?: number) => void
): Promise<SunoTask[]> {
    const MAX_ATTEMPTS = 50; // 最大尝试次数（10分钟）
    const INTERVAL = 5000; // 5秒间隔

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, INTERVAL));

        try {
            const response = await fetch(
                `${SUNO_API_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            if (!response.ok) {
                console.warn(`Polling request failed (${response.status}), attempt ${attempt + 1}`);
                continue;
            }

            const result: TaskInfoResponse = await response.json();

            if (result.code !== 200) {
                console.warn(`API returned error code ${result.code}: ${result.msg}`);
                continue;
            }

            const taskData = result.data;
            const status = taskData.status;

            // 更新进度状态
            let progressMessage = `Status: ${status}`;
            let progressValue: number | undefined;

            switch (status) {
                case 'PENDING':
                    progressMessage = "任务排队中...";
                    progressValue = 10;
                    break;
                case 'TEXT_SUCCESS':
                    progressMessage = "文本生成完成，开始生成音频...";
                    progressValue = 40;
                    break;
                case 'FIRST_SUCCESS':
                    progressMessage = "第一部分音频生成完成...";
                    progressValue = 70;
                    break;
                case 'SUCCESS':
                    progressMessage = "音频生成完成！";
                    progressValue = 100;
                    break;
                case 'CREATE_TASK_FAILED':
                case 'GENERATE_AUDIO_FAILED':
                case 'CALLBACK_EXCEPTION':
                case 'SENSITIVE_WORD_ERROR':
                    throw new Error(`生成失败: ${taskData.errorMessage || status}`);
            }

            if (onProgress) {
                onProgress(progressMessage, progressValue);
            }

            // 检查是否完成
            if (status === 'SUCCESS') {
                const sunoData = taskData.response?.sunoData;
                if (sunoData && sunoData.length > 0) {
                    console.log("Suno generation completed successfully:", sunoData);

                    // 转换为SunoTask格式
                    return sunoData.map(track => ({
                        id: track.id,
                        status: 'SUCCESS',
                        audio_url: track.audioUrl,
                        image_url: track.imageUrl,
                        title: track.title,
                        model_name: track.modelName,
                        prompt: track.prompt
                    }));
                } else {
                    throw new Error("生成完成但没有返回音频数据");
                }
            }

            // 处理失败状态
            if (status.includes('FAILED') || status.includes('ERROR')) {
                throw new Error(`生成失败: ${taskData.errorMessage || status}`);
            }

        } catch (error) {
            if (error instanceof Error) {
                // 如果是明确的错误，直接抛出
                if (error.message.includes('生成失败')) {
                    throw error;
                }
                // 网络错误等暂时性问题，继续重试
                console.warn(`Polling attempt ${attempt + 1} failed:`, error.message);
            }

            if (onProgress) {
                onProgress(`连接问题，重试中... (${attempt + 1}/${MAX_ATTEMPTS})`);
            }
        }
    }

    throw new Error("生成超时，请稍后重试");
}

/**
 * 获取任务信息（单次查询，不轮询）
 */
export async function getTaskInfo(taskId: string, apiKey: string): Promise<TaskInfoResponse['data']> {
    const response = await fetch(
        `${SUNO_API_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
        {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        }
    );

    if (!response.ok) {
        throw new Error(`获取任务信息失败: ${response.status}`);
    }

    const result: TaskInfoResponse = await response.json();

    if (result.code !== 200) {
        throw new Error(`API错误: ${result.msg}`);
    }

    return result.data;
}