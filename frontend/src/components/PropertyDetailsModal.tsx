"use client";

import { useState } from "react";

const ImageCarousel = ({ urls, title, className }: { urls: string[], title: string, className?: string }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!urls || urls.length === 0) {
    return <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>No Image</div>;
  }

  const next = (e: React.MouseEvent) => { e.stopPropagation(); setCurrentIndex(i => (i + 1) % urls.length); };
  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setCurrentIndex(i => (i - 1 + urls.length) % urls.length); };

  return (
    <div className={`relative group overflow-hidden ${className}`}>
      <img src={urls[currentIndex]} alt={`${title} - image ${currentIndex + 1}`} className="w-full h-full object-cover transition-all duration-300" />
      
      {urls.length > 1 && (
        <>
          <button 
            onClick={prev} 
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-gray-800 shadow opacity-0 group-hover:opacity-100 transition z-10"
          >
            <svg className="w-5 h-5 pr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          
          <button 
            onClick={next} 
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-gray-800 shadow opacity-0 group-hover:opacity-100 transition z-10"
          >
            <svg className="w-5 h-5 pl-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}
    </div>
  );
};

function MortgageCalculator({ price }: { price: number }) {
  const [downPct, setDownPct] = useState(20);
  const [ratePct, setRatePct] = useState(6.75);
  const [termYears, setTermYears] = useState(30);

  const downPayment = Math.round(price * downPct / 100);
  const loan = price - downPayment;
  const monthlyRate = ratePct / 100 / 12;
  const n = termYears * 12;
  const monthly = monthlyRate === 0
    ? loan / n
    : loan * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  const totalPaid = monthly * n;
  const totalInterest = totalPaid - loan;

  return (
    <div className="mt-8 mb-10 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-8 border border-blue-100">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-900">
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Mortgage Calculator
      </h3>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-bold text-gray-600 uppercase tracking-wider">Down Payment</label>
              <span className="text-sm font-black text-blue-600">{downPct}% — ${downPayment.toLocaleString()}</span>
            </div>
            <input
              type="range" min={5} max={40} step={1} value={downPct}
              onChange={e => setDownPct(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600 bg-blue-200"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1 font-medium">
              <span>5%</span><span>40%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-bold text-gray-600 uppercase tracking-wider">Interest Rate</label>
              <span className="text-sm font-black text-blue-600">{ratePct.toFixed(2)}%</span>
            </div>
            <input
              type="range" min={2} max={12} step={0.25} value={ratePct}
              onChange={e => setRatePct(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600 bg-blue-200"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1 font-medium">
              <span>2%</span><span>12%</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-gray-600 uppercase tracking-wider block mb-3">Loan Term</label>
            <div className="flex gap-2">
              {[10, 15, 20, 30].map(y => (
                <button
                  key={y}
                  onClick={() => setTermYears(y)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${termYears === y ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}
                >
                  {y}yr
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4">
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-blue-100">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Monthly Payment</p>
            <p className="text-5xl font-black text-blue-600 tracking-tighter">${Math.round(monthly).toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-2">principal + interest</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Loan Amount</p>
              <p className="text-lg font-black text-gray-800">${loan.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Total Interest</p>
              <p className="text-lg font-black text-red-500">${Math.round(totalInterest).toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm border border-gray-100">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Total Cost</p>
            <p className="text-xl font-black text-gray-900">${Math.round(totalPaid + downPayment).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PropertyDetailsModal({ listing, onClose }: { listing: any, onClose: () => void }) {
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  if (!listing) return null;

  const matterportUrl = listing.matterport_url || listing.matterportUrl;
  const viewerUrl = matterportUrl
    ? `${matterportUrl}${matterportUrl.includes("?") ? "&" : "?"}play=1`
    : "";

  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex justify-center items-center p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative animate-in zoom-in-95 duration-300">
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 bg-white/90 hover:bg-white rounded-full p-2.5 shadow-xl hover:scale-110 transition z-50 backdrop-blur-sm border"
        >
          <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="relative">
          <ImageCarousel urls={listing.image_urls} title={listing.title} className="w-full h-[400px] bg-gray-100" />
          {matterportUrl && (
            <button
              onClick={() => setShowWalkthrough(true)}
              className="absolute bottom-4 right-4 z-40 bg-black hover:bg-gray-900 text-white rounded-full px-4 py-2 shadow-xl font-black text-sm flex items-center gap-2 transition hover:scale-105"
              aria-label="Open 3D walkthrough"
              title="Open 3D walkthrough"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                <path d="M12 12l8-4.5" />
                <path d="M12 12v9" />
                <path d="M12 12L4 7.5" />
              </svg>
              3D Walkthrough
            </button>
          )}
        </div>

        {showWalkthrough && matterportUrl && (
          <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h3 className="font-black text-gray-900">3D Walkthrough</h3>
                  <p className="text-xs text-gray-500 line-clamp-1">{listing.title}</p>
                </div>
                <button
                  onClick={() => setShowWalkthrough(false)}
                  className="w-10 h-10 rounded-full border flex items-center justify-center hover:bg-gray-50 transition"
                  aria-label="Close 3D walkthrough"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="aspect-video bg-black">
                <iframe
                  src={viewerUrl}
                  title={`${listing.title} Matterport walkthrough`}
                  className="w-full h-full"
                  allow="fullscreen; xr-spatial-tracking"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}

        <div className="p-8 md:p-12">
          <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
            <div>
              <h2 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">{listing.title}</h2>
              <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
                <span className="bg-gray-100 px-4 py-1.5 rounded-full border">{listing.property_type || 'Property'}</span>
                <span className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full border border-blue-100">{listing.bedrooms} Beds</span>
                <span className="bg-purple-50 text-purple-600 px-4 py-1.5 rounded-full border border-purple-100">{listing.bathrooms} Baths</span>
              </div>
            </div>
            <div className="text-right">
               <p className="text-4xl font-black text-blue-600 tracking-tighter">${listing.price.toLocaleString()}</p>
               <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Market Price</p>
            </div>
          </div>

          <div className="mt-8 mb-12">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
               <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
               Property Description
            </h3>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-lg font-medium opacity-90">{listing.description}</p>
          </div>

          <MortgageCalculator price={listing.price} />

          <div className="border-t pt-8 flex flex-col md:flex-row justify-end gap-4">
            <button 
              onClick={onClose}
              className="px-8 py-4 border border-gray-200 font-bold rounded-2xl hover:bg-gray-50 transition-all text-gray-600 shadow-sm"
            >
              Return Home
            </button>
            <button 
              onClick={() => window.location.href = `/messages?listing_id=${listing.id || listing.listing_id}&receiver_id=${listing.seller_id}`}
              className="px-10 py-4 bg-gray-900 text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Contact Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
