import React, { useState, useEffect } from 'react';
import { generateMusic, pollForMusic } from '../services/sunoService';
import type { SunoTask } from '../types';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { MusicIcon } from './icons/MusicIcon';
import { SoundtrackPlayer } from './SoundtrackPlayer';
import { analyzeVideo } from "../services/videoService";

interface SunoGenerationPanelProps {
    initialPrompt: string;
    title: string;
    isAnalyzing: boolean;
}

export const SunoGenerationPanel: React.FC<SunoGenerationPanelProps> = ({ initialPrompt, title, isAnalyzing }) => {
    const [apiKey, setApiKey] = useState<string>(process.env.SUNO_API_KEY || '');
    const [prompt, setPrompt] = useState<string>(initialPrompt);
    const [instrumental, setInstrumental] = useState<boolean>(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [generatedTasks, setGeneratedTasks] = useState<SunoTask[]>([]);
    const [error, setError] = useState<string | null>(null);

    // 新增：视频相关 state
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);

    // Update local prompt when the prop changes
    useEffect(() => {
        if (initialPrompt) setPrompt(initialPrompt);
    }, [initialPrompt]);

    useEffect(() => {
        if (process.env.SUNO_API_KEY) {
            setApiKey(process.env.SUNO_API_KEY);
        }
    }, []);

    if (isAnalyzing) {
        return (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 flex flex-col items-center justify-center min-h-[300px]">
                <SpinnerIcon className="h-12 w-12 animate-spin text-cyan-500 mb-4" />
                <p className="text-gray-300 text-lg animate-pulse">Analyzing video content & composing prompt...</p>
            </div>
        );
    }

    if (!initialPrompt) return null;

    // 主流程：提交 Suno 任务
    const handleGenerate = async () => {
        if (!apiKey) {
            setError("Please enter a Suno API Key.");
            return;
        }
        setError(null);
        setIsGenerating(true);
        setGeneratedTasks([]);
        setStatusMessage("Submitting generation task...");

        try {
            const taskId = await generateMusic(
                prompt,
                apiKey,
                instrumental,
                title || "AI Soundtrack",
                "Cinematic"
            );

            setStatusMessage("Task submitted, waiting for generation...");

            const results = await pollForMusic(taskId, apiKey, (msg) => {
                setStatusMessage(msg);
            });

            setGeneratedTasks(results);
            setStatusMessage("");

        } catch (e: any) {
            console.error("Generation error:", e);
            setError(e.message || "Failed to generate music. Please check console for details.");
        } finally {
            setIsGenerating(false);
        }
    };

    // 新增：视频分析的处理函数
    const handleAnalyzeVideo = async () => {
        if (!videoFile) return;
        try {
            setIsAnalyzingVideo(true);
            const result = await analyzeVideo(videoFile);
            setPrompt(result);  // 自动写入音乐提示词
        } catch (err: any) {
            alert("视频分析失败：" + err.message);
        } finally {
            setIsAnalyzingVideo(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-cyan-900/50 rounded-xl p-6 shadow-lg">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 border-b border-gray-700 pb-4">
                <div className="p-2 bg-cyan-900/30 rounded-full">
                    <MusicIcon className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Suno Music Generator</h3>
                    <p className="text-sm text-gray-400">One video, one unique soundtrack.</p>
                </div>
            </div>

            {/* SUNO API KEY INPUT */}
            {!process.env.SUNO_API_KEY && (
                <div className="mb-6">
                    <label className="block text-xs text-gray-400 mb-1 uppercase font-semibold">Suno API Key</label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your Suno API Key..."
                        className="w-full bg-black/20 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none transition-colors"
                    />
                </div>
            )}

            {/* NEW: Video Upload */}
            <div className="mb-6 p-4 border border-gray-700 rounded-lg bg-black/20">
                <label className="block text-xs text-gray-400 mb-2 uppercase font-semibold">
                    Upload Video (AI will analyze & create prompt)
                </label>

                <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setVideoFile(f);
                    }}
                    className="text-gray-300"
                />

                {videoFile && (
                    <button
                        onClick={handleAnalyzeVideo}
                        disabled={isAnalyzingVideo}
                        className="mt-3 w-full py-2 rounded-lg text-sm font-semibold text-white bg-cyan-700 hover:bg-cyan-600 transition-all disabled:opacity-50"
                    >
                        {isAnalyzingVideo ? "Analyzing video..." : "Analyze Video & Generate Prompt"}
                    </button>
                )}
            </div>

            {/* TEXT PROMPT INPUT */}
            <div className="mb-6">
                <label className="block text-xs text-gray-400 mb-1 uppercase font-semibold">Music Description Prompt</label>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="w-full bg-black/30 border border-gray-700 rounded-lg p-3 text-sm text-cyan-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-all"
                />
                <div className="mt-2 flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="instrumental"
                        checked={instrumental}
                        onChange={(e) => setInstrumental(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-700 text-cyan-500 focus:ring-cyan-500"
                    />
                    <label htmlFor="instrumental" className="text-sm text-gray-300 select-none cursor-pointer">
                        Instrumental (No Lyrics)
                    </label>
                </div>
            </div>

            {/* ERRORS */}
            {error && (
                <div className="p-4 bg-red-900/20 border border-red-800/50 text-red-300 rounded-lg mb-6 text-sm flex items-start gap-2 break-words">
                    <span className="text-xl shrink-0">⚠️</span>
                    <span>{error}</span>
                </div>
            )}

            {/* RESULTS */}
            {generatedTasks.length > 0 ? (
                <div className="animate-in fade-in duration-500 space-y-6">
                    <div className="flex items-center justify-between">
                        <h4 className="text-green-400 font-semibold">✓ Generation Complete</h4>
                        <button
                            onClick={() => setGeneratedTasks([])}
                            className="text-xs text-gray-500 hover:text-white underline"
                        >
                            Start Over
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {generatedTasks.map((task) => (
                            <div key={task.id} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold text-white">
                                        {task.title || title || "Generated Track"}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${task.status === 'SUCCESS'
                                        ? 'bg-green-900 text-green-300'
                                        : 'bg-red-900 text-red-300'}`}>
                                        {task.status}
                                    </span>
                                </div>

                                {task.status === 'SUCCESS' && task.audio_url && (
                                    <SoundtrackPlayer audioUrl={task.audio_url} isGenerating={false} />
                                )}

                                {task.status === 'FAILURE' && (
                                    <p className="text-xs text-red-400 mt-2">Generation failed for this track.</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !apiKey}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-all shadow-lg shadow-blue-900/20 transform hover:scale-[1.01]"
                >
                    {isGenerating ? (
                        <>
                            <SpinnerIcon className="h-5 w-5 animate-spin" />
                            <span className="text-sm">{statusMessage || "Generating..."}</span>
                        </>
                    ) : (
                        'Generate Music'
                    )}
                </button>
            )}
        </div>
    );
};
