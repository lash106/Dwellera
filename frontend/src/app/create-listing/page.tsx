"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import dynamic from 'next/dynamic';

const LocationPickerMap = dynamic(() => import('@/components/LocationPickerMap'), { ssr: false });

export default function CreateListingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    bedrooms: 1,
    bathrooms: 1,
    property_type: "House",
    location_lat: 37.7749,
    location_lng: -122.4194,
  });

  useEffect(() => {
    const checkVerification = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users/${session.user.id}`);
        if (res.ok) {
          const data = await res.json();
          setVerificationStatus(data.verification_status || "pending");
        }
      } catch (err) {
        console.error("Failed to check seller verification", err);
      }
    };
    checkVerification();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      if (selectedFiles.length > 5) {
        alert("You can only upload up to 5 images.");
        return;
      }
      setFiles(selectedFiles);
    }
  };

  const uploadToCloudinary = async (file: File) => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET; 

    if (!cloudName || !uploadPreset) throw new Error("Missing Cloudinary Next.js Environment Variables (Cloud Name or Upload Preset)!");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Cloudinary Upload Failed");
    return data.secure_url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return alert("Please select at least 1 image.");
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not logged in!");

      const userRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/users/${session.user.id}`);
      if (userRes.ok) {
        const appUser = await userRes.json();
        if (appUser.verification_status !== "verified") {
          alert(`Seller verification required before listing. Current status: ${appUser.verification_status}`);
          setVerificationStatus(appUser.verification_status);
          setLoading(false);
          return;
        }
      }

      // 1. Upload Images to Cloudinary sequentially
      const uploadedUrls = [];
      for (const file of files) {
        const url = await uploadToCloudinary(file);
        uploadedUrls.push(url);
      }

      // 2. Submit to Backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          price: parseFloat(form.price),
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          property_type: form.property_type,
          location_lat: parseFloat(form.location_lat as any),
          location_lng: parseFloat(form.location_lng as any),
          image_urls: uploadedUrls,
          seller_id: session.user.id
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create listing on backend");
      }
      
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      alert("Error creating listing. Make sure backend is running on port 8000!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Create New Listing</h1>
        {verificationStatus && verificationStatus !== "verified" && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-900">
            <h2 className="font-bold">Listing access locked</h2>
            <p className="text-sm mt-1">Your seller verification is currently {verificationStatus.replaceAll('_', ' ')}. An agent must approve your ID before you can publish properties.</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className={`space-y-6 bg-white p-8 rounded-xl shadow-sm border ${verificationStatus && verificationStatus !== "verified" ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Title</label>
              <input 
                type="text" required
                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                placeholder="e.g. Modern Villa in San Francisco"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea 
                required rows={4}
                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Describe the property..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                <input 
                  type="number" required min="0" step="0.01"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                  value={form.price} onChange={e => setForm({...form, price: e.target.value})}
                  placeholder="1000000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                <select 
                  className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary bg-white"
                  value={form.property_type} onChange={e => setForm({...form, property_type: e.target.value})}
                >
                  <option value="House">House</option>
                  <option value="Apartment">Apartment</option>
                  <option value="Condo">Condo</option>
                  <option value="Townhouse">Townhouse</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                <input 
                  type="number" required min="0" step="1"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                  value={form.bedrooms} onChange={e => setForm({...form, bedrooms: parseInt(e.target.value) || 0})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                <input 
                  type="number" required min="0" step="1"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                  value={form.bathrooms} onChange={e => setForm({...form, bathrooms: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location (Click to pin)</label>
              <LocationPickerMap 
                lat={form.location_lat} 
                lng={form.location_lng} 
                onChange={(lat, lng) => setForm({...form, location_lat: lat, location_lng: lng})} 
              />
              <p className="text-xs text-gray-500 mt-2 text-right">Selected: {form.location_lat.toFixed(4)}, {form.location_lng.toFixed(4)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload Property Images (Max 5)</label>
              
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 hover:bg-gray-100 transition cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) {
                    const selectedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                    if (selectedFiles.length > 5) {
                      alert("You can only upload up to 5 images.");
                    } else {
                      setFiles(selectedFiles);
                    }
                  }
                }}
                onClick={() => document.getElementById('fileUpload')?.click()}
              >
                <div className="flex flex-col items-center justify-center space-y-2">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <p className="text-gray-600 font-medium">Click to upload or drag and drop</p>
                  <p className="text-sm text-gray-500">SVG, PNG, JPG (max 5 files)</p>
                </div>
                <input 
                  id="fileUpload" type="file" multiple accept="image/*" className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {files.map((file, i) => (
                    <div key={i} className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium border border-gray-200">
                      {file.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button 
              type="button" onClick={() => router.push('/dashboard')}
              className="mr-4 px-6 py-2 border rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button 
              type="submit" disabled={loading}
              className="px-6 py-2 bg-primary text-white font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
            >
              {loading ? "Publishing..." : "Publish Listing"}
            </button>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
