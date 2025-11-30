import React, { useState, useCallback } from 'react';
import { analyzeScriptAndGeneratePrompts } from './services/geminiService';
import type { ScriptAnalysis } from './types';
import { FileUpload } from './components/FileUpload';
import { SpinnerIcon } from './components/icons/SpinnerIcon';
import { MusicIcon } from './components/icons/MusicIcon';
import { SunoGenerationPanel } from './components/SunoGenerationPanel';

const App: React.FC = () => {
    // ---------- Upload & input state ----------
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null); // ⭐ 保存视频文件本体
    const [scriptText, setScriptText] = useState<string>('');

    // ---------- Analysis state ----------
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);

    // ---------- Handlers ----------

    // 上传视频：同时保存预览 URL 和 File 本体（给 Gemini 多模态用）
    const handleVideoUpload = (file: File) => {
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        setVideoFile(file);
    };

    // 上传脚本文件：读取文本内容
    const handleScriptUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setScriptText(text || '');
        };
        reader.readAsText(file);
    };

    // 点击分析：脚本文本 +（可选）视频文件，多模态分析
    const handleAnalyzeScript = useCallback(async () => {
        // 至少要有一个输入：脚本 或 视频
        if (!scriptText.trim() && !videoFile) {
            setError('Please upload a video or provide a script/description.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setAnalysis(null);

        const TIMEOUT_MS = 120000; // 120 秒超时，防止一直卡住

        const analysisPromise = analyzeScriptAndGeneratePrompts(
            scriptText,
            videoFile || undefined
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini analysis timeout')), TIMEOUT_MS)
        );

        try {
            console.log('[Gemini] start multimodal analysis', {
                hasScript: !!scriptText.trim(),
                hasVideo: !!videoFile,
            });

            const result = (await Promise.race([
                analysisPromise,
                timeoutPromise,
            ])) as ScriptAnalysis;

            setAnalysis(result);
        } catch (err) {
            console.error('[Gemini] error', err);
            if (err instanceof Error) {
                setError(`An error occurred: ${err.message}`);
            } else {
                setError('An unknown error occurred during generation.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [scriptText, videoFile]);

    // ---------- Render ----------

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-950 to-black text-gray-100">
            {/* 顶部标题栏 */}
            <header className="border-b border-gray-800 bg-black/40 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center">
                            <MusicIcon className="h-5 w-5 text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">
                                AI Soundtrack Generator
                            </h1>
                            <p className="text-xs text-gray-400">
                                Upload video + script → AI analyzes → One-click Suno music
                            </p>
                        </div>
                    </div>
                    <span className="text-xs text-gray-500">
                        Gemini (multimodal) → Suno
                    </span>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-6">
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* 左侧：上传 + 文本输入 */}
                    <div className="space-y-6">
                        {/* 上传区 */}
                        <section className="bg-black/40 border border-gray-800 rounded-2xl p-5 shadow-xl shadow-black/40">
                            <h2 className="text-lg font-semibold mb-1 text-cyan-400">
                                1. Upload Assets
                            </h2>
                            <p className="text-xs text-gray-400 mb-4">
                                Upload your video and (optionally) a script/description. The
                                analysis will use <span className="font-semibold">both</span> if
                                available.
                            </p>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <FileUpload
                                    onFileUpload={handleVideoUpload}
                                    accept="video/*"
                                    label="Upload Video"
                                />
                                <FileUpload
                                    onFileUpload={handleScriptUpload}
                                    accept=".txt"
                                    label="Upload Script (.txt)"
                                />
                            </div>

                            {videoUrl && (
                                <div className="mt-5">
                                    <h3 className="font-semibold mb-2 text-sm text-gray-200">
                                        Video Preview
                                    </h3>
                                    <div className="relative rounded-xl overflow-hidden border border-gray-800 bg-black">
                                        <video
                                            controls
                                            src={videoUrl}
                                            className="w-full h-auto max-h-[320px] bg-black"
                                        />
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* 文本脚本输入 */}
                        <section className="bg-black/40 border border-gray-800 rounded-2xl p-5 shadow-xl shadow-black/40">
                            <h2 className="text-lg font-semibold mb-2 text-cyan-400">
                                2. Script / Description
                            </h2>
                            <p className="text-xs text-gray-400 mb-3">
                                You can paste or edit the script here. If left empty, the AI will
                                infer as much as it can from the video alone.
                            </p>

                            <textarea
                                value={scriptText}
                                onChange={(e) => setScriptText(e.target.value)}
                                placeholder="Paste your script or describe the video story, characters, emotions..."
                                className="w-full min-h-[180px] rounded-xl bg-black/50 border border-gray-800 focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/30 outline-none text-sm p-3 resize-vertical placeholder:text-gray-500"
                            />

                            <div className="mt-3 flex items-center justify-between">
                                <span className="text-[11px] text-gray-500">
                                    Tip: more detail → better matching soundtrack.
                                </span>
                                <span className="text-[11px] text-gray-500">
                                    {scriptText.length} chars
                                </span>
                            </div>
                        </section>
                    </div>

                    {/* 右侧：分析 + Suno 生成面板 */}
                    <div className="space-y-6">
                        {/* 分析结果 & 按钮 */}
                        <section className="bg-black/40 border border-gray-800 rounded-2xl p-5 shadow-xl shadow-black/40">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-cyan-400">
                                        3. Analyze & Generate Prompt
                                    </h2>
                                    <p className="text-xs text-gray-400">
                                        Gemini will analyze your video + script and create a
                                        soundtrack prompt for Suno.
                                    </p>
                                </div>
                                <button
                                    onClick={handleAnalyzeScript}
                                    disabled={isLoading}
                                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition 
                                        ${isLoading
                                            ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                                            : 'bg-cyan-500/90 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/40'
                                        }`}
                                >
                                    {isLoading ? (
                                        <>
                                            <SpinnerIcon className="h-4 w-4 animate-spin" />
                                            Analyzing...
                                        </>
                                    ) : (
                                        <>
                                            <MusicIcon className="h-4 w-4" />
                                            Analyze for Soundtrack
                                        </>
                                    )}
                                </button>
                            </div>

                            {error && (
                                <div className="mb-4 text-sm rounded-xl border border-red-800/60 bg-red-950/40 px-3 py-2 text-red-200">
                                    {error}
                                </div>
                            )}

                            {analysis ? (
                                <div className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3">
                                            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                                                Title
                                            </div>
                                            <div className="text-sm font-semibold text-gray-100">
                                                {analysis.title || 'Untitled soundtrack'}
                                            </div>
                                        </div>
                                        <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3">
                                            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                                                Mood
                                            </div>
                                            <div className="text-sm text-gray-100">
                                                {analysis.mood}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3">
                                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                                            Story Summary
                                        </div>
                                        <p className="text-sm text-gray-200 leading-relaxed">
                                            {analysis.summary}
                                        </p>
                                    </div>

                                    <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="text-[11px] uppercase tracking-wide text-gray-500">
                                                Music Prompt for Suno
                                            </div>
                                            <span className="text-[10px] text-gray-500">
                                                {analysis.music_prompt.length} chars
                                            </span>
                                        </div>
                                        <p className="text-sm text-cyan-100 leading-relaxed">
                                            {analysis.music_prompt}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 text-xs text-gray-500">
                                    Run an analysis to see a suggested title, mood, summary and a
                                    ready-to-use Suno music prompt here.
                                </div>
                            )}
                        </section>

                        {/* Suno 生成面板：用分析结果里的 music_prompt + title */}
                        <section className="bg-black/40 border border-gray-800 rounded-2xl p-5 shadow-xl shadow-black/40">
                            <SunoGenerationPanel
                                initialPrompt={analysis?.music_prompt || ''}
                                title={analysis?.title || 'AI Generated Soundtrack'}
                                isAnalyzing={isLoading}
                            />
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
