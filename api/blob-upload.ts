// api/blob-upload.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleClientUpload } from '@vercel/blob'; // 来自 @vercel/blob 的 helper

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 这里用 handleClientUpload 处理前端来的“小 JSON”，内部会和 Vercel Blob 交换 token。
        const jsonResponse = await handleClientUpload({
            request: req, // 在 Vercel Node 函数里是 IncomingMessage，库是支持的 
            onBeforeGenerateToken: async (pathname) => {
                // 这里可以做登录校验/授权；你现在是个人项目的话可以先不管，默认允许。
                return {
                    // 限制视频类型，防止乱传
                    allowedContentTypes: ['video/mp4', 'video/webm', 'video/*'],
                    addRandomSuffix: true,
                    // 最大 500MB，这个是 Blob 这边的上限，不是必须配这么大
                    maximumSizeInBytes: 500 * 1024 * 1024,
                };
            },
        });

        return res.status(200).json(jsonResponse);
    } catch (error: any) {
        console.error('[api/blob-upload] error:', error);
        return res.status(400).json({ error: error?.message || 'Upload error' });
    }
}
