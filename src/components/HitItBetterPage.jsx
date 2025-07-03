// src/components/HitItBetterPage.jsx
import React, { useState, useEffect, useMemo } from "react";
import { db, storage } from "../firebase.js";
import toast from "react-hot-toast";
import { collection, addDoc, Timestamp, doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { useOutletContext, useNavigate, useParams, Link } from "react-router-dom";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { FaYoutube, FaFileUpload, FaMedal } from 'react-icons/fa';

// Helper to render a media URL (either a direct video or a YouTube embed)
const MediaRenderer = ({ url, title }) => {
    if (!url) return <div className="aspect-video w-full bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">No media available.</div>;

    const isYoutube = url.includes("youtube.com/embed");

    return (
        <div className="w-full bg-black rounded-xl shadow-lg overflow-hidden">
            {isYoutube ? (
                <div className="aspect-video">
                    <iframe className="w-full h-full" src={url} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                </div>
            ) : (
                <video controls src={url} className="w-full h-auto" />
            )}
        </div>
    );
};


export default function HitItBetterPage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const { pinId } = useParams();

  const [pin, setPin] = useState(null);
  const [loading, setLoading] = useState(true);

  // State for the new submission form
  const [uploadMethod, setUploadMethod] = useState('file');
  const [mediaFile, setMediaFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [debouncedYoutubeUrl, setDebouncedYoutubeUrl] = useState("");
  const [mediaPreview, setMediaPreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for legal checkboxes
  const [agreedToTerms1, setAgreedToTerms1] = useState(false);
  const [agreedToTerms2, setAgreedToTerms2] = useState(false);
  const allTermsAgreed = agreedToTerms1 && agreedToTerms2;

  // Debounce YouTube URL input for smoother preview updates
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedYoutubeUrl(youtubeUrl);
    }, 500);
    return () => clearTimeout(handler);
  }, [youtubeUrl]);
  
  // Fetch current pin data to show what's being challenged
  useEffect(() => {
      if (!pinId) {
          toast.error("No pin specified to challenge.");
          navigate("/");
          return;
      }
      const fetchPin = async () => {
          setLoading(true);
          const pinRef = doc(db, 'pins', pinId);
          const pinSnap = await getDoc(pinRef);
          if (pinSnap.exists()) {
              setPin({ id: pinSnap.id, ...pinSnap.data() });
          } else {
              toast.error("The pin you're trying to challenge doesn't exist.");
              navigate("/");
          }
          setLoading(false);
      }
      fetchPin();
  }, [pinId, navigate]);


  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // THE FIX: Increased file size limit to 100MB
      if (file.size > 100 * 1024 * 1024) {
        toast.error("❌ File too large! Please upload under 100MB.");
        return;
      }
      
      // THE FIX: Check video duration is 15 seconds or less
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
          window.URL.revokeObjectURL(video.src);
          // THE FIX: Increased duration limit to 15 seconds
          if (video.duration > 15) {
            toast.error("🎬 Video too long! Please keep it under 15 seconds.");
            setMediaFile(null); // Clear the invalid file
            setMediaPreview(null);
          } else {
            setMediaFile(file);
            setMediaPreview(URL.createObjectURL(file));
            setYoutubeUrl("");
          }
        }
        video.src = URL.createObjectURL(file);
      } else { // It's an image, no duration check needed
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
    if (!user) return toast.error("You must be logged in to challenge.");
    if (!allTermsAgreed) return toast.error("Please agree to the terms first.");
    setIsSubmitting(true);
    
    let challengerMediaUrl = "";

    if (uploadMethod === 'youtube') {
      const videoId = getYouTubeId(youtubeUrl);
      if (!videoId) {
        setIsSubmitting(false);
        return toast.error("Please enter a valid YouTube URL.");
      }
      challengerMediaUrl = `https://www.youtube.com/embed/${videoId}`;
      await saveChallenge(challengerMediaUrl);
    } else if (uploadMethod === 'file') {
      if (!mediaFile) {
        setIsSubmitting(false);
        return toast.error("You need to upload a file to challenge!");
      }
      
      const toastId = toast.loading("Uploading your challenge...");
      const storageRef = ref(storage, `pins/${pinId}/dethroneChallenges/${user.uid}_${Date.now()}`);
      const uploadTask = uploadBytesResumable(storageRef, mediaFile);

      uploadTask.on("state_changed",
        (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
        (error) => {
            toast.error("Upload failed: " + error.message, { id: toastId });
            setIsSubmitting(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          toast.loading("Saving challenge...", { id: toastId });
          await saveChallenge(downloadURL, toastId);
        }
      );
    }
  };

  const saveChallenge = async (mediaUrl, toastId = null) => {
    try {
        const challengeData = {
            pinId: pinId,
            challengerId: user.uid,
            challengerUsername: user.username || "Anonymous",
            challengerMediaUrl: mediaUrl,
            originalMediaUrl: pin.media[0],
            originalSubmitterId: pin.createdBy,
            status: "pending", // pending -> approved -> voting -> (successful | failed)
            submittedAt: Timestamp.now(),
        };
        // Add to the new subcollection
        await addDoc(collection(db, `pins/${pinId}/dethroneChallenges`), challengeData);
        // Increment user's attempt count
        await updateDoc(doc(db, "users", user.uid), {
            dethroneAttemptsCount: increment(1)
        });

        if (toastId) toast.dismiss(toastId);
        toast.success("✅ Challenge Submitted! It will be reviewed by an admin.");
        navigate(`/pin/${pinId}`);

    } catch (err) {
        if (toastId) toast.dismiss(toastId);
        toast.error("Failed to submit challenge: " + err.message);
        console.error("Error saving challenge:", err);
    } finally {
        setIsSubmitting(false);
    }
  };

  const youtubePreviewId = getYouTubeId(debouncedYoutubeUrl);

  if (loading) {
      return <div className="text-center p-8">Loading Challenge Page...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-xl mt-10 space-y-8">
      {/* Page Header */}
      <div className="text-center">
          <FaMedal className="text-5xl text-yellow-500 mx-auto mb-2"/>
          <h1 className="text-3xl font-extrabold text-gray-900">Challenge for the Crown!</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
              Think your clip for <span className="font-bold">{pin?.featureName || 'this pin'}</span> is better? Submit it here to let the community decide! Earn badges for successful dethrones.
          </p>
      </div>

      {/* Video Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>
              <h2 className="font-bold text-lg mb-2 text-center">Current King of the Hill</h2>
              <MediaRenderer url={pin?.media[0]} title="Current Video" />
          </div>
          <div>
              <h2 className="font-bold text-lg mb-2 text-center">Your Challenger Clip</h2>
              {mediaPreview ? (
                  <MediaRenderer url={mediaPreview} title="Your Preview" />
              ) : youtubePreviewId ? (
                <div className="aspect-video">
                  <iframe className="w-full h-full rounded-xl" src={`https://www.youtube.com/embed/${youtubePreviewId}`} title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                </div>
              ) : (
                <div className="aspect-video w-full bg-gray-200 rounded-lg flex items-center justify-center">
                    <p className="text-gray-500">Your video preview will appear here.</p>
                </div>
              )}
          </div>
      </div>

      {/* Submission Form */}
      <form onSubmit={handleSubmit} className="space-y-6 pt-6 border-t">
        <div>
            <label className="block text-lg font-semibold text-gray-800 mb-2">Submit Your Clip</label>
            <p className="text-xs text-gray-500 mb-3">Upload a short clip from your camera roll or paste a YouTube link. Videos must be **15 seconds or less**.</p>
            <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
                <button type="button" onClick={() => setUploadMethod('file')} className={`w-1/2 flex justify-center items-center gap-2 py-2 rounded-md text-sm font-semibold ${uploadMethod === 'file' ? 'bg-white shadow' : 'text-gray-600'}`}><FaFileUpload /> Upload File</button>
                <button type="button" onClick={() => setUploadMethod('youtube')} className={`w-1/2 flex justify-center items-center gap-2 py-2 rounded-md text-sm font-semibold ${uploadMethod === 'youtube' ? 'bg-white shadow' : 'text-gray-600'}`}><FaYoutube /> YouTube Link</button>
            </div>
            {uploadMethod === 'file' ? (
                <div>
                    {/* THE FIX: Updated the accept attribute for better iPhone support */}
                    <input type="file" accept="video/*,image/*" onChange={handleFileChange} className="w-full border px-3 py-2 rounded mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    {uploadProgress > 0 && uploadProgress < 100 && ( <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div></div>)}
                </div>
            ) : (
                <div>
                    <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full border px-3 py-2 rounded" />
                </div>
            )}
        </div>

        {/* Legal and Recommendation Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
            <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-800">The Fine Print</h3>
                <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" checked={agreedToTerms1} onChange={(e) => setAgreedToTerms1(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span>I certify that my clip was recorded in an area legally open to public skiing or snowboarding.</span></label>
                <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" checked={agreedToTerms2} onChange={(e) => setAgreedToTerms2(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span>I acknowledge I am responsible for ensuring this feature was legally accessible. Submitting clips from closed areas may result in account suspension.</span></label>
            </div>
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg">
                <h4 className="font-bold">Don't Forget to Review!</h4>
                <p className="text-sm mt-1">
                    This form only submits your video for the challenge. To share your rating and opinion on the hit, go back and submit a normal review!
                </p>
                <Link to={`/pin/${pinId}/review`} className="text-sm font-bold text-blue-600 hover:underline mt-2 inline-block">Submit a Review →</Link>
            </div>
        </div>

        <button type="submit" disabled={isSubmitting || !allTermsAgreed} className="w-full bg-yellow-500 text-white py-3 rounded-lg font-semibold hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-lg">
          {isSubmitting ? 'Submitting Challenge...' : 'Challenge for the Crown!'}
        </button>
      </form>
    </div>
  );
}
