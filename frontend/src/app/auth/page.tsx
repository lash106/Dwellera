"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('buyer'); // only used for signup
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [idCapture, setIdCapture] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, [router]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error", err);
      setError("Could not access camera. Please allow camera permission and try again.");
    }
  };

  const captureId = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setIdCapture(canvas.toDataURL("image/jpeg", 0.82));
    stopCamera();
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push('/dashboard');
    } else {
      if (!name.trim()) {
        setError("Full Name is required for signup.");
        setLoading(false);
        return;
      }
      if (role === "seller" && !idCapture) {
        setError("Seller signup requires an ID capture before account creation.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email, 
        password,
        options: {
          data: { role, full_name: name }
        }
      });
      if (error) setError(error.message);
      else {
        // Automatically sync new Supabase user to custom backend users table
        if (data.user) {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: data.user.id, email, name, role, id_document_image: role === "seller" ? idCapture : null })
            });
          } catch(e) {
            console.error("Failed to sync user to database", e);
          }
        }
        setError(role === "seller" ? 'Signup submitted. Your seller account is pending ID verification before you can list properties.' : 'Signup successful! You can now log in.');
        setIsLogin(true);
        setIdCapture('');
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white border rounded-xl shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {isLogin ? 'Sign in to Dwellera' : 'Create an Account'}
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {isLogin ? 'Enter your credentials to access the marketplace' : 'Join to buy or sell properties'}
          </p>
        </div>

        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
            <input 
              id="email"
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
            <input 
              id="password"
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
              placeholder="••••••••"
            />
          </div>

          {!isLogin && (
            <>
              <div className="space-y-1">
                <label htmlFor="name" className="text-sm font-medium text-gray-700">Full Name</label>
                <input 
                  id="name"
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" 
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">I want to...</label>
                <select 
                  value={role} 
                  onChange={(e) => {
                    setRole(e.target.value);
                    if (e.target.value !== "seller") {
                      setIdCapture('');
                      stopCamera();
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="buyer">Buy Properties</option>
                  <option value="seller">Sell Properties</option>
                </select>
              </div>

              {role === "seller" && (
                <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Seller ID Verification</p>
                    <p className="text-xs text-gray-500 mt-1">Capture a clear photo of a government ID. Listing access stays locked until an agent approves it.</p>
                  </div>

                  {idCapture ? (
                    <div className="space-y-2">
                      <img src={idCapture} alt="Captured ID preview" className="w-full h-40 object-cover rounded-md border bg-white" />
                      <button
                        type="button"
                        onClick={() => setIdCapture('')}
                        className="w-full py-2 border rounded-md text-sm font-medium hover:bg-white transition"
                      >
                        Retake ID Photo
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <video ref={videoRef} className={`w-full h-40 rounded-md border bg-black object-cover ${cameraActive ? 'block' : 'hidden'}`} playsInline muted />
                      {!cameraActive ? (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="w-full py-2 bg-gray-900 text-white rounded-md text-sm font-bold hover:bg-black transition"
                        >
                          Open Camera
                        </button>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={captureId}
                            className="py-2 bg-gray-900 text-white rounded-md text-sm font-bold hover:bg-black transition"
                          >
                            Capture ID
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="py-2 border rounded-md text-sm font-medium hover:bg-white transition"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-2.5 px-4 text-white bg-primary hover:bg-gray-800 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary font-medium transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="text-center text-sm">
          <span className="text-gray-500">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button 
            onClick={() => { setIsLogin(!isLogin); setError(''); }} 
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
