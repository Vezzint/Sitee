"use client";

import React, { useState, useEffect, useRef } from "react";
import { translations, Language } from "@/lib/translations";

type GameState = "IDLE" | "SIDE_SELECTION" | "WAITING_PLAYERS" | "DEBATING" | "NUCLEAR_STRIKE" | "VOTING" | "FINISHED";
type View = "home" | "top" | "details";

export default function DebateArena() {
  const [lang, setLang] = useState<Language>("en");
  const [view, setView] = useState<View>("home");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [ageVerified, setAgeVerified] = useState<boolean | null>(null);
  const [gameState, setGameState] = useState<GameState>("IDLE");
  
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [topic, setTopic] = useState("");
  const [side, setSide] = useState<"FOR" | "AGAINST" | null>(null);
  const [timer, setTimer] = useState(60);
  const [sideTimer, setSideTimer] = useState(10);
  const [waitingTimer, setWaitingTimer] = useState(90);
  const [argumentsList, setArgumentsList] = useState<string[]>([]);
  const [currentArg, setCurrentArg] = useState("");
  const [topDebates, setTopDebates] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionInput, setSuggestionInput] = useState("");
  const [flash, setFlash] = useState(false);
  const [selectedDebate, setSelectedDebate] = useState<any>(null);
  const [rerolled, setRerolled] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [nuclearSelected, setNuclearSelected] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const t = translations[lang];

  // API wrappers to replace server actions
  const api = {
    getTopDebates: () => fetch("/api/debates").then(r => r.json()),
    getDebate: (id: string) => fetch(`/api/debates?id=${id}`).then(r => r.json()),
    createDebate: (topic: string, lang: string) => 
      fetch("/api/debates", { method: "POST", body: JSON.stringify({ topic, language: lang }) }).then(r => r.json()),
    callAction: (action: string, payload: any) => 
      fetch("/api/debates/actions", { method: "POST", body: JSON.stringify({ action, ...payload }) }).then(r => r.json()),
    getSuggestions: () => fetch("/api/suggestions").then(r => r.json()),
    addSuggestion: (topic: string, lang: string) => 
      fetch("/api/suggestions", { method: "POST", body: JSON.stringify({ topic, language: lang }) }).then(r => r.json()),
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("debateArenaTheme") as "dark" | "light";
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.classList.toggle("light-theme", savedTheme === "light");
    }

    const browserLang = navigator.language.split("-")[0] as Language;
    if (translations[browserLang]) setLang(browserLang);

    const verified = localStorage.getItem("debateArenaAgeVerified");
    setAgeVerified(verified === "true");

    let userId = localStorage.getItem("debateArenaUserId");
    let userName = localStorage.getItem("debateArenaUserName");
    if (!userId) {
      userId = Math.random().toString(36).substring(2, 11);
      userName = `Gladiator_${userId.substring(0, 4)}`;
      localStorage.setItem("debateArenaUserId", userId);
      localStorage.setItem("debateArenaUserName", userName);
    }
    setUser({ id: userId!, name: userName! });

    loadTopDebates();
    loadSuggestions();

    const params = new URLSearchParams(window.location.search);
    const debateId = params.get("id");
    if (debateId) loadDebateDetails(debateId);

    const interval = setInterval(() => {
      if (selectedDebate && (view === "details" || gameState !== "IDLE")) refreshSelectedDebate(selectedDebate.id);
      if (view === "top") loadTopDebates();
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedDebate?.id, view, gameState]);

  const loadTopDebates = async () => {
    try {
      const data = await api.getTopDebates();
      if (Array.isArray(data)) setTopDebates(data);
    } catch (e) {}
  };

  const loadSuggestions = async () => {
    try {
      const data = await api.getSuggestions();
      if (Array.isArray(data)) setSuggestions(data);
    } catch (e) {}
  };

  const refreshSelectedDebate = async (id: string) => {
    try {
      const data = await api.getDebate(id);
      if (!data || data.error) return;
      setSelectedDebate(data);

      if (data.waitingStartedAt && data.status === 'waiting') {
        const elapsed = Math.floor((Date.now() - new Date(data.waitingStartedAt).getTime()) / 1000);
        const remaining = Math.max(0, 90 - elapsed);
        setWaitingTimer(remaining);
        
        const hasFor = data.participants.some((p:any) => p.side === 'FOR');
        const hasAgainst = data.participants.some((p:any) => p.side === 'AGAINST');

        if (remaining === 0 && hasFor && hasAgainst && data.status === 'waiting') {
          await api.callAction("status", { debateId: data.id, status: 'active' });
        }
      }

      const isParticipating = data.participants.some((p:any) => p.userId === user?.id);
      if (data.status === 'active' && isParticipating && gameState === 'WAITING_PLAYERS') {
        setGameState('DEBATING');
        setTimer(60);
      }
    } catch (e) {}
  };

  const loadDebateDetails = async (id: string) => {
    try {
      const data = await api.getDebate(id);
      if (data && !data.error) {
        setSelectedDebate(data);
        setView("details");
        window.history.pushState({}, "", `?id=${id}`);
      }
    } catch (e) {}
  };

  const startDuel = async (joiningDebate: any = null) => {
    if (!topic.trim() || !user) return;
    initAudio();
    setIsLoading(true);
    
    if (joiningDebate || (isJoining && selectedDebate)) {
      const targetDebate = joiningDebate || selectedDebate;
      setSelectedDebate(targetDebate);
      setIsJoining(true);
      setGameState("SIDE_SELECTION");
      setSideTimer(10);
      setRerolled(false);
      const forPlayers = targetDebate.participants.filter((p: any) => p.side === 'FOR').length;
      const againstPlayers = targetDebate.participants.filter((p: any) => p.side === 'AGAINST').length;
      setSide(forPlayers > againstPlayers ? 'AGAINST' : 'FOR');
      setIsLoading(false);
    } else {
      try {
        const res = await api.createDebate(topic, lang);
        if (res.success && res.id) {
          await loadDebateDetails(res.id);
          setTopic("");
          setIsJoining(false);
          setGameState("IDLE");
        } else {
          throw new Error(res.error || "Server error");
        }
      } catch (err: any) {
        alert(`ARENA ERROR: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const confirmSideAndJoin = async () => {
    if (!user || !side || !selectedDebate) return;
    const res = await api.callAction("join", { debateId: selectedDebate.id, userId: user.id, userName: user.name, side });
    if (!res.success) {
      alert(res.error || "Failed to join");
      setGameState("IDLE");
      return;
    }
    setGameState("WAITING_PLAYERS");
  };

  const addArg = async () => {
    if (argumentsList.length >= 5 || !currentArg.trim() || !user || !selectedDebate || !side) return;
    const lowerArg = currentArg.toLowerCase();
    if (t.badWords.some((word: string) => lowerArg.includes(word.toLowerCase()))) {
      alert(t.censorshipError);
      return;
    }
    await api.callAction("argument", { debateId: selectedDebate.id, content: currentArg, side, userId: user.id, userName: user.name });
    setArgumentsList([...argumentsList, currentArg]);
    setCurrentArg("");
  };

  const handleNuclearStrike = async (argId: string) => {
    if (!user || !selectedDebate) return;
    await api.callAction("nuclear", { debateId: selectedDebate.id, userId: user.id, argumentId: argId });
    setNuclearSelected(argId);
    playSound(100, 0.8, "sawtooth");
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
    setTimeout(() => setGameState("VOTING"), 2000);
  };

  const castVote = async (vSide: 'FOR' | 'AGAINST' | 'DRAW') => {
    if (!selectedDebate) return;
    await api.callAction("voteSide", { debateId: selectedDebate.id, side: vSide });
    setTimeout(async () => {
      await api.callAction("finalize", { debateId: selectedDebate.id });
      await loadDebateDetails(selectedDebate.id);
      setGameState("FINISHED");
      playApplause();
      triggerConfetti();
    }, 1000);
  };

  const requestRematch = async () => {
    if (!selectedDebate) return;
    const res = await api.callAction("rematch", { debateId: selectedDebate.id });
    if (res.success) {
      setGameState("DEBATING");
      setTimer(60);
      setArgumentsList([]);
    }
  };

  const handleVote = async (id: string, type: 'like' | 'dislike') => {
    await api.callAction("voteLike", { id, type });
    if (selectedDebate && selectedDebate.id === id) refreshSelectedDebate(id);
    loadTopDebates();
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("debateArenaTheme", newTheme);
    document.body.classList.toggle("light-theme", newTheme === "light");
  };

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playSound = (freq: number, duration: number, type: OscillatorType = "sine") => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  const playApplause = () => {
    for(let i=0; i<5; i++) setTimeout(() => playSound(400 + Math.random()*400, 0.5, "triangle"), i*100);
  };

  const triggerConfetti = () => {
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.backgroundColor = ['#22d3ee', '#ec4899', '#a855f7'][Math.floor(Math.random() * 3)];
      confetti.style.animationDelay = Math.random() * 2 + 's';
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 5000);
    }
  };

  useEffect(() => {
    if (gameState === "SIDE_SELECTION" && sideTimer > 0) {
      sideTimerRef.current = setTimeout(() => setSideTimer(prev => prev - 1), 1000);
    } else if (gameState === "SIDE_SELECTION" && sideTimer === 0) {
      confirmSideAndJoin();
    }
    return () => { if (sideTimerRef.current) clearTimeout(sideTimerRef.current); };
  }, [gameState, sideTimer]);

  useEffect(() => {
    if (gameState === "DEBATING" && timer > 0) {
      timerRef.current = setTimeout(() => {
        const nextTimer = timer - 1;
        setTimer(nextTimer);
        if (nextTimer <= 10 && nextTimer > 0) playSound(1200, 0.05);
      }, 1000);
    } else if (gameState === "DEBATING" && timer === 0) {
      setGameState("NUCLEAR_STRIKE");
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [gameState, timer]);

  const getStatusText = (status: string) => {
    if (status === 'waiting') return t.statusWaiting;
    if (status === 'active') return t.statusActive;
    return t.statusFinished;
  };

  const calculateWinningChances = () => {
    if (!selectedDebate) return { for: 50, against: 50 };
    const forParticipants = selectedDebate.participants.filter((p: any) => p.side === 'FOR');
    const againstParticipants = selectedDebate.participants.filter((p: any) => p.side === 'AGAINST');
    if (forParticipants.length === 0 && againstParticipants.length === 0) return { for: 50, against: 50 };
    const forWeight = forParticipants.reduce((acc: number, p: any) => acc + 1 + (p.reputation || 0), 0) || 0.1;
    const againstWeight = againstParticipants.reduce((acc: number, p: any) => acc + 1 + (p.reputation || 0), 0) || 0.1;
    const total = forWeight + againstWeight;
    return { for: Math.round((forWeight / total) * 100), against: Math.round((againstWeight / total) * 100) };
  };

  const isUserParticipant = () => {
    if (!selectedDebate || !user) return false;
    return selectedDebate.participants.some((p: any) => p.userId === user.id);
  };

  if (ageVerified === false) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black scanline">
        <div className="glass p-12 border-2 border-neon-purple max-w-md w-full mx-4 text-center">
          <h2 className="text-4xl font-black mb-10 text-neon-purple">{t.ageGateTitle}</h2>
          <div className="flex gap-6 justify-center">
            <button onClick={() => { localStorage.setItem("debateArenaAgeVerified", "true"); setAgeVerified(true); }} className="btn-cyber btn-purple px-10 py-3">{t.yes}</button>
            <button onClick={() => window.location.href = "https://google.com"} className="btn-cyber bg-slate-800 px-10 py-3">{t.no}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative min-h-screen transition-colors duration-300 ${theme === 'light' ? 'light-theme' : ''}`}>
      {flash && <div className="fixed inset-0 z-[9999] bg-white animate-out fade-out duration-300 pointer-events-none" />}
      
      <header className="sticky top-0 z-50 glass border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <div className="group cursor-pointer" onClick={() => { setView("home"); setGameState("IDLE"); setTopic(""); setIsJoining(false); }}>
            <h1 className="text-2xl font-black tracking-tighter text-neon-cyan group-hover:neon-text-cyan transition-all uppercase">{t.title}</h1>
          </div>
          <nav className="hidden md:flex gap-8">
            <button onClick={() => setView("home")} className={`uppercase text-xs font-bold tracking-[0.2em] transition-all ${view === 'home' ? 'text-neon-pink' : 'text-slate-400 hover:text-white'}`}>{t.home}</button>
            <button onClick={() => setView("top")} className={`uppercase text-xs font-bold tracking-[0.2em] transition-all ${view === 'top' ? 'text-neon-pink' : 'text-slate-400 hover:text-white'}`}>{t.top}</button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="text-2xl hover:scale-110 transition-transform">{theme === 'dark' ? '☀️' : '🌙'}</button>
          <select value={lang} onChange={(e) => setLang(e.target.value as Language)} className="bg-black/50 border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm outline-none focus:border-neon-cyan">
            {Object.keys(translations).map(l => <option key={l} value={l} className="bg-slate-900">{l.toUpperCase()}</option>)}
          </select>
          {user && <div className="text-[10px] font-mono text-neon-cyan border border-neon-cyan/30 px-2 py-1">{user.name}</div>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 relative min-h-[80vh]">
        {view === "home" && (
          <div className="space-y-16 animate-in fade-in duration-500">
            {gameState === "IDLE" && (
              <section className="flex flex-col items-center justify-center py-20">
                <div className="relative mb-12 text-center">
                  <h2 className="text-5xl md:text-8xl font-black leading-none tracking-tighter uppercase">
                    <span className="block">{t.enterTopic.split(' ')[0]}</span>
                    <span className="block text-transparent bg-clip-text bg-gradient-to-r from-neon-purple to-neon-pink">{t.enterTopic.split(' ').slice(1).join(' ')}</span>
                  </h2>
                </div>
                <div className="w-full max-w-3xl space-y-8">
                  <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="E.G. IS AI BETTER THAN HUMANS?" className="w-full input-cyber text-2xl" />
                  <button onClick={() => startDuel()} disabled={isLoading} className="btn-cyber btn-purple w-full py-6 text-2xl shadow-[0_0_30px_rgba(168,85,247,0.4)] disabled:opacity-50">{isLoading ? t.loading : t.startDuel}</button>
                </div>
              </section>
            )}

            {gameState === "SIDE_SELECTION" && (
              <div className="flex flex-col items-center justify-center py-32 text-center animate-in zoom-in duration-300">
                <p className="text-slate-500 uppercase tracking-[0.4em] mb-4">{t.yourSide}</p>
                <div className={`text-9xl font-black tracking-tighter ${side === 'FOR' ? 'text-neon-cyan neon-text-cyan' : 'text-neon-pink neon-text-pink'} animate-pulse`}>{side === 'FOR' ? t.for : t.against}</div>
                <div className="mt-12 space-y-6">
                   <p className="font-mono text-neon-cyan text-xl">{t.chooseSideTime} {sideTimer}s</p>
                   {!rerolled && <button onClick={() => { setSide(side === 'FOR' ? 'AGAINST' : 'FOR'); setRerolled(true); }} className="btn-cyber bg-slate-800 px-8 py-3">{t.reroll}</button>}
                </div>
              </div>
            )}

            {gameState === "WAITING_PLAYERS" && selectedDebate && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-12">
                <div className="relative">
                    <div className="w-64 h-64 rounded-full border-4 border-neon-cyan/20 animate-pulse-ring absolute inset-0"></div>
                    <div className="w-64 h-64 rounded-full border-4 border-neon-cyan flex items-center justify-center">
                        <span className="text-7xl font-black">{waitingTimer}</span>
                    </div>
                </div>
                <h2 className="text-2xl font-bold max-w-lg">{t.waitingPlayers.replace('{time}', waitingTimer.toString())}</h2>
                <div className="grid grid-cols-2 gap-20 w-full max-w-4xl">
                    <div className="space-y-4">
                        <h3 className="text-neon-cyan font-black uppercase tracking-widest">{t.for}</h3>
                        <div className="flex flex-wrap justify-center gap-4">
                            {selectedDebate.participants.filter((p:any)=>p.side==='FOR').map((p:any, i:number)=>(
                                <div key={i} className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom duration-300">
                                    <div className="w-12 h-12 rounded-full bg-neon-cyan flex items-center justify-center text-black font-bold">{p.userName[0]}</div>
                                    <span className="text-[10px] font-mono">{p.userName}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-neon-pink font-black uppercase tracking-widest">{t.against}</h3>
                        <div className="flex flex-wrap justify-center gap-4">
                            {selectedDebate.participants.filter((p:any)=>p.side==='AGAINST').map((p:any, i:number)=>(
                                <div key={i} className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom duration-300">
                                    <div className="w-12 h-12 rounded-full bg-neon-pink flex items-center justify-center text-black font-bold">{p.userName[0]}</div>
                                    <span className="text-[10px] font-mono">{p.userName}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
              </div>
            )}

            {gameState === "DEBATING" && selectedDebate && (
              <div className={`space-y-12 ${timer <= 5 ? "animate-shake" : ""}`}>
                <div className="flex justify-center text-center">
                    <span className={`text-9xl font-black tabular-nums transition-colors duration-500 ${timer <= 10 ? 'text-red-500 animate-pulse-fast' : ''}`}>{timer}</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                    <div className="lg:col-span-8 space-y-6">
                        <div className="flex justify-between items-end border-b border-white/10 pb-4">
                            <h3 className="text-2xl font-black uppercase tracking-widest">{t.argumentsAdded} ({argumentsList.length}/5)</h3>
                        </div>
                        <div className="space-y-4">
                            {argumentsList.map((arg, idx) => (
                                <div key={idx} className="glass-dark p-6 border-l-4 border-neon-cyan flex gap-4 animate-in slide-in-from-left">
                                    <span className="text-xs font-mono text-neon-cyan">{idx+1}/5</span>
                                    <p className="flex-1">{arg}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="lg:col-span-4 glass p-8 space-y-6">
                        <textarea value={currentArg} onChange={(e) => setCurrentArg(e.target.value)} placeholder={t.placeholderArg} rows={6} className="w-full input-cyber resize-none" />
                        <button onClick={addArg} disabled={argumentsList.length >= 5} className="btn-cyber btn-pink w-full py-4 uppercase">➕ {t.addArgument}</button>
                    </div>
                </div>
              </div>
            )}

            {gameState === "NUCLEAR_STRIKE" && selectedDebate && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-12">
                <h2 className="text-6xl font-black text-red-500 animate-pulse">{t.nuclearStrike}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                    {selectedDebate.arguments.filter((a:any)=>a.authorId === user?.id).map((arg:any, i:number)=>(
                        <button key={i} onClick={()=>handleNuclearStrike(arg.id)} className={`glass-dark p-8 text-left hover:border-red-500 transition-all group ${nuclearSelected === arg.id ? 'border-red-500 bg-red-500/10' : ''}`}>
                            <p className="italic opacity-80 mb-4">"{arg.content}"</p>
                            <div className="text-[10px] font-black uppercase text-red-500">Select for Strike</div>
                        </button>
                    ))}
                </div>
              </div>
            )}

            {gameState === "VOTING" && selectedDebate && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-12">
                <h2 className="text-4xl font-black">{t.voteForSide}</h2>
                <div className="flex gap-8">
                    <button onClick={()=>castVote('FOR')} className="btn-cyber btn-cyan px-12 py-6 text-2xl">{t.for}</button>
                    <button onClick={()=>castVote('DRAW')} className="btn-cyber px-12 py-6 text-2xl">{t.draw}</button>
                    <button onClick={()=>castVote('AGAINST')} className="btn-cyber btn-pink px-12 py-6 text-2xl">{t.against}</button>
                </div>
              </div>
            )}

            {gameState === "FINISHED" && selectedDebate && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-12">
                <h2 className="text-7xl font-black uppercase text-neon-cyan">{t.winnerSide} {selectedDebate.forVotes > selectedDebate.againstVotes ? t.for : (selectedDebate.againstVotes > selectedDebate.forVotes ? t.against : t.draw)}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl">
                    <div className="glass p-8 space-y-6">
                        <h3 className="text-2xl font-black uppercase">{t.reputation}</h3>
                        <div className="space-y-4">
                            {selectedDebate.participants.map((p:any, i:number)=>(
                                <div key={i} className="flex justify-between items-center border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">{p.userName[0]}</div>
                                        <span className="font-bold">{p.userName}</span>
                                    </div>
                                    <span className="text-neon-cyan font-mono">+{p.reputation} {t.reputationPoints}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-4 justify-center">
                        <button onClick={requestRematch} className="btn-cyber btn-purple py-6 text-2xl">{t.rematch} ({selectedDebate.rematchVotes})</button>
                        <button onClick={() => { setGameState("IDLE"); setView("home"); }} className="btn-cyber bg-slate-800 py-4 uppercase tracking-widest">{t.home}</button>
                    </div>
                </div>
              </div>
            )}
            
            {gameState === "IDLE" && (
                <section className="glass-dark p-10">
                <h3 className="text-3xl font-black uppercase mb-8">{t.suggestTopic}</h3>
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <input type="text" value={suggestionInput} onChange={(e) => setSuggestionInput(e.target.value)} className="input-cyber flex-1" placeholder="..." />
                    <button onClick={async () => { if(!suggestionInput) return; await api.addSuggestion(suggestionInput, lang); setSuggestionInput(""); loadSuggestions(); }} className="btn-cyber btn-cyan px-8 py-4 uppercase">🚀 {t.submitIdea}</button>
                </div>
                <div className="flex flex-wrap gap-3">
                    {suggestions.map((s, idx) => <div key={idx} className="bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-white/5">{s.topic}</div>)}
                </div>
                </section>
            )}
          </div>
        )}

        {view === "top" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <h2 className="text-6xl font-black tracking-tighter uppercase">{t.popularDebates}</h2>
            <div className="grid grid-cols-1 gap-8">
              {topDebates.filter(d => d.language === lang).map((debate, idx) => (
                <div key={debate.id} className="glass-dark group overflow-hidden transition-all hover:bg-white/10 animate-in slide-in-from-bottom duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                  <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest ${debate.status === 'finished' ? 'bg-slate-700' : 'bg-green-600 animate-pulse'}`}>{getStatusText(debate.status)}</span>
                        <span className="text-[10px] font-mono text-slate-500">{new Date(debate.createdAt).toLocaleDateString()}</span>
                      </div>
                      <h3 className="text-3xl font-black mb-4">{debate.topic}</h3>
                      <div className="flex gap-4">
                        <div className="flex -space-x-2">
                            {debate.participants.slice(0, 5).map((p:any, i:number)=>(
                                <div key={i} title={p.userName} className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-bold">{p.userName[0]}</div>
                            ))}
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase mt-2">👥 {debate.participants.length} {t.participants}</span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      {debate.status === 'waiting' ? (
                        <button onClick={() => { setTopic(debate.topic); setView("home"); startDuel(debate); }} className="btn-cyber btn-purple px-10 py-3">⚔️ {t.joinBattle}</button>
                      ) : (
                        <button onClick={() => loadDebateDetails(debate.id)} className="btn-cyber bg-slate-800 px-10 py-3">👁️ {t.joinWatch}</button>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => handleVote(debate.id, 'like')} className="glass px-4 py-2 hover:border-neon-cyan transition-all">❤️ {debate.likes}</button>
                        <button onClick={() => handleVote(debate.id, 'dislike')} className="glass px-4 py-2 hover:border-neon-pink transition-all">👎 {debate.dislikes}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "details" && selectedDebate && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <button onClick={() => setView("top")} className="text-neon-cyan uppercase text-xs font-bold tracking-[0.3em] flex items-center gap-2 mb-8">⬅️ {t.back}</button>
            <div className="text-center space-y-8">
                <div className="inline-block px-4 py-1 border border-neon-cyan text-neon-cyan text-[10px] font-black uppercase tracking-widest mb-4">{getStatusText(selectedDebate.status)}</div>
                <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase">{selectedDebate.topic}</h2>
                <div className="max-w-2xl mx-auto space-y-6">
                    {selectedDebate.status !== 'finished' ? (
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted">
                           <span>Winning Chances: {calculateWinningChances().for}%</span>
                           <span>{calculateWinningChances().against}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-900 flex rounded-full overflow-hidden">
                           <div className="h-full bg-neon-cyan transition-all duration-500" style={{ width: `${calculateWinningChances().for}%` }}></div>
                           <div className="h-full bg-neon-pink transition-all duration-500" style={{ width: `${calculateWinningChances().against}%` }}></div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between font-mono text-sm font-bold uppercase">
                            <span className="text-neon-cyan">{t.for}: {selectedDebate.forVotes}</span>
                            <span className="text-neon-pink">{t.against}: {selectedDebate.againstVotes}</span>
                        </div>
                        <div className="h-4 w-full bg-slate-900 rounded-none flex overflow-hidden border border-white/5">
                            <div className="h-full bg-neon-cyan transition-all duration-1000" style={{ width: `${(selectedDebate.forVotes / (selectedDebate.forVotes + selectedDebate.againstVotes + selectedDebate.drawVotes || 1)) * 100}%` }}></div>
                            <div className="h-full bg-slate-700 transition-all duration-1000" style={{ width: `${(selectedDebate.drawVotes / (selectedDebate.forVotes + selectedDebate.againstVotes + selectedDebate.drawVotes || 1)) * 100}%` }}></div>
                            <div className="h-full bg-neon-pink transition-all duration-1000 flex-1"></div>
                        </div>
                      </div>
                    )}
                </div>
                {selectedDebate.status === 'waiting' && !isUserParticipant() && <button onClick={() => { setTopic(selectedDebate.topic); setIsJoining(true); setView("home"); startDuel(); }} className="btn-cyber btn-purple px-12 py-5 text-2xl mt-8 animate-pulse">⚔️ {t.joinBattle}</button>}
                {isUserParticipant() && selectedDebate.status !== 'finished' && <div className="mt-8 text-neon-cyan font-bold animate-pulse">⚡ {t.yourSide} {selectedDebate.participants.find((p:any)=>p.userId === user?.id)?.side === 'FOR' ? t.for : t.against}</div>}
                {!isUserParticipant() && selectedDebate.status !== 'finished' && <div className="mt-8 text-slate-500 font-bold italic">{t.spectatorMode}</div>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-20">
                <div className="space-y-8">
                    <h3 className="text-2xl font-black text-neon-cyan uppercase tracking-widest text-center border-b border-neon-cyan/20 pb-4">{t.for} Team</h3>
                    <div className="flex flex-wrap justify-center gap-4 mb-8">
                        {selectedDebate.participants.filter((p:any)=>p.side==='FOR').map((p:any, i:number)=>(
                            <div key={i} className="flex flex-col items-center gap-1">
                                <div className="w-10 h-10 rounded-full bg-neon-cyan flex items-center justify-center text-black font-bold">{p.userName[0]}</div>
                                <span className="text-[8px] font-mono text-slate-500">{p.userName}</span>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-4">
                        {selectedDebate.arguments.filter((a: any) => a.side === 'FOR').map((arg: any, idx: number) => (
                            <div key={idx} className={`glass-dark p-6 border-l-4 border-neon-cyan relative ${arg.isNuclear ? 'ring-2 ring-red-500 bg-red-500/5' : ''}`}>
                                {arg.isNuclear ? <span className="absolute -top-2 -right-2 text-xl">💥</span> : null}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-bold">{arg.authorName?.[0] || 'U'}</div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase">{arg.authorName}</span>
                                </div>
                                <p className="italic opacity-80">"{arg.content}"</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="space-y-8">
                    <h3 className="text-2xl font-black text-neon-pink uppercase tracking-widest text-center border-b border-neon-pink/20 pb-4">{t.against} Team</h3>
                    <div className="flex flex-wrap justify-center gap-4 mb-8">
                        {selectedDebate.participants.filter((p:any)=>p.side==='AGAINST').map((p:any, i:number)=>(
                            <div key={i} className="flex flex-col items-center gap-1">
                                <div className="w-10 h-10 rounded-full bg-neon-pink flex items-center justify-center text-black font-bold">{p.userName[0]}</div>
                                <span className="text-[8px] font-mono text-slate-500">{p.userName}</span>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-4">
                        {selectedDebate.arguments.filter((a: any) => a.side === 'AGAINST').map((arg: any, idx: number) => (
                            <div key={idx} className={`glass-dark p-6 border-l-4 border-neon-pink relative ${arg.isNuclear ? 'ring-2 ring-red-500 bg-red-500/5' : ''}`}>
                                {arg.isNuclear ? <span className="absolute -top-2 -right-2 text-xl">💥</span> : null}
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-bold">{arg.authorName?.[0] || 'U'}</div>
                                    <span className="text-[10px] font-mono text-slate-500 uppercase">{arg.authorName}</span>
                                </div>
                                <p className="italic opacity-80">"{arg.content}"</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        )}
      </main>

      <footer className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/10 flex justify-around p-4 z-50">
        <button onClick={() => { setView("home"); setGameState("IDLE"); }} className={`flex flex-col items-center gap-1 ${view === 'home' ? 'text-neon-pink' : 'text-slate-400'}`}>
          <span className="text-xl">🏠</span>
          <span className="text-[8px] font-bold uppercase">{t.home}</span>
        </button>
        <button onClick={() => setView("top")} className={`flex flex-col items-center gap-1 ${view === 'top' ? 'text-neon-pink' : 'text-slate-400'}`}>
          <span className="text-xl">🏆</span>
          <span className="text-[8px] font-bold uppercase">{t.top}</span>
        </button>
      </footer>
    </div>
  );
}
