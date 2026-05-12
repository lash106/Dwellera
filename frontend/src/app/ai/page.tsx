"use client";

import { useEffect, useState, useRef } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";
import dynamic from 'next/dynamic';
import PropertyDetailsModal from "@/components/PropertyDetailsModal";

// Dynamically import Map to avoid SSR issues
const MapComponent = dynamic(() => import('@/components/Map'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center font-bold text-gray-400">Initializing Map Visualization...</div>
});

export default function AIPage() {
  const [session, setSession] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [logs, setLogs] = useState<{ role: string; text: string; properties?: any[] }[]>([]);
  const [foundProperties, setFoundProperties] = useState<any[]>([]);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [textQuery, setTextQuery] = useState("");
  const [nlpLoading, setNlpLoading] = useState(false);
  const [lastSearchSummary, setLastSearchSummary] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const scriptProcRef = useRef<ScriptProcessorNode | null>(null);

  const [nextPlayTime, setNextPlayTime] = useState(0);
  const nextPlayTimeRef = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  const addLog = (role: string, text: string, properties?: any[]) => {
    setLogs((prev) => [...prev, { role, text, properties }]);
  };

  const runNlpSearch = async (queryText: string, announceUser = false) => {
    const cleaned = queryText.trim();
    if (!cleaned) return null;

    if (announceUser) addLog("user", cleaned);
    setNlpLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings/nlp-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleaned, limit: 10 })
      });

      if (!res.ok) throw new Error("NLP search failed");
      const result = await res.json();
      const properties = Array.isArray(result.listings) ? result.listings : [];

      setFoundProperties(properties.slice(0, 10));
      setLastSearchSummary(result.message || "");
      addLog("system", result.message || `Found ${properties.length} matching properties.`, properties.slice(0, 5));
      return result;
    } catch (err) {
      console.error("NLP search failed", err);
      addLog("system", "I could not complete that property search. Make sure the backend is running.");
      return null;
    } finally {
      setNlpLoading(false);
    }
  };

  const buildToolQuery = (args: any) => {
    if (args?.raw_query) return String(args.raw_query);
    const parts: string[] = [];
    if (args?.search) parts.push(String(args.search));
    if (args?.area) parts.push(`in ${args.area}`);
    if (args?.property_type) parts.push(String(args.property_type));
    if (args?.min_price) parts.push(`over ${args.min_price}`);
    if (args?.max_price) parts.push(`under ${args.max_price}`);
    if (args?.min_bedrooms) parts.push(`${args.min_bedrooms}+ bedrooms`);
    if (args?.min_bathrooms) parts.push(`${args.min_bathrooms}+ bathrooms`);
    if (Array.isArray(args?.features)) parts.push(`with ${args.features.join(" and ")}`);
    return parts.join(" ").trim() || "available properties";
  };

  const connectAPI = async () => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert("Missing NEXT_PUBLIC_GEMINI_API_KEY in frontend/.env.local!");
      return;
    }

    // List supported models for debugging
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1alpha/models?key=${apiKey}`);
      const listData = await listRes.json();
      if (listData.models) {
        const liveModels = listData.models
          .filter((m: any) => m.supportedGenerationMethods?.includes("bidiGenerateContent"))
          .map((m: any) => m.name);
        console.log("🌟 Compatible Live API Models Available:", liveModels);
      }
    } catch (err) {
      console.error("Failed to list internal models:", err);
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addLog("system", "Connected to Gemini Live API.");

      // Send Setup Message
      const setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
          systemInstruction: "You are Dwellera's real estate search assistant. When a user asks for homes, call search_marketplace. Always include raw_query with the user's full natural-language request when possible, because the backend understands area, budget, beds, baths, property type, status, amenities, and ranking terms.",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Aoede" // Choose a cool voice
                }
              }
            }
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "search_marketplace",
                  description: "Searches the real estate database with a natural-language parser. Call this whenever the user asks to find, look for, compare, rank, or see properties.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      raw_query: { type: "STRING", description: "The user's complete natural-language search request, e.g. 'show me 3 bed houses in San Jose under 2 million with modern finishes'." },
                      area: { type: "STRING", description: "City, neighborhood, or area, e.g. San Francisco, SOMA, Mission, San Jose, Willow Glen." },
                      search: { type: "STRING", description: "General search term, e.g. 'Pool', 'Modern'" },
                      property_type: { type: "STRING", description: "Type of property: 'House', 'Apartment', 'Condo', or 'Townhouse'." },
                      min_price: { type: "NUMBER" },
                      max_price: { type: "NUMBER" },
                      min_bedrooms: { type: "NUMBER" },
                      min_bathrooms: { type: "NUMBER" },
                      features: { type: "ARRAY", items: { type: "STRING" }, description: "Amenity or description terms like pool, views, historic, modern, loft, park." }
                    }
                  }
                },
                {
                  name: "create_listing",
                  description: "Creates a new barebones property listing in the database. Call this when the user says they want to list or sell a property.",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      title: { type: "STRING" },
                      description: { type: "STRING" },
                      price: { type: "NUMBER" },
                      property_type: { type: "STRING", description: "'House', 'Apartment', 'Condo', or 'Townhouse'" },
                      bedrooms: { type: "INTEGER" },
                      bathrooms: { type: "INTEGER" }
                    },
                    required: ["title", "description", "price", "property_type"]
                  }
                }
              ]
            }
          ]
        }
      };

      ws.send(JSON.stringify(setupMsg));
    };

    ws.onclose = (event) => {
      setConnected(false);
      stopMic();
      addLog("system", `Disconnected from API. (Code: ${event.code}, Reason: ${event.reason || "None given"})`);
    };

    ws.onerror = (err) => {
      console.error("WS Error:", err);
      addLog("system", "WebSocket error occurred.");
    };

    ws.onmessage = async (event) => {
      let data;
      // Depending on API version, it might be Blob or text
      if (event.data instanceof Blob) {
        const text = await event.data.text();
        data = JSON.parse(text);
      } else {
        data = JSON.parse(event.data);
      }

      // Handle Server Content (Audio/Text)
      if (data.serverContent?.modelTurn?.parts) {
        data.serverContent.modelTurn.parts.forEach((part: any) => {
          if (part.text) {
            addLog("gemini", part.text);
          }
          if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
            playAudio(part.inlineData.data);
          }
        });
      }

      // Handle Tool Calls
      if (data.toolCall?.functionCalls) {
        const responses: any[] = [];

        for (const call of data.toolCall.functionCalls) {
          addLog("system", `Executing Tool: ${call.name}(${JSON.stringify(call.args)})`);

          if (call.name === "search_marketplace") {
            try {
              const searchText = buildToolQuery(call.args || {});
              const result = await runNlpSearch(searchText);
              const dbData = result?.listings || [];
              
              // Extract data for both AI and Map
              const mapData = dbData.slice(0, 10); // Show up to 10 on map
              setFoundProperties(mapData);

              const slimData = mapData.map((x: any) => ({ 
                id: x.id, 
                title: x.title, 
                price: x.price, 
                desc: x.description, 
                type: x.property_type,
                beds: x.bedrooms,
                baths: x.bathrooms,
                image: x.image_urls?.[0] || 'https://via.placeholder.com/400x300?text=No+Image'
              }));

              responses.push({
                id: call.id,
                response: { result: slimData.length > 0 ? { summary: result?.message, properties: slimData } : (result?.message || "No properties found matching those criteria.") }
              });
              
              if (slimData.length > 0) {
                addLog("system", `I've highlighted ${slimData.length} properties on the map for you.`, mapData);
              } else {
                addLog("system", "No properties found matching those criteria.");
              }
            } catch (err) {
              responses.push({ id: call.id, response: { error: "Failed to fetch." } });
            }
          }
          else if (call.name === "create_listing") {
            if (!session) {
              responses.push({ id: call.id, response: { error: "User is not logged in." } });
            } else {
              try {
                const payload = {
                  ...call.args,
                  seller_id: session.user.id,
                  location_lat: 37.7749, // Default backup
                  location_lng: -122.4194
                };
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                if (res.ok) {
                  const lData = await res.json();
                  responses.push({ id: call.id, response: { result: `Successfully created listing with ID ${lData.id}` } });
                  addLog("system", `Created missing property: ${payload.title}`);
                } else {
                  responses.push({ id: call.id, response: { error: "Failed to create listing in DB." } });
                }
              } catch (e) {
                responses.push({ id: call.id, response: { error: "Network error creating listing." } });
              }
            }
          }
        }

        // Reply with ToolResponse
        if (responses.length > 0) {
          ws.send(JSON.stringify({
            toolResponse: { functionResponses: responses }
          }));
        }
      }
    };
  };

  const disconnectAPI = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const startMic = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("API not connected yet.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const pcmFloat = e.inputBuffer.getChannelData(0);
        const pcmInt16 = new Int16Array(pcmFloat.length);
        for (let i = 0; i < pcmFloat.length; i++) {
          let s = Math.max(-1, Math.min(1, pcmFloat[i]));
          pcmInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Encode to Base64
        let binary = '';
        const bytes = new Uint8Array(pcmInt16.buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = window.btoa(binary);

        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: b64
              }
            ]
          }
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      scriptProcRef.current = processor;

      setMicActive(true);
      addLog("system", "Microphone actively streaming to Gemini...");

    } catch (err) {
      console.error("Mic error:", err);
      alert("Microphone permission denied or failed.");
    }
  };

  const stopMic = () => {
    if (scriptProcRef.current && audioCtxRef.current) {
      scriptProcRef.current.disconnect();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
    }
    setMicActive(false);
    addLog("system", "Microphone stopped.");
  };

  const playAudio = (base64String: string) => {
    if (!audioCtxRef.current) {
      // Create an output context if we didn't start the mic yet
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioCtxRef.current;

    const binaryStr = window.atob(base64String);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 0x8000;
    }

    const buffer = ctx.createBuffer(1, float32Array.length, 24000);
    buffer.getChannelData(0).set(float32Array);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Gapless playback queueing
    const currentTime = ctx.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime + 0.05; // small buffer
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  };

  const handleTextSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = textQuery.trim();
    if (!query || nlpLoading) return;
    setTextQuery("");
    await runNlpSearch(query, true);
  };

  // cleanup
  useEffect(() => {
    return () => {
      stopMic();
      disconnectAPI();
    };
  }, []);

  return (
    <ProtectedRoute>
      <div className="relative flex flex-col h-[calc(100vh-64px)] w-full overflow-hidden">

        {/* Animated Background Gradients */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="relative z-10 flex flex-col h-full w-full max-w-[1400px] mx-auto p-4 md:p-6">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h1 className="text-4xl font-black text-gray-900 flex items-center gap-3">
                <span className="bg-clip-text">Dwellera AI</span>
                {connected && <div className="flex gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span><span className="w-2.5 h-2.5 rounded-full bg-green-500 absolute"></span></div>}
              </h1>
              <p className="text-gray-500 font-semibold tracking-wide uppercase text-xs mt-1">Next-Gen Real Estate Intelligence</p>
            </div>

            <div className="flex gap-3">
              {!connected ? (
                <button
                  onClick={connectAPI}
                  className="group relative px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all duration-300 shadow-xl hover:shadow-2xl overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Initialize AI Instance
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
              ) : (
                <button onClick={disconnectAPI} className="px-8 py-3 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-all border border-red-100">
                  Terminate Session
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
            
            {/* Left Column: Chat Interface */}
            <div className="flex-[4] flex flex-col bg-white/40 backdrop-blur-xl border border-white/40 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.1)] rounded-[2.5rem] overflow-hidden relative z-0">
              {/* Logs View */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
                {logs.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 px-4">
                    <div className="w-20 h-20 mb-6 bg-white/50 rounded-full flex items-center justify-center shadow-inner">
                       <svg className="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </div>
                    <p className="font-bold text-gray-900 mb-1">Dwellera AI Voice is Ready</p>
                    <p className="max-w-xs text-sm">Connect and click the microphone to describe what you're looking for.</p>
                  </div>
                )}
                {logs.map((log, i) => (
                  <div key={i} className={`flex ${log.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`
                    max-w-[85%] rounded-[1.5rem] px-5 py-3.5 shadow-sm text-sm font-medium leading-relaxed
                    ${log.role === 'system' ? 'bg-gray-100/80 text-gray-500 mx-auto w-full text-center text-xs' : 
                      log.role === 'user' ? 'bg-blue-600 text-white rounded-br-none ml-auto' : 'bg-white border text-gray-800 rounded-bl-none'}
                  `}>
                    {log.role === 'gemini' ? (
                      <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-blue prose-strong:text-blue-700">
                        <ReactMarkdown>{log.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p>{log.text}</p>
                        {log.properties && log.properties.length > 0 && (
                          <div className="grid grid-cols-1 gap-3 mt-4">
                            {log.properties.map((prop, idx) => (
                              <div key={idx} className="bg-white border rounded-2xl overflow-hidden flex shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
                                <div className="w-24 h-24 flex-shrink-0 relative overflow-hidden">
                                   <img 
                                     src={prop.image_urls?.[0] || 'https://via.placeholder.com/100'} 
                                     alt={prop.title}
                                     className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                   />
                                </div>
                                <div className="flex-1 p-3 flex flex-col justify-center">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{prop.title}</h4>
                                    <p className="text-blue-600 font-black text-xs shrink-0">${prop.price.toLocaleString()}</p>
                                  </div>
                                  <div className="flex gap-2 mt-1 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                                    <span>{prop.bedrooms} Bed</span>
                                    <span>•</span>
                                    <span>{prop.property_type}</span>
                                  </div>
                                  
                                  <div className="flex gap-2 mt-3">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setSelectedListing(prop); }}
                                      className="flex-1 py-1.5 bg-gray-50 text-gray-700 text-[10px] font-bold rounded-lg border hover:bg-white transition-colors"
                                    >
                                      View Details
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); window.location.href = `/messages?listing_id=${prop.id || prop.listing_id}&receiver_id=${prop.seller_id}`; }}
                                      className="flex-1 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                                    >
                                      Contact Agent
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                ))}
              </div>

              {/* Voice Controls */}
              <div className="p-4 md:p-6 bg-white border-t shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] relative z-10">
                <form onSubmit={handleTextSearch} className="flex gap-2 mb-4">
                  <input
                    value={textQuery}
                    onChange={e => setTextQuery(e.target.value)}
                    placeholder="Try: 3 bed houses in San Jose under $2M with modern finishes"
                    className="flex-1 px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    aria-label="Natural language property search"
                  />
                  <button
                    type="submit"
                    disabled={!textQuery.trim() || nlpLoading}
                    className="px-5 py-3 bg-primary text-white font-bold rounded-2xl hover:bg-black transition disabled:opacity-50"
                  >
                    {nlpLoading ? "Searching" : "Search"}
                  </button>
                </form>

                {lastSearchSummary && (
                  <p className="text-xs text-gray-500 mb-4 text-center">{lastSearchSummary}</p>
                )}

                <div className="flex justify-center items-center">
                  {connected ? (
                    <button
                      onClick={micActive ? stopMic : startMic}
                      className={`
                        w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl
                        ${micActive ? 'bg-red-500 scale-110 shadow-red-500/40' : 'bg-primary hover:scale-105 shadow-primary/40'}
                     `}
                      aria-label={micActive ? "Stop microphone" : "Start microphone"}
                    >
                      {micActive ? (
                        <div className="w-5 h-5 bg-white rounded-sm animate-pulse"></div>
                      ) : (
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 font-bold bg-gray-50 px-6 py-3 rounded-full border border-dashed border-gray-200">
                      <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                      Initialize Interface for voice
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Map Visualization */}
            <div className={`flex-[5] bg-white rounded-[2.5rem] border overflow-hidden shadow-2xl relative transition-all duration-500 ${foundProperties.length > 0 ? 'opacity-100 scale-100' : 'opacity-60 scale-[0.98]'}`}>
              <div className="absolute top-6 left-6 z-10 flex gap-2">
                <div className="bg-white/90 backdrop-blur-md border px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 transition-all">
                  <div className={`w-3 h-3 rounded-full ${foundProperties.length > 0 ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                  <span className="text-xs font-black uppercase text-gray-700 tracking-tighter">
                    {foundProperties.length} Properties Located
                  </span>
                </div>
              </div>
              
              <MapComponent listings={foundProperties} />

              {foundProperties.length === 0 && (
                <div className="absolute inset-0 bg-gray-900/5 backdrop-blur-[2px] pointer-events-none flex items-center justify-center p-12 text-center">
                  <div className="max-w-xs space-y-2">
                    <p className="font-black text-gray-900 text-lg">Waiting for Queries</p>
                    <p className="text-sm text-gray-500 font-medium">Ask Gemini to search for listings to populate the geographic visualization.</p>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Global Property Details Modal */}
        {selectedListing && (
          <PropertyDetailsModal 
            listing={selectedListing} 
            onClose={() => setSelectedListing(null)} 
          />
        )}

      </div>
    </ProtectedRoute>
  );
}
