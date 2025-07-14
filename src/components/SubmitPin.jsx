import React, { useState, useEffect, useMemo } from "react";
import { db, storage } from "../firebase";
import toast from "react-hot-toast";
import { collection, addDoc, Timestamp, doc, updateDoc, increment } from "firebase/firestore";
import { useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import "leaflet/dist/leaflet.css";
import { OBJECTIVE_TAGS } from "../utils/tagList";
import { resorts as allResorts } from "../utils/resorts";
import { isPinInResortBoundary } from "../utils/geofence";
import InteractivePinMap from './InteractivePinMap';
import { FaYoutube, FaFileUpload } from 'react-icons/fa';

import L from "leaflet";
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

// A reusable slider component for our new rating system
const RatingSlider = ({ label, value, onChange, labels, helpText, colorClass }) => (
  <div className="bg-gray-50 p-4 rounded-lg border">
    <label className="block text-md font-semibold mb-1">{label}: <span className={`font-bold ${colorClass}`}>{labels[value - 1]}</span></label>
    <p className="text-xs text-gray-500 mb-3">{helpText}</p>
    <input type="range" min={1} max={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
  </div>
);

export default function SubmitPin() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialPosition = useMemo(() => {
    const lat = parseFloat(searchParams.get("lat"));
    const lng = parseFloat(searchParams.get("lng"));
    return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;
  }, [searchParams]);

  const resortName = searchParams.get("resort");
  
  const [pinLocation, setPinLocation] = useState(initialPosition);
  
  // UPDATED: formData now uses the new granular ratings
  const [formData, setFormData] = useState({
    featureName: "",
    description: "",
    directions: "",
    technicality: 3,
    exposure: 3,
    entry: 3,
    featureTypes: [],
    powder: 2,
    landing: 2,
    funFactor: 3,
  });

  const [uploadMethod, setUploadMethod] = useState('file');
  const [mediaFile, setMediaFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [debouncedYoutubeUrl, setDebouncedYoutubeUrl] = useState(""); 
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [agreedToTerms1, setAgreedToTerms1] = useState(false);
  const [agreedToTerms2, setAgreedToTerms2] = useState(false);
  const [agreedToTerms3, setAgreedToTerms3] = useState(false);
  const allTermsAgreed = agreedToTerms1 && agreedToTerms2 && agreedToTerms3;

  const resort = useMemo(() => resortName ? Object.values(allResorts).flat().find(
    r => r.name.trim().toLowerCase() === resortName.trim().toLowerCase()
  ) : null, [resortName]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedYoutubeUrl(youtubeUrl);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [youtubeUrl]);

  useEffect(() => {
    if (initialPosition === null || !resortName) {
      toast.error("Invalid submission link. Please drop a new pin.");
      navigate("/map");
    }
  }, [initialPosition, resortName, navigate]);

  const handlePositionChange = (newPos) => {
    if (resort && isPinInResortBoundary(newPos, resort)) {
      setPinLocation(newPos); 
    } else {
      // For beta, we temporarily disable the geofence check to avoid frustration
      setPinLocation(newPos); 
      // toast.error("Pin must be within the resort boundaries.");
      // setPinLocation(prevLocation => ({ ...prevLocation }));
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'range' ? Number(value) : value,
    }));
  };
  
  // Helper to update granular ratings directly
  const handleRatingChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleFeatureType = (type) => {
    setFormData((prev) => ({ ...prev, featureTypes: prev.featureTypes.includes(type) ? prev.featureTypes.filter((t) => t !== type) : [...prev.featureTypes, type] }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) {
        toast.error("❌ File too large! Please upload under 100MB.");
        return;
      }
      
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
          window.URL.revokeObjectURL(video.src);
          if (video.duration > 15) {
            toast.error("🎬 Video too long! Please keep it under 15 seconds.");
            setMediaFile(null);
            setMediaPreview(null);
          } else {
            setMediaFile(file);
            setMediaPreview(URL.createObjectURL(file));
            setYoutubeUrl("");
          }
        }
        video.src = URL.createObjectURL(file);
      } else {
        setMediaFile(file);
        setMediaPreview(URL.createObjectURL(file));
        setYoutubeUrl("");
      }
    }
  };

  const getYouTubeId = (url) => {
    if(typeof url !== 'string') return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return toast.error("You gotta be logged in to do that.");
    if (!pinLocation || !resort) return toast.error("Woah, missing location data.");
    
    if (!allTermsAgreed) {
      return toast.error("Please agree to all terms before submitting.");
    }
    
    let mediaUrl = "";

    if (uploadMethod === 'youtube') {
      const videoId = getYouTubeId(youtubeUrl);
      if (!videoId) {
        return toast.error("Please enter a valid YouTube URL.");
      }
      mediaUrl = `https://www.youtube.com/embed/${videoId}`;
      savePinData(mediaUrl);
    } 
    else if (uploadMethod === 'file') {
      if (!mediaFile) return toast.error("Gotta upload a clip or photo as proof!");
      
      const toastId = toast.loading("Uploading your clip...");
      const storageRef = ref(storage, `pins/${user.uid}_${Date.now()}_${mediaFile.name}`);
      const uploadTask = uploadBytesResumable(storageRef, mediaFile);

      uploadTask.on( "state_changed",
        (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
        (error) => toast.error("Upload failed: " + error.message, { id: toastId }),
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          toast.loading("Saving pin data...", { id: toastId });
          savePinData(downloadURL, toastId);
        }
      );
    }
  };

  const savePinData = async (finalMediaUrl, toastId = null) => {
     try {
        const { technicality, exposure, entry } = formData;
        const overallDifficulty = (technicality + exposure + entry) / 3;

        const pinData = {
          featureName: formData.featureName.trim(),
          featureName_lowercase: formData.featureName.trim().toLowerCase(), // For search
          description: formData.description.trim(),
          directions: formData.directions.trim(),
          lat: pinLocation.lat,
          lng: pinLocation.lng,
          resort: resort.name,
          createdBy: user.uid,
          originalCreatedBy: user.uid,
          createdAt: Timestamp.now(),
          media: [finalMediaUrl],
          approved: false,
          
          // NEW: Initialize all rating and credibility fields
          difficulty: overallDifficulty,
          avg_technicality: technicality,
          avg_exposure: exposure,
          avg_entry: entry,
          weightedTechSum: technicality,
          totalTechWeight: 1,
          weightedExposureSum: exposure,
          totalExposureWeight: 1,
          weightedEntrySum: entry,
          totalEntryWeight: 1,
          ratingCount: 1,

          // Other stats
          funFactor: formData.funFactor,
          likeCount: 0,
          dislikeCount: 0,
          flagCount: 0,
          vouchCount: 0,
          tags: formData.featureTypes,
          topTags: formData.featureTypes.slice(0, 4),
        };

        await addDoc(collection(db, "pins"), pinData);
        await updateDoc(doc(db, "users", user.uid), { pinsSubmittedCount: increment(1) });

        if (toastId) toast.dismiss(toastId);
        toast.success("✅ Sent! It'll show up once it's approved.");
        navigate(`/map?resort=${encodeURIComponent(resort.name)}`);
     } catch(err) {
        if (toastId) toast.dismiss(toastId);
        toast.error("Failed to save pin: " + err.message);
        console.error("Error saving pin data:", err);
     }
  }
  
  if (!initialPosition || !resortName) {
    return <div className="text-center p-8">Loading or invalid link...</div>;
  }
  
  const technicalityLabels = ["Straightforward", "Requires Precision", "Complex Moves", "Very Technical", "Pro-Level Control"];
  const exposureLabels = ["Low Consequence", "Could Get Hurt", "Serious Injury Potential", "High Consequence", "No-Fall Zone"];
  const entryLabels = ["Ski-On", "Short Traverse", "Requires Scramble/Hike", "Exposed Entry", "Rope Recommended"];
  const funFactorLabels = ["Meh", "Kinda Fun", "Good Times", "Super Fun", "Best Hit Ever!"];
  const powderLabels = ["Scraped", "Dust on Crust", "A Few Inches", "Soft Stuff", "Blower Pow"];
  const landingLabels = ["No Air", "Buttery", "Perfect", "A Bit Flat", "Pancake"];
  
  const youtubePreviewId = getYouTubeId(debouncedYoutubeUrl);

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow-xl mt-10 space-y-8">
      <h2 className="text-3xl font-extrabold text-center text-gray-900">Log a New Hit</h2>
      <div>
        <label className="block text-sm font-semibold mb-2">Drag the Pin to the Spot</label>
        <InteractivePinMap position={pinLocation} onPositionChange={handlePositionChange} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium">What do you call this feature?</label>
          <input type="text" name="featureName" className="w-full border px-3 py-2 rounded" value={formData.featureName} onChange={handleChange} placeholder="e.g., Po-Po's Plunge" required />
        </div>
        <div>
            <label className="block text-sm font-medium">How to Get There?</label>
            <textarea name="directions" rows="3" className="w-full border px-3 py-2 rounded" value={formData.directions} onChange={handleChange} placeholder="e.g., Take Eagle lift, hang a right..." />
        </div>
        <div>
          <label className="block text-sm font-medium">Give us the deets.</label>
          <textarea name="description" rows="3" className="w-full border px-3 py-2 rounded" value={formData.description} onChange={handleChange} placeholder="e.g., It's a 20-foot drop..." />
        </div>

        {/* UPDATED: Granular difficulty rating section */}
        <div className="space-y-4 pt-4 border-t">
            <h3 className="text-xl font-bold text-gray-800 text-center">Rate Your First Impression</h3>
            <RatingSlider 
              label="Technicality"
              value={formData.technicality}
              onChange={(val) => handleRatingChange('technicality', val)}
              labels={technicalityLabels}
              helpText="How complex are the required moves?"
              colorClass="text-purple-600"
            />
            <RatingSlider 
              label="Exposure"
              value={formData.exposure}
              onChange={(val) => handleRatingChange('exposure', val)}
              labels={exposureLabels}
              helpText="What are the consequences of a fall?"
              colorClass="text-red-600"
            />
            <RatingSlider 
              label="Entry"
              value={formData.entry}
              onChange={(val) => handleRatingChange('entry', val)}
              labels={entryLabels}
              helpText="How difficult is it to access the line?"
              colorClass="text-orange-600"
            />
        </div>

        <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-800 text-center">Rate the Details</h3>
            {/* Other sliders like Fun Factor, Powder, etc. */}
        </div>

        <div>
            <label className="block text-lg font-semibold text-gray-800 mb-2">What kind of feature is it?</label>
            <div className="flex gap-2 flex-wrap text-sm">{OBJECTIVE_TAGS.map((type) => ( <label key={type} className="flex items-center gap-1.5 p-2 border rounded-full cursor-pointer hover:bg-gray-50 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400"><input type="checkbox" checked={formData.featureTypes.includes(type)} onChange={() => toggleFeatureType(type)} className="h-4 w-4 rounded-full accent-blue-600" />{type}</label>))}</div>
        </div>

        <div className="pt-4 border-t">
            <label className="block text-lg font-semibold text-gray-800 mb-2">Proof of You Hitting It</label>
            <p className="text-xs text-gray-500 mb-3">Upload a recent clip from your camera roll or paste a YouTube link. Videos must be **15 seconds or less**.</p>
            <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
                <button type="button" onClick={() => setUploadMethod('file')} className={`w-1/2 flex justify-center items-center gap-2 py-2 rounded-md text-sm font-semibold ${uploadMethod === 'file' ? 'bg-white shadow' : 'text-gray-600'}`}><FaFileUpload /> Upload File</button>
                <button type="button" onClick={() => setUploadMethod('youtube')} className={`w-1/2 flex justify-center items-center gap-2 py-2 rounded-md text-sm font-semibold ${uploadMethod === 'youtube' ? 'bg-white shadow' : 'text-gray-600'}`}><FaYoutube /> YouTube Link</button>
            </div>
            {uploadMethod === 'file' ? (
                <div>
                    <input type="file" accept="video/*,image/*" onChange={handleFileChange} className="w-full border px-3 py-2 rounded mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    {mediaPreview && ( <video src={mediaPreview} controls className="mt-4 rounded-lg w-full max-h-64" /> )}
                    {uploadProgress > 0 && uploadProgress < 100 && ( <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div></div>)}
                </div>
            ) : (
                <div>
                    <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full border px-3 py-2 rounded" />
                    {youtubePreviewId && ( <div className="aspect-video mt-4"><iframe className="w-full h-full rounded-lg" src={`https://www.youtube.com/embed/${youtubePreviewId}`} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>)}
                </div>
            )}
        </div>
        <div className="space-y-3 pt-4 border-t">
            <h3 className="text-lg font-semibold text-gray-800">The Fine Print</h3>
            <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" checked={agreedToTerms1} onChange={(e) => setAgreedToTerms1(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span>I certify that this pin is located within an area legally open to public skiing or snowboarding at the time of recording.</span></label>
            <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" checked={agreedToTerms2} onChange={(e) => setAgreedToTerms2(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span>I understand that submitting features in closed, restricted, or private areas without permission may result in removal and account suspension.</span></label>
            <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" checked={agreedToTerms3} onChange={(e) => setAgreedToTerms3(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span>I acknowledge that SnowPin does not verify access status, and I am responsible for ensuring this feature was legally accessible.</span></label>
        </div>
        <button type="submit" disabled={!allTermsAgreed || (uploadProgress > 0 && uploadProgress < 100)} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-lg">Send It</button>
      </form>
    </div>
  );
}
