// api/blob-upload.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Vercel Node runtime 通常已经帮你把 JSON 解析成 req.body
        let body = req.body as HandleUploadBody | undefined;

        // 如果是 string，就再手动 JSON.parse 一次
        if (!body) {
            const raw = req.body as any;
            if (typeof raw === 'string') {
                body = JSON.parse(raw) as HandleUploadBody;
            }
        }

        if (!body) {
            return res.status(400).json({ error: 'Missing upload body' });
        }

        const jsonResponse = await handleUpload({
            request: req,   // 这里可以是 IncomingMessage（VercelRequest），官方支持
            body,
            onBeforeGenerateToken: async (pathname /*, clientPayload, multipart */) => {
                // 这里可以做登录判断，现在先全部放行
                return {
                    allowedContentTypes: ['video/mp4', 'video/webm', 'video/*'],
                    addRandomSuffix: true,
                    // 可以根据需要加 tokenPayload，上传完成后会回传给 onUploadCompleted
                    tokenPayload: JSON.stringify({}),
                };
            },
            onUploadCompleted: async ({ blob /*, tokenPayload */ }) => {
                // 上传完成后 Vercel 会再回调一次这个 Route
                console.log('[blob-upload] upload completed:', blob.url);
                // 这里你暂时不用做别的事情
            },
        });

        return res.status(200).json(jsonResponse);
    } catch (error: any) {
        console.error('[api/blob-upload] error:', error);
        return res.status(400).json({ error: error?.message || 'Upload error' });
    }
}
