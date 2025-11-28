import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import busboy from "busboy";

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const bb = busboy({ headers: req.headers });

    let videoBuffer: Buffer | null = null;

    bb.on("file", (_, fileStream) => {
        const chunks: Buffer[] = [];
        fileStream.on("data", (data) => chunks.push(data));
        fileStream.on("end", () => {
            videoBuffer = Buffer.concat(chunks);
        });
    });

    bb.on("finish", async () => {
        if (!videoBuffer) {
            return res.status(400).json({ error: "No video uploaded" });
        }

        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
            });

            const result = await model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                inlineData: {
                                    mimeType: "video/mp4",
                                    data: videoBuffer.toString("base64"),
                                },
                            },
                            {
                                text:
                                    "请详细分析这段视频，输出场景、情绪、颜色风格、节奏感、主体动作、环境氛围，最终给出一个适合用于背景音乐生成的简洁提示词。",
                            },
                        ],
                    },
                ],
            });

            const description = result.response.text();
            return res.status(200).json({ description });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    req.pipe(bb);
}
