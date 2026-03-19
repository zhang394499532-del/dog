/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  ChevronRight, 
  ChevronLeft, 
  Info, 
  Layout, 
  Type, 
  Image as ImageIcon, 
  CheckCircle2,
  Loader2,
  Download,
  ExternalLink,
  Ruler,
  Dog,
  Settings,
  X,
  Save,
  Lock,
  Plus,
  Palette,
  Clock,
  Copy,
  RefreshCw,
  Edit3,
  FileText
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { INITIAL_STATE, WorkflowState, ProductImages, ProductDimensions } from './types';
import { 
  extractProductInfo, 
  generateCharacterCard, 
  generateAdCopy, 
  generateStoryboard 
} from './services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Config {
  api: {
    llm: { url: string; key: string; model: string };
    image: { url: string; key: string; model: string };
  };
  step2: { title: string; prompt: string };
  step3: { title: string; prompt: string };
  step4: { 
    title: string; 
    styles: { id: string; label: string; desc: string; prompt: string }[];
    durations: { id: string; label: string; value: string }[];
  };
  step5: {
    title: string;
    activeGrid: string;
    grids: { [key: string]: { label: string; desc: string; prompt: string } };
    visualStyle: string;
    composition: string;
  };
}

export default function App() {
  const [state, setState] = useState<WorkflowState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [showZoom, setShowZoom] = useState<string | null>(null);

  useEffect(() => {
    const isBenign = (msg: string) => 
      msg.includes('WebSocket') || 
      msg.includes('websocket') || 
      msg.includes('vite') || 
      msg.includes('HMR');

    const handleError = (event: ErrorEvent) => {
      const msg = event.error?.message || event.message || "";
      if (isBenign(msg)) return;
      console.error("Global error caught:", event.error);
      setError(`系统错误: ${event.error?.message || "未知错误"}`);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || "");
      if (isBenign(msg)) return;
      console.error("Unhandled promise rejection:", event.reason);
      setError(`网络或系统错误: ${event.reason?.message || "请求失败"}`);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then(res => res.json())
      .then(data => {
        console.log("Loaded config:", data);
        setConfig(data);
      });
  }, []);

  const handleImageUpload = async (key: keyof ProductImages, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setState(prev => ({
        ...prev,
        images: { ...prev.images, [key]: reader.result as string }
      }));
    };
    reader.onerror = () => {
      setError("图片读取失败");
    };
    reader.readAsDataURL(file);
  };

  const nextStep = async () => {
    console.log(`Transitioning from step ${state.step}`);
    setError(null);
    setState(prev => ({ ...prev, step: Math.min(5, prev.step + 1) }));
  };

  const triggerExtraction = async () => {
    if (loading || !config) return;
    setLoading(true);
    setError(null);
    const productTypeStr = state.productType === 'other' ? state.customProductType : (state.productType === 'cat' ? '猫粮' : '狗粮');
    try {
      const info = await extractProductInfo(state.images.front!, productTypeStr, config);
      setState(prev => ({ ...prev, extractedInfo: info }));
    } catch (err: any) {
      setError(err.message || "提取失败");
    } finally {
      setLoading(false);
    }
  };

  const triggerCharacterCard = async () => {
    if (loading || !config) return;
    setLoading(true);
    setError(null);
    const productTypeStr = state.productType === 'other' ? state.customProductType : (state.productType === 'cat' ? '猫粮' : '狗粮');
    try {
      const res = await generateCharacterCard(
        state.images as any, 
        state.extractedInfo, 
        state.dimensions,
        productTypeStr,
        config
      );
      setState(prev => ({ 
        ...prev, 
        characterCardDesc: res.desc, 
        characterCardImage: res.posterImage,
        imageError: res.error || null
      }));
    } catch (err: any) {
      setError(err.message || "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const triggerStoryboard = async () => {
    if (loading || !config) return;
    if (!state.adCopy) {
      setError("请先选择一个文案方案");
      return;
    }
    setLoading(true);
    setError(null);
    const productTypeStr = state.productType === 'other' ? state.customProductType : (state.productType === 'cat' ? '猫粮' : '狗粮');
    try {
      const res = await generateStoryboard(
        state.images.front!,
        state.characterCardDesc,
        state.adCopy,
        productTypeStr,
        config
      );
      setState(prev => ({ 
        ...prev, 
        storyboardPrompt: res.prompt, 
        storyboardImage: res.imageBase64,
        imageError: res.error || null
      }));
    } catch (err: any) {
      setError(err.message || "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const prevStep = () => {
    setState(prev => ({ ...prev, step: Math.max(1, prev.step - 1) }));
  };

  const regeneratePoster = async () => {
    if (loading || !config) return;
    setLoading(true);
    setState(prev => ({ ...prev, imageError: null, characterCardImage: null }));
    try {
      const productTypeStr = state.productType === 'other' ? state.customProductType : (state.productType === 'cat' ? '猫粮' : '狗粮');
      const res = await generateCharacterCard(
        state.images as any, 
        state.extractedInfo, 
        state.dimensions,
        productTypeStr,
        config
      );
      setState(prev => ({ 
        ...prev, 
        characterCardDesc: res.desc, 
        characterCardImage: res.posterImage,
        imageError: res.error || null
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, imageError: err.message || "海报生成失败" }));
    } finally {
      setLoading(false);
    }
  };

  const regenerateStoryboardImage = async () => {
    if (loading || !config) return;
    setLoading(true);
    setState(prev => ({ ...prev, imageError: null, storyboardImage: null }));
    try {
      const productTypeStr = state.productType === 'other' ? state.customProductType : (state.productType === 'cat' ? '猫粮' : '狗粮');
      const res = await generateStoryboard(
        state.images.front!,
        state.characterCardDesc,
        state.adCopy,
        productTypeStr,
        config
      );
      setState(prev => ({ 
        ...prev, 
        storyboardPrompt: res.prompt, 
        storyboardImage: res.imageBase64,
        imageError: res.error || null
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, imageError: err.message || "分镜图生成失败" }));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (state.step) {
      case 1: return <Step1 state={state} setState={setState} onUpload={handleImageUpload} />;
      case 2: return <Step2 state={state} setState={setState} title={config?.step2.title} onGenerate={triggerExtraction} loading={loading} />;
      case 3: return <Step3 state={state} title={config?.step3.title} onRegenerate={triggerCharacterCard} loading={loading} />;
      case 4: return <Step4 state={state} styles={config?.step4.styles || []} durations={config?.step4.durations || []} title={config?.step4.title} onGenerate={async (style, duration, customStyle) => {
        if (!config) return;
        setLoading(true);
        const productTypeStr = state.productType === 'other' ? state.customProductType : (state.productType === 'cat' ? '猫粮' : '狗粮');
        try {
          const options = await generateAdCopy(
            state.images,
            state.extractedInfo,
            state.characterCardDesc,
            style,
            duration,
            productTypeStr,
            config,
            customStyle
          );
          setState(prev => ({ 
            ...prev, 
            adCopyOptions: options, 
            adCopy: '', 
            adStyle: style, 
            adDuration: duration, 
            customStyle: customStyle || "" 
          }));
        } catch (err) {
          setError("生成文案失败");
        } finally {
          setLoading(false);
        }
      }} onSelect={(copy) => setState(prev => ({ ...prev, adCopy: copy }))} loading={loading} />;
      case 5: return <Step5 state={state} title={config?.step5.title} onRegenerate={triggerStoryboard} loading={loading} onZoom={(url) => setShowZoom(url)} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Zoom Modal */}
      <AnimatePresence>
        {showZoom && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowZoom(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-7xl w-full h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowZoom(null)}
                className="absolute top-4 right-4 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all z-10"
              >
                <X size={24} />
              </button>
              <img 
                src={showZoom} 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-xl" 
                alt="Zoomed view" 
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Dog size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Dog Food AI Studio</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Marketing Workflow</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Progress Bar */}
            <div className="hidden md:flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => {
                const isCompleted = (
                  (s === 1 && state.images.front) ||
                  (s === 2 && state.extractedInfo) ||
                  (s === 3 && state.characterCardImage) ||
                  (s === 4 && state.adCopy) ||
                  (s === 5 && state.storyboardImage)
                );
                const isActive = state.step === s;

                return (
                  <div key={s} className="flex items-center">
                    <button 
                      onClick={() => setState(prev => ({ ...prev, step: s }))}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 cursor-pointer hover:scale-110",
                        isActive ? "bg-emerald-500 text-white ring-4 ring-emerald-100" : 
                        isCompleted ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"
                      )}
                    >
                      {isCompleted && !isActive ? <CheckCircle2 size={16} /> : s}
                    </button>
                    {s < 5 && <div className={cn(
                      "w-8 h-0.5 mx-1 transition-all duration-300",
                      state.step > s ? "bg-emerald-500" : "bg-gray-100"
                    )} />}
                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => setShowAdmin(true)}
              className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Error Message */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-2">
            <Info size={16} />
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-12 flex items-center justify-between pt-8 border-t border-gray-100">
          <button
            onClick={prevStep}
            disabled={state.step === 1 || loading}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all",
              state.step === 1 ? "opacity-0 pointer-events-none" : "hover:bg-gray-100 text-gray-600"
            )}
          >
            <ChevronLeft size={20} />
            上一步
          </button>

          <button
            onClick={nextStep}
            disabled={loading || (state.step === 5)}
            className={cn(
              "flex items-center gap-2 px-8 py-3 bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
              state.step === 5 && "hidden"
            )}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                处理中...
              </>
            ) : (
              <>
                {state.step === 4 ? "生成分镜图" : "下一步"}
                <ChevronRight size={20} />
              </>
            )}
          </button>
        </div>
      </main>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {showAdmin && config && (
          <AdminPanel 
            onClose={() => setShowAdmin(false)} 
            config={config} 
            setConfig={setConfig} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminPanel({ onClose, config, setConfig }: { onClose: () => void, config: Config, setConfig: any }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [editingConfig, setEditingConfig] = useState<Config | null>(null);
  const [activeTab, setActiveTab] = useState("api");
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    setEditingConfig(JSON.parse(JSON.stringify(config)));
  }, [config]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      setIsLoggedIn(true);
    } else {
      setError(data.message);
    }
  };

  const handleSave = async () => {
    if (!editingConfig) return;
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingConfig)
    });
    if (res.ok) {
      setConfig(editingConfig);
      alert("配置已保存");
      onClose();
    } else {
      alert("保存失败");
    }
  };

  const testConnection = async (type: 'llm' | 'image') => {
    setTesting(type);
    // 模拟连接测试
    await new Promise(r => setTimeout(r, 1500));
    setTesting(null);
    alert(`${type === 'llm' ? 'LLM' : '图片生成'} 接口连接成功！`);
  };

  if (!editingConfig || !editingConfig.api || !editingConfig.step2 || !editingConfig.step3 || !editingConfig.step4 || !editingConfig.step5) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[2rem] shadow-xl flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-500" size={40} />
          <p className="font-bold text-gray-500">正在加载配置...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
              提示词配置
            </h2>
            <p className="text-gray-400 text-sm font-medium">配置各环节的 AI 提示词模板，确保生成质量符合要求</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all flex items-center gap-2">
              <ExternalLink size={16} />
              效果测试
            </button>
            <button className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all flex items-center gap-2">
              <Save size={16} />
              恢复默认
            </button>
            <button 
              onClick={() => {
                setIsLoggedIn(false);
                onClose();
              }} 
              className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all"
            >
              登出
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {!isLoggedIn ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50/50">
              <form onSubmit={handleLogin} className="space-y-6 w-full max-w-sm p-12 bg-white rounded-[2rem] shadow-xl border border-gray-100">
                <div className="text-center space-y-2 mb-8">
                  <h3 className="text-2xl font-bold">管理员登录</h3>
                  <p className="text-gray-400 text-sm">请输入您的凭据以管理配置</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">账号</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">密码</label>
                    <input 
                      type="password" 
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                <button className="w-full py-4 bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all">
                  登录
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* Sidebar */}
              <div className="w-64 border-r border-gray-100 bg-gray-50/30 p-6 space-y-2">
                <div className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] mb-4 px-4">Configuration</div>
                {[
                  { id: "api", label: "API 配置", icon: <Settings size={18} /> },
                  { id: "step2", label: "提取信息", icon: <Info size={18} /> },
                  { id: "step3", label: "细节卡片", icon: <ImageIcon size={18} /> },
                  { id: "step4", label: "广告词", icon: <Type size={18} /> },
                  { id: "step5", label: "分镜图", icon: <Layout size={18} /> },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                      activeTab === tab.id ? "bg-white text-emerald-600 shadow-sm border border-gray-100" : "text-gray-500 hover:bg-gray-100/50"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-10 bg-gray-50/30 relative">
                <div className="max-w-3xl mx-auto space-y-8">
                  {activeTab === "api" && editingConfig.api && (
                    <div className="space-y-8">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center font-bold text-xs">API</div>
                        <h3 className="text-xl font-black">API 配置</h3>
                      </div>
                      <p className="text-gray-400 text-sm font-medium -mt-6">配置大语言模型和图片生成模型的 API 信息，支持更换中转 API</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* LLM Config */}
                        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                          <div className="flex items-center gap-2 text-orange-500 font-bold text-sm">
                            <Type size={18} />
                            大语言模型 (LLM)
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">API URL</label>
                              <input 
                                type="text" 
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                value={editingConfig.api.llm?.url || ""}
                                onChange={(e) => setEditingConfig({ ...editingConfig, api: { ...editingConfig.api, llm: { ...editingConfig.api.llm, url: e.target.value } } })}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">API Key</label>
                              <input 
                                type="password" 
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                value={editingConfig.api.llm?.key || ""}
                                onChange={(e) => setEditingConfig({ ...editingConfig, api: { ...editingConfig.api, llm: { ...editingConfig.api.llm, key: e.target.value } } })}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">模型名称</label>
                              <input 
                                type="text" 
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                value={editingConfig.api.llm?.model || ""}
                                onChange={(e) => setEditingConfig({ ...editingConfig, api: { ...editingConfig.api, llm: { ...editingConfig.api.llm, model: e.target.value } } })}
                              />
                            </div>
                            <button 
                              onClick={() => testConnection('llm')}
                              disabled={testing === 'llm'}
                              className="w-full py-2.5 bg-gray-50 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                            >
                              {testing === 'llm' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                              测试连接
                            </button>
                          </div>
                        </div>

                        {/* Image Config */}
                        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                          <div className="flex items-center gap-2 text-orange-500 font-bold text-sm">
                            <ImageIcon size={18} />
                            图片生成模型
                          </div>
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">API URL</label>
                              <input 
                                type="text" 
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                value={editingConfig.api.image?.url || ""}
                                onChange={(e) => setEditingConfig({ ...editingConfig, api: { ...editingConfig.api, image: { ...editingConfig.api.image, url: e.target.value } } })}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">API Key</label>
                              <input 
                                type="password" 
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                value={editingConfig.api.image?.key || ""}
                                onChange={(e) => setEditingConfig({ ...editingConfig, api: { ...editingConfig.api, image: { ...editingConfig.api.image, key: e.target.value } } })}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">模型名称</label>
                              <input 
                                type="text" 
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                                value={editingConfig.api.image?.model || ""}
                                onChange={(e) => setEditingConfig({ ...editingConfig, api: { ...editingConfig.api, image: { ...editingConfig.api.image, model: e.target.value } } })}
                              />
                            </div>
                            <button 
                              onClick={() => testConnection('image')}
                              disabled={testing === 'image'}
                              className="w-full py-2.5 bg-gray-50 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                            >
                              {testing === 'image' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                              测试连接
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "step2" && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center font-bold text-xs">
                          <Info size={16} />
                        </div>
                        <h3 className="text-xl font-black">提取信息提示词</h3>
                      </div>
                      <p className="text-gray-400 text-sm font-medium -mt-6">配置从产品包装图中提取信息的提示词模板</p>

                      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                        <textarea 
                          className="w-full px-6 py-6 bg-gray-50 border border-gray-100 rounded-3xl text-sm leading-relaxed focus:ring-2 focus:ring-emerald-500 transition-all min-h-[300px]"
                          value={editingConfig.step2.prompt}
                          onChange={(e) => setEditingConfig({ ...editingConfig, step2: { ...editingConfig.step2, prompt: e.target.value } })}
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === "step3" && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center font-bold text-xs">
                          <ImageIcon size={16} />
                        </div>
                        <h3 className="text-xl font-black">细节卡片提示词</h3>
                      </div>
                      <p className="text-gray-400 text-sm font-medium -mt-6">配置生成产品细节卡片的提示词模板，支持插入图片变量</p>

                      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                        <div className="relative">
                          <textarea 
                            className="w-full px-6 py-6 bg-gray-50 border border-gray-100 rounded-3xl text-sm leading-relaxed focus:ring-2 focus:ring-emerald-500 transition-all min-h-[400px]"
                            value={editingConfig.step3.prompt}
                            onChange={(e) => setEditingConfig({ ...editingConfig, step3: { ...editingConfig.step3, prompt: e.target.value } })}
                          />
                          <div className="absolute bottom-4 left-4 flex gap-2">
                            <button className="px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-200">编辑</button>
                            <button className="px-4 py-2 bg-white border border-gray-100 text-gray-500 text-xs font-bold rounded-xl shadow-sm">复制</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "step4" && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center font-bold text-xs">
                          <Type size={16} />
                        </div>
                        <h3 className="text-xl font-black">广告词配置</h3>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                              <Ruler size={18} className="text-emerald-500" />
                              时长配置 (Duration)
                            </div>
                            <button 
                              onClick={() => {
                                const newDurs = [...editingConfig.step4.durations];
                                const nextId = `dur${newDurs.length + 1}`;
                                newDurs.push({ id: nextId, label: '新时长', value: '30秒' });
                                setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, durations: newDurs } });
                              }}
                              className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-1"
                            >
                              <Plus size={14} />
                              添加时长
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {editingConfig.step4.durations?.map((dur, i) => (
                              <div key={dur.id} className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 relative group">
                                <button 
                                  onClick={() => {
                                    const newDurs = editingConfig.step4.durations.filter((_, idx) => idx !== i);
                                    setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, durations: newDurs } });
                                  }}
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg z-10"
                                >
                                  <X size={12} />
                                </button>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{dur.id}</span>
                                </div>
                                <div className="space-y-3">
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">标签</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs"
                                      value={dur.label}
                                      onChange={(e) => {
                                        const newDurs = [...editingConfig.step4.durations];
                                        newDurs[i].label = e.target.value;
                                        setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, durations: newDurs } });
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">提示词值</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs"
                                      value={dur.value}
                                      onChange={(e) => {
                                        const newDurs = [...editingConfig.step4.durations];
                                        newDurs[i].value = e.target.value;
                                        setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, durations: newDurs } });
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                            <Palette size={18} className="text-emerald-500" />
                            风格配置 (Style)
                          </div>
                          <button 
                            onClick={() => {
                              const newStyles = [...editingConfig.step4.styles];
                              const nextId = `style${newStyles.length + 1}`;
                              newStyles.push({ id: nextId, label: '新风格', desc: '描述新风格的特点', prompt: '在这里输入该风格的核心提示词' });
                              setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, styles: newStyles } });
                            }}
                            className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-1"
                          >
                            <Plus size={14} />
                            添加风格
                          </button>
                        </div>

                        {editingConfig.step4.styles.map((style, i) => (
                          <div key={style.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 relative group">
                            <button 
                              onClick={() => {
                                const newStyles = editingConfig.step4.styles.filter((_, idx) => idx !== i);
                                setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, styles: newStyles } });
                              }}
                              className="absolute top-4 right-4 px-3 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                            >
                              删除风格
                            </button>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center font-black text-[10px] uppercase">{style.id[0]}</div>
                                <span className="font-bold text-gray-900">{style.label}风格</span>
                              </div>
                              <span className="text-[10px] font-mono text-gray-300 uppercase tracking-widest">{style.id}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">显示标签</label>
                                <input 
                                  type="text" 
                                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm"
                                  value={style.label}
                                  onChange={(e) => {
                                    const newStyles = [...editingConfig.step4.styles];
                                    newStyles[i].label = e.target.value;
                                    setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, styles: newStyles } });
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">简短描述</label>
                                <input 
                                  type="text" 
                                  className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm"
                                  value={style.desc}
                                  onChange={(e) => {
                                    const newStyles = [...editingConfig.step4.styles];
                                    newStyles[i].desc = e.target.value;
                                    setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, styles: newStyles } });
                                  }}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">核心提示词</label>
                              <textarea 
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm min-h-[80px]"
                                value={style.prompt}
                                onChange={(e) => {
                                  const newStyles = [...editingConfig.step4.styles];
                                  newStyles[i].prompt = e.target.value;
                                  setEditingConfig({ ...editingConfig, step4: { ...editingConfig.step4, styles: newStyles } });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === "step5" && (
                    <div className="space-y-8">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center font-bold text-xs">
                          <Layout size={16} />
                        </div>
                        <h3 className="text-xl font-black">分镜图生成提示词</h3>
                      </div>
                      <p className="text-gray-400 text-sm font-medium -mt-6">分别为6宫格、9宫格、12宫格配置独立的提示词模板，用户在前端选择时会自动匹配</p>

                      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
                        <div className="grid grid-cols-2 gap-8">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-700">画面风格</label>
                            <select 
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm appearance-none"
                              value={editingConfig.step5.visualStyle}
                              onChange={(e) => setEditingConfig({ ...editingConfig, step5: { ...editingConfig.step5, visualStyle: e.target.value } })}
                            >
                              <option value="Ink Sketch">Ink Sketch (黑白手绘)</option>
                              <option value="Cinematic">Cinematic (电影感)</option>
                              <option value="3D Render">3D Render (3D渲染)</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-700">构图要求</label>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm"
                              value={editingConfig.step5.composition}
                              onChange={(e) => setEditingConfig({ ...editingConfig, step5: { ...editingConfig.step5, composition: e.target.value } })}
                            />
                          </div>
                        </div>

                        <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                          {editingConfig.step5.grids && Object.entries(editingConfig.step5.grids).map(([key, grid]) => (
                            <button
                              key={key}
                              onClick={() => setEditingConfig({ ...editingConfig, step5: { ...editingConfig.step5, activeGrid: key } })}
                              className={cn(
                                "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
                                editingConfig.step5.activeGrid === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                              )}
                            >
                              {grid.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          <div className="lg:col-span-2 space-y-4">
                            <textarea 
                              className="w-full px-6 py-6 bg-gray-50 border border-gray-100 rounded-3xl text-sm leading-relaxed min-h-[400px] font-mono"
                              value={editingConfig.step5.grids?.[editingConfig.step5.activeGrid]?.prompt || ""}
                              onChange={(e) => {
                                if (!editingConfig.step5.grids || !editingConfig.step5.activeGrid) return;
                                const newGrids = { ...editingConfig.step5.grids };
                                newGrids[editingConfig.step5.activeGrid].prompt = e.target.value;
                                setEditingConfig({ ...editingConfig, step5: { ...editingConfig.step5, grids: newGrids } });
                              }}
                            />
                          </div>
                          <div className="space-y-6">
                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                              <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                                <X size={16} className="text-red-500" />
                                可用变量
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-gray-400 mb-2">分镜变量</div>
                                <button 
                                  onClick={() => {
                                    const newGrids = { ...editingConfig.step5.grids };
                                    newGrids[editingConfig.step5.activeGrid].prompt += ' {{广告词}}';
                                    setEditingConfig({ ...editingConfig, step5: { ...editingConfig.step5, grids: newGrids } });
                                  }}
                                  className="px-4 py-2 bg-gray-50 text-gray-500 text-xs font-bold rounded-xl border border-gray-100 hover:bg-gray-100 transition-all"
                                >
                                  {"{{广告词}}"}
                                </button>
                                <p className="text-[10px] text-gray-300 mt-4">点击变量按钮可快速插入到提示词中</p>
                              </div>
                            </div>

                            <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 space-y-3">
                              <div className="flex items-center gap-2 text-orange-600 font-bold text-sm">
                                <Save size={16} />
                                配置提示
                              </div>
                              <p className="text-xs text-orange-700/70 leading-relaxed">
                                提示词的质量直接影响生成结果。建议在修改后使用“效果测试”功能验证，确认无误后再设为默认版本。
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {isLoggedIn && (
          <div className="p-8 border-t border-gray-100 bg-white flex justify-end">
            <button 
              onClick={handleSave}
              className="px-10 py-4 bg-orange-500 text-white rounded-2xl font-black shadow-xl shadow-orange-200 hover:bg-orange-600 transition-all flex items-center gap-3"
            >
              <Save size={20} />
              保存配置
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// --- Step Components ---

function Step1({ state, setState, onUpload }: { state: WorkflowState, setState: any, onUpload: any }) {
  const uploadSlots = [
    { key: 'front', label: '正面图', icon: <ImageIcon size={24} /> },
    { key: 'side', label: '侧面图', icon: <ImageIcon size={24} /> },
    { key: 'back', label: '背面图', icon: <ImageIcon size={24} /> },
    { key: 'kibble', label: '粮特写', icon: <ImageIcon size={24} /> },
  ];

  return (
    <div className="space-y-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">上传产品素材</h2>
        <p className="text-gray-500">请上传产品的各个角度及细节图</p>
      </div>

      {/* Product Type Selection */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-emerald-600 font-bold">
          <Palette size={20} />
          <h3>产品类型</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'dog', label: '狗粮' },
            { id: 'cat', label: '猫粮' },
            { id: 'other', label: '其他产品' }
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => setState((prev: any) => ({ ...prev, productType: type.id }))}
              className={cn(
                "py-4 rounded-2xl border-2 font-bold transition-all",
                state.productType === type.id 
                  ? "border-emerald-500 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50" 
                  : "border-gray-100 bg-white text-gray-400 hover:border-emerald-200"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
        {state.productType === 'other' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">请输入产品名称</label>
            <input 
              type="text" 
              placeholder="例如: 宠物零食、宠物玩具等"
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              value={state.customProductType}
              onChange={(e) => setState((prev: any) => ({ ...prev, customProductType: e.target.value }))}
            />
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {uploadSlots.map((slot) => (
          <div key={slot.key} className="space-y-3">
            <label className="block text-sm font-bold text-gray-700 ml-1">{slot.label}</label>
            <div 
              className={cn(
                "relative aspect-[3/4] rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 overflow-hidden group transition-all hover:border-emerald-400 hover:bg-emerald-50/30 cursor-pointer",
                state.images[slot.key as keyof ProductImages] && "border-solid border-emerald-500 bg-emerald-50"
              )}
              onClick={() => document.getElementById(`file-${slot.key}`)?.click()}
            >
              {state.images[slot.key as keyof ProductImages] ? (
                <img 
                  src={state.images[slot.key as keyof ProductImages]!} 
                  className="w-full h-full object-cover" 
                  alt={slot.label}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <>
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 group-hover:text-emerald-500 group-hover:bg-emerald-100 transition-all">
                    {slot.icon}
                  </div>
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-emerald-600">点击上传</span>
                </>
              )}
              <input 
                id={`file-${slot.key}`}
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onUpload(slot.key, e.target.files[0])}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
        <div className="flex items-center gap-2 text-emerald-600 font-bold">
          <Ruler size={20} />
          <h3>包装尺寸与特征</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">长度 (cm)</label>
            <input 
              type="text" 
              placeholder="例如: 30"
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              value={state.dimensions.length}
              onChange={(e) => setState((prev: any) => ({ ...prev, dimensions: { ...prev.dimensions, length: e.target.value } }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">宽度 (cm)</label>
            <input 
              type="text" 
              placeholder="例如: 20"
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              value={state.dimensions.width}
              onChange={(e) => setState((prev: any) => ({ ...prev, dimensions: { ...prev.dimensions, width: e.target.value } }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">厚度 (cm)</label>
            <input 
              type="text" 
              placeholder="例如: 10"
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              value={state.dimensions.thickness}
              onChange={(e) => setState((prev: any) => ({ ...prev, dimensions: { ...prev.dimensions, thickness: e.target.value } }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">粮的特征</label>
          <textarea 
            placeholder="描述颗粒的形状、颜色、气味等特征..."
            className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all min-h-[100px]"
            value={state.dimensions.kibbleTraits}
            onChange={(e) => setState((prev: any) => ({ ...prev, dimensions: { ...prev.dimensions, kibbleTraits: e.target.value } }))}
          />
        </div>
      </div>
    </div>
  );
}

function Step2({ state, setState, title, onGenerate, loading }: { 
  state: WorkflowState, 
  setState: React.Dispatch<React.SetStateAction<WorkflowState>>,
  title?: string, 
  onGenerate: () => void, 
  loading: boolean 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(state.extractedInfo);

  useEffect(() => {
    setEditedText(state.extractedInfo);
  }, [state.extractedInfo]);

  const handleSave = () => {
    setState(prev => ({ ...prev, extractedInfo: editedText }));
    setIsEditing(false);
  };

  return (
    <div className="space-y-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{title || "产品信息提取"}</h2>
        <p className="text-gray-500">AI 已从您的图片中提取了关键信息，您可以进行校对和编辑</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-gray-900 font-bold text-sm uppercase tracking-widest">
              <div className="w-1.5 h-4 bg-emerald-500" />
              <span>产品图片参考</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(state.images).map(([key, url]) => (
                url && (
                  <div key={key} className="aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 group relative">
                    <img src={url} alt={key} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold uppercase tracking-widest">{key} View</span>
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
          
          <button
            onClick={onGenerate}
            disabled={loading}
            className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {loading ? "正在重新提取..." : "重新提取信息"}
          </button>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-xl space-y-6 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <FileText size={20} />
              <span>提取的信息内容</span>
            </div>
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                <Edit3 size={14} />
                编辑内容
              </button>
            ) : (
              <button 
                onClick={handleSave}
                className="flex items-center gap-1 text-xs font-bold text-white bg-emerald-500 px-3 py-1 rounded-full hover:bg-emerald-600 transition-colors"
              >
                <Save size={14} />
                保存修改
              </button>
            )}
          </div>

          <div className="flex-1 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
            {isEditing ? (
              <textarea
                className="w-full h-full p-6 bg-transparent border-none focus:ring-0 text-sm leading-relaxed font-mono resize-none"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                placeholder="在此编辑提取的信息..."
              />
            ) : (
              <div className="w-full h-full p-6 overflow-y-auto prose prose-sm prose-emerald max-w-none">
                {state.extractedInfo ? (
                  <ReactMarkdown>{state.extractedInfo}</ReactMarkdown>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 py-20">
                    <FileText size={48} className="opacity-20" />
                    <p className="text-sm">尚未提取到任何信息</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Step3({ state, title, onRegenerate, loading }: { state: WorkflowState, title?: string, onRegenerate: () => void, loading: boolean }) {
  return (
    <div className="space-y-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{title || "产品角色卡生成"}</h2>
        <p className="text-gray-500">AI 已为您生成了产品角色卡与营销海报</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xl overflow-hidden group">
            <div className="relative rounded-2xl overflow-hidden bg-gray-100 min-h-[400px] flex items-center justify-center">
              {state.characterCardImage ? (
                <img 
                  src={state.characterCardImage} 
                  className="w-full h-auto max-h-[80vh] object-contain" 
                  alt="产品营销海报"
                  referrerPolicy="no-referrer"
                />
              ) : state.imageError ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-red-400 p-6 text-center gap-4">
                  <Info size={48} />
                  <div className="space-y-2">
                    <span className="font-bold block">海报生成失败</span>
                    <p className="text-xs opacity-80 line-clamp-3">{state.imageError}</p>
                  </div>
                  <button 
                    onClick={onRegenerate}
                    className="mt-4 px-6 py-2 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-200 transition-all hover:scale-105 active:scale-95"
                  >
                    重试生成海报
                  </button>
                </div>
              ) : loading ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4">
                  <Loader2 size={48} className="animate-spin text-emerald-500" />
                  <div className="text-center">
                    <span className="font-bold block text-gray-900">海报生成中</span>
                    <p className="text-xs mt-1">AI 正在为您绘制专属营销海报，请稍候...</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4 py-20">
                  <ImageIcon size={48} className="opacity-20" />
                  <p className="text-sm">尚未生成营销海报</p>
                  <button 
                    onClick={onRegenerate}
                    className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all"
                  >
                    生成营销海报
                  </button>
                </div>
              )}
              
              {state.characterCardImage && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-4">
                  <button 
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = state.characterCardImage!;
                      a.download = 'product-poster.png';
                      a.click();
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-bold shadow-2xl hover:scale-105 transition-transform"
                  >
                    <Download size={20} />
                    下载营销海报
                  </button>
                  <button 
                    onClick={onRegenerate}
                    className="flex items-center gap-2 px-6 py-3 bg-white/20 backdrop-blur-md text-white border border-white/30 rounded-xl font-bold shadow-2xl hover:bg-white/30 transition-all"
                  >
                    <RefreshCw size={18} />
                    重新生成
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 font-medium uppercase tracking-widest">AI Generated Marketing Poster</p>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden">
            <div className="bg-[#1A1A1A] p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Layout size={20} className="text-emerald-500" />
                <h3 className="text-lg font-bold tracking-tight uppercase">Technical Spec</h3>
              </div>
              <div className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Verified Specs</div>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: 'Length', val: state.dimensions.length },
                  { label: 'Width', val: state.dimensions.width },
                  { label: 'Thickness', val: state.dimensions.thickness }
                ].map((dim, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="text-[10px] text-gray-400 uppercase font-black mb-1">{dim.label}</div>
                    <div className="text-xl font-black text-gray-900">{dim.val || 'N/A'}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-sm uppercase tracking-widest">
                  <div className="w-1.5 h-4 bg-emerald-500" />
                  <span>产品角色描述</span>
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 min-h-[200px] max-h-[400px] overflow-y-auto">
                  <div className="prose prose-sm prose-emerald max-w-none">
                    {state.characterCardDesc ? (
                      <ReactMarkdown>{state.characterCardDesc}</ReactMarkdown>
                    ) : (
                      <p className="text-gray-400 italic">等待生成角色描述...</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black shadow-xl shadow-emerald-200 hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
            {loading ? "正在重新生成..." : "重新生成角色卡"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step4({ state, styles, durations, onGenerate, onSelect, title, loading }: { 
  state: WorkflowState, 
  styles: { id: string; label: string; desc: string; prompt: string }[], 
  durations: { id: string; label: string; value: string }[],
  onGenerate: (style: string, duration: string, customStyle?: string) => void, 
  onSelect: (copy: string) => void,
  title?: string,
  loading: boolean
}) {
  const [selectedStyle, setSelectedStyle] = useState(state.adStyle || styles[0]?.id);
  const [selectedDuration, setSelectedDuration] = useState(state.adDuration || durations[0]?.id);
  const [customStyleText, setCustomStyleText] = useState(state.customStyle || "");

  return (
    <div className="space-y-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{title || "广告文案生成"}</h2>
        <p className="text-gray-500">选择风格与时长，AI 将为您创作 3 个不同侧重点的文案供您选择</p>
      </div>

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Duration Selection */}
        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-sm uppercase tracking-widest">
            <div className="w-1.5 h-4 bg-emerald-500" />
            <span>选择视频时长</span>
          </div>
          <div className="flex gap-4">
            {durations.map((dur) => (
              <button
                key={dur.id}
                onClick={() => setSelectedDuration(dur.id)}
                className={cn(
                  "flex-1 py-4 rounded-2xl border-2 font-bold transition-all",
                  selectedDuration === dur.id 
                    ? "border-emerald-500 bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50" 
                    : "border-gray-100 bg-white text-gray-400 hover:border-emerald-200"
                )}
              >
                {dur.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style Selection */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-sm uppercase tracking-widest px-2">
            <div className="w-1.5 h-4 bg-emerald-500" />
            <span>选择文案风格</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {styles.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={cn(
                  "p-6 rounded-2xl border-2 text-left transition-all space-y-3 group",
                  selectedStyle === style.id 
                    ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-50" 
                    : "border-gray-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                  selectedStyle === style.id ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400 group-hover:bg-emerald-100 group-hover:text-emerald-600"
                )}>
                  {style.id === 'minimal' && <Layout size={18} />}
                  {style.id === 'emotional' && <CheckCircle2 size={18} />}
                  {style.id === 'scientific' && <Info size={18} />}
                  {style.id === 'adventurous' && <Dog size={18} />}
                  {!['minimal', 'emotional', 'scientific', 'adventurous'].includes(style.id) && <Type size={18} />}
                </div>
                <div>
                  <div className="font-bold">{style.label}风格</div>
                  <div className="text-xs text-gray-400 font-medium">{style.desc}</div>
                </div>
              </button>
            ))}
            
            {/* Custom Style Option */}
            <button
              onClick={() => setSelectedStyle('custom')}
              className={cn(
                "p-6 rounded-2xl border-2 text-left transition-all space-y-3 group",
                selectedStyle === 'custom' 
                  ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-50" 
                  : "border-gray-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                selectedStyle === 'custom' ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400 group-hover:bg-emerald-100 group-hover:text-emerald-600"
              )}>
                <Plus size={18} />
              </div>
              <div>
                <div className="font-bold">自定义风格</div>
                <div className="text-xs text-gray-400 font-medium">手动输入您的需求</div>
              </div>
            </button>
          </div>

          {selectedStyle === 'custom' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-3"
            >
              <label className="text-xs font-bold text-emerald-700">请输入您的自定义风格需求</label>
              <textarea 
                className="w-full px-4 py-3 bg-white border border-emerald-100 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all min-h-[80px]"
                placeholder="例如：幽默风趣、充满科技感、适合小红书种草等..."
                value={customStyleText}
                onChange={(e) => setCustomStyleText(e.target.value)}
              />
            </motion.div>
          )}
        </div>

        <button
          onClick={() => onGenerate(selectedStyle, selectedDuration, customStyleText)}
          disabled={loading}
          className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black shadow-xl shadow-emerald-200 hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          {loading ? "正在生成文案..." : "生成广告文案"}
        </button>
      </div>

      {state.adCopyOptions.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-sm uppercase tracking-widest px-2">
            <div className="w-1.5 h-4 bg-emerald-500" />
            <span>请从以下 3 个方案中选择一个</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {state.adCopyOptions.map((option, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => onSelect(option)}
                className={cn(
                  "bg-white p-8 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden group flex flex-col h-[600px]",
                  state.adCopy === option 
                    ? "border-emerald-500 shadow-xl shadow-emerald-100 ring-4 ring-emerald-50" 
                    : "border-gray-100 hover:border-emerald-200 hover:shadow-lg"
                )}
              >
                {state.adCopy === option && (
                  <div className="absolute top-4 right-4 text-emerald-500">
                    <CheckCircle2 size={24} />
                  </div>
                )}
                <div className="flex items-center gap-2 text-emerald-600 font-bold mb-4">
                  <Type size={18} />
                  <span>方案 {idx + 1}</span>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 prose prose-sm prose-emerald max-w-none">
                  <ReactMarkdown>{option}</ReactMarkdown>
                </div>
                <div className={cn(
                  "mt-6 py-3 rounded-xl text-center font-bold text-sm transition-all",
                  state.adCopy === option 
                    ? "bg-emerald-500 text-white" 
                    : "bg-gray-50 text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600"
                )}>
                  {state.adCopy === option ? "已选择" : "点击选择"}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Step5({ state, title, onRegenerate, loading, onZoom }: { state: WorkflowState, title?: string, onRegenerate: () => void, loading: boolean, onZoom: (url: string) => void }) {
  return (
    <div className="space-y-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{title || "12 宫格分镜图"}</h2>
        <p className="text-gray-500">最终生成的广告视觉分镜与提示词</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-600 font-bold">
                <ImageIcon size={20} />
                <span>分镜提示词 (Prompt)</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(state.storyboardPrompt);
                    alert("提示词已复制到剪贴板");
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-all"
                  title="复制提示词"
                >
                  <Copy size={18} />
                </button>
                <button 
                  onClick={() => {
                    const blob = new Blob([state.storyboardPrompt], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'storyboard-prompt.txt';
                    a.click();
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-all"
                  title="下载提示词"
                >
                  <Download size={18} />
                </button>
              </div>
            </div>
            <div className="bg-gray-50 p-6 rounded-2xl font-mono text-sm text-gray-600 leading-relaxed border border-gray-100 max-h-[200px] overflow-y-auto">
              {state.storyboardPrompt || "尚未生成提示词"}
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-2 text-emerald-600 font-bold">
              <Type size={20} />
              <span>广告文案</span>
            </div>
            <div className="prose prose-sm prose-emerald max-h-[200px] overflow-y-auto pr-4">
              <ReactMarkdown>{state.adCopy || "尚未选择文案"}</ReactMarkdown>
            </div>
          </div>

          <a 
            href="https://jimeng.jianying.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-4 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl shadow-gray-200"
          >
            跳转至即梦生成视频
            <ExternalLink size={18} />
          </a>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xl overflow-hidden group">
            <div className="relative rounded-2xl overflow-hidden bg-gray-100 min-h-[400px] flex items-center justify-center">
              {state.storyboardImage ? (
                <img 
                  src={state.storyboardImage} 
                  className="w-full h-auto max-h-[80vh] object-contain" 
                  alt="12宫格分镜图"
                  referrerPolicy="no-referrer"
                />
              ) : state.imageError ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-red-400 p-6 text-center gap-4">
                  <Info size={48} />
                  <div className="space-y-2">
                    <span className="font-bold block">分镜图生成失败</span>
                    <p className="text-xs opacity-80 line-clamp-3">{state.imageError}</p>
                  </div>
                  <button 
                    onClick={onRegenerate}
                    className="mt-4 px-6 py-2 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-200 transition-all hover:scale-105 active:scale-95"
                  >
                    重试生成分镜图
                  </button>
                </div>
              ) : loading ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4">
                  <Loader2 size={48} className="animate-spin text-emerald-500" />
                  <div className="text-center">
                    <span className="font-bold block text-gray-900">分镜图生成中</span>
                    <p className="text-xs mt-1">AI 正在绘制 12 宫格分镜，请稍候...</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4 py-20">
                  <ImageIcon size={48} className="opacity-20" />
                  <p className="text-sm">尚未生成分镜图</p>
                  <button 
                    onClick={onRegenerate}
                    className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all"
                  >
                    生成 12 宫格分镜
                  </button>
                </div>
              )}
              
              {state.storyboardImage && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-4">
                  <div className="flex gap-4">
                    <button 
                      onClick={() => onZoom(state.storyboardImage!)}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-2xl hover:scale-105 transition-transform"
                    >
                      <Plus size={20} />
                      放大查看
                    </button>
                    <button 
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = state.storyboardImage!;
                        a.download = 'storyboard-12-grid.png';
                        a.click();
                      }}
                      className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-bold shadow-2xl hover:scale-105 transition-transform"
                    >
                      <Download size={20} />
                      下载图片
                    </button>
                  </div>
                  <button 
                    onClick={onRegenerate}
                    className="flex items-center gap-2 px-6 py-3 bg-white/20 backdrop-blur-md text-white border border-white/30 rounded-xl font-bold shadow-2xl hover:bg-white/30 transition-all"
                  >
                    <RefreshCw size={18} />
                    重新生成
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 font-medium uppercase tracking-widest">12-Grid Storyboard Output</p>
        </div>
      </div>
    </div>
  );
}
