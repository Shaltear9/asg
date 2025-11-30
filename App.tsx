
import React, { useState, useCallback } from 'react';
import { analyzeScriptAndGeneratePrompts } from './services/geminiService';
import type { ScriptAnalysis } from './types';
import { FileUpload } from './components/FileUpload';
import { SpinnerIcon } from './components/icons/SpinnerIcon';
import { MusicIcon } from './components/icons/MusicIcon';
import { SunoGenerationPanel } from './components/SunoGenerationPanel';
import { upload } from '@vercel/blob/client';
import type { PutBlobResult } from '@vercel/blob';

const App: React.FC = () => {
    const MAX_VIDEO_SIZE_MB = 20; // 你想要的最大体积，比如 20MB
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [scriptText, setScriptText] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null); // 用于 <video> 播放
    const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);       // Vercel Blob 返回的 url
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);

    
    // Analysis State
    const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);

    const handleVideoUpload = async (file: File) => {
        // 1) 先判断大小（单位：MB）
        const sizeMb = file.size / (1024 * 1024);
        if (sizeMb > MAX_VIDEO_SIZE_MB) {
            setError(
                `视频太大了（约 ${sizeMb.toFixed(
                    1
                )} MB）。当前最大支持 ${MAX_VIDEO_SIZE_MB} MB，请先压缩或裁剪后再上传。`
            );
            return;
        }

        // 2) 清理旧状态 & 进入“上传中”
        setError(null);
        setIsUploadingVideo(true);

        try {
            // 3) 上传到 Vercel Blob（真正的大文件只在这里走）
            const blob: PutBlobResult = await upload(file.name, file, {
                access: 'public',
                handleUploadUrl: '/api/blob-upload',
                multipart: true, // 大文件建议打开分片上传
                contentType: file.type || 'video/mp4',
            });

            // 4) 用 Blob URL 做预览 / 后续分析
            setVideoUrl(blob.url); // 你后面分析如果用的是 videoUrl，这里直接用它
        } catch (err) {
            console.error('[handleVideoUpload] upload error:', err);
            setError('视频上传到 Blob 失败，请稍后重试。');
            setVideoUrl(null);
        } finally {
            // 5) 无论成功失败，都结束“上传中”
            setIsUploadingVideo(false);
        }
    };

    const handleScriptUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setScriptText(text);
        };
        reader.readAsText(file);
    };

    const handleAnalyzeScript = useCallback(async () => {
        if (!scriptText.trim() && !videoBlobUrl) {
            setError('请至少上传一个视频，或输入一段剧本/描述。');
            return;
        }

        if (!videoBlobUrl) {
            // 为了避免你忘了等上传完就点 Analyze
            // 没有 blobUrl 说明视频还没成功上传
            setError('视频尚未上传完成，请稍候再试。');
            return;
        }

        setIsLoading(true);
        setError(null);
        setAnalysis(null);

        try {
            const result = await analyzeScriptAndGeneratePrompts(
                scriptText,
                videoBlobUrl
            );
            setAnalysis(result);
        } catch (err) {
            console.error(err);
            if (err instanceof Error) {
                setError(`An error occurred: ${err.message}`);
            } else {
                setError('An unknown error occurred during generation.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [scriptText, videoBlobUrl]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            <header className="bg-gray-800/50 backdrop-blur-sm p-4 border-b border-gray-700 fixed top-0 left-0 right-0 z-10">
                <div className="container mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MusicIcon className="h-8 w-8 text-cyan-400" />
                        <h1 className="text-2xl font-bold tracking-tight text-white">AI Soundtrack Generator</h1>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 pt-24">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Inputs */}
                    <div className="flex flex-col gap-6 p-6 bg-gray-800 rounded-xl border border-gray-700">
                        <div>
                            <h2 className="text-xl font-semibold mb-3 text-cyan-400">1. Upload Assets</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FileUpload onFileUpload={handleVideoUpload} accept="video/*" label={isUploadingVideo ? 'Uploading video…' : 'Upload Video'} />
                                <FileUpload onFileUpload={handleScriptUpload} accept=".txt" label="Upload Script (.txt)" />
                            </div>
                        </div>

                        {isUploadingVideo && (
                            <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                                <SpinnerIcon className="h-4 w-4 animate-spin" />
                                正在上传视频，请稍候…
                            </p>
                        )}

                        {videoPreviewUrl && (
                            <video
                                src={videoPreviewUrl}
                                controls
                                className="w-full rounded-lg mt-2"
                            />
                        )}
                        
                        <div>
                            <h2 className="text-xl font-semibold mb-3 text-cyan-400">2. Script / Description</h2>
                            <textarea
                                value={scriptText}
                                onChange={(e) => setScriptText(e.target.value)}
                                placeholder="Paste your video script or a detailed description here..."
                                className="w-full h-48 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors resize-none"
                            />
                        </div>
                        
                        <div className="mt-auto">
                            <button
                                onClick={handleAnalyzeScript}
                                disabled={
                                    isUploadingVideo ||               // 正在上传时禁用
                                    isLoading ||                      // 正在分析时禁用
                                    (!scriptText.trim() && !videoUrl) // 没脚本也没视频时禁用
                                }
                                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-[1.02] disabled:scale-100 shadow-lg shadow-cyan-900/30"
                            >
                                {isLoading ? (
                                    <>
                                        <SpinnerIcon className="h-5 w-5 animate-spin" />
                                        Analyzing Content...
                                    </>
                                ) : (
                                    'Analyze & Generate Prompt'
                                )}
                            </button>
                            {error && <p className="text-red-400 mt-3 text-center text-sm bg-red-900/20 p-2 rounded border border-red-900/50">{error}</p>}
                        </div>
                    </div>

                    {/* Right Column: Results */}
                    <div className="flex flex-col gap-6">
                        <h2 className="text-xl font-semibold text-cyan-400">3. Music Generation</h2>
                        
                        {!isLoading && !analysis && (
                            <div className="flex flex-col items-center justify-center h-full bg-gray-800 rounded-xl border border-gray-700 border-dashed p-12 text-gray-500 text-center">
                                <MusicIcon className="h-16 w-16 mb-4 opacity-50" />
                                <p className="text-lg font-medium">Waiting for analysis...</p>
                                <p className="text-sm mt-2">Upload a script and click Analyze to begin.</p>
                            </div>
                        )}

                        {(isLoading || analysis) && (
                             <SunoGenerationPanel 
                                initialPrompt={analysis?.music_prompt || ''}
                                title={analysis?.title || ''}
                                isAnalyzing={isLoading}
                            />
                        )}
                        
                        {analysis && !isLoading && (
                            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                                <h3 className="text-lg font-semibold text-white mb-3">Analysis Summary</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between border-b border-gray-700 pb-2">
                                        <span className="text-gray-400">Title Suggestion</span>
                                        <span className="text-cyan-300 font-medium">{analysis.title}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-gray-700 pb-2">
                                        <span className="text-gray-400">Mood</span>
                                        <span className="text-cyan-300 font-medium">{analysis.mood}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 block mb-1">Summary</span>
                                        <p className="text-gray-300 text-sm leading-relaxed">{analysis.summary}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
