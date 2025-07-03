import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db, auth } from "../firebase";
import {
  doc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
  updateDoc,
  increment,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from "firebase/firestore";
import toast from "react-hot-toast";
import { FaExternalLinkAlt } from 'react-icons/fa';
import { OBJECTIVE_TAGS } from "../utils/tagList"; // Import the tags

// Helper to render the black diamond ratings
const renderBlackDiamonds = (count, size = 'text-xl') => (
  <div className="flex gap-0.5 text-gray-800">
    {[...Array(5)].map((_, i) => <span key={i} className={`${size} ${i < Math.round(count) ? 'text-black' : 'text-gray-300'}`}>◆</span>)}
  </div>
);


export default function HitReviewPage() {
  const { pinId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;

  // State for the pin data
  const [pin, setPin] = useState(null);
  const [loading, setLoading] = useState(true);

  // State for the form
  const [diamonds, setDiamonds] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [didFall, setDidFall] = useState(false);
  const [fallSeverity, setFallSeverity] = useState(0);
  const [tags, setTags] = useState([]); // NEW: State for selected tags

  // States for all sliders
  const [powder, setPowder] = useState(2);
  const [landing, setLanding] = useState(2);
  const [funFactor, setFunFactor] = useState(3);
  const [daredevilFactor, setDaredevilFactor] = useState(3);

  // Fetch pin data on component mount
  useEffect(() => {
    const fetchPin = async () => {
      if (!pinId) {
        navigate('/');
        return;
      }
      try {
        const pinRef = doc(db, "pins", pinId);
        const pinSnap = await getDoc(pinRef);
        if (pinSnap.exists()) {
          setPin({ id: pinSnap.id, ...pinSnap.data() });
          setDiamonds(Math.round(pinSnap.data().averageRating) || 0);
        } else {
          toast.error("Pin not found.");
          navigate('/');
        }
      } catch (error) {
        toast.error("Failed to load pin data.");
      } finally {
        setLoading(false);
      }
    };

    fetchPin();
  }, [pinId, navigate]);

  // NEW: Function to handle tag selection
  const toggleTag = (tag) => {
    setTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (diamonds === 0) return toast.error("You gotta rate the difficulty (the black diamonds).");
    if (!user) return toast.error("You must be logged in to submit a review.");
    if (!pinId) return toast.error("Error: Missing Pin ID.");

    setSubmitting(true);
    const toastId = toast.loading("Submitting your review...");

    try {
      // Cooldown Check... (no changes here)
      
      const reviewData = {
        pinId: pinId,
        userId: user.uid,
        createdAt: serverTimestamp(),
        rating: diamonds,
        fall: didFall,
        ...(didFall && { fallSeverity }),
        powder,
        landing,
        funFactor,
        daredevilFactor,
        comment,
        tags: tags, // NEW: Include tags in the review document
      };

      const pinRef = doc(db, "pins", pinId);
      
      // Use a transaction to update both pin and add review atomically
      await runTransaction(db, async (transaction) => {
        const pinDoc = await transaction.get(pinRef);
        if (!pinDoc.exists()) throw "Pin does not exist!";
        
        const pinData = pinDoc.data();
        
        // Update ratings
        const oldRatingCount = pinData.ratingCount || 0;
        const newRatingCount = oldRatingCount + 1;
        const getNewAverage = (currentAvg, newValue) => ((currentAvg || 0) * oldRatingCount + newValue) / newRatingCount;
        
        // NEW: Update tag counts
        const newTagCounts = { ...(pinData.tagCounts || {}) };
        tags.forEach(tag => {
          newTagCounts[tag] = (newTagCounts[tag] || 0) + 1;
        });

        // NEW: Recalculate top 3 tags
        const sortedTags = Object.entries(newTagCounts).sort(([,a],[,b]) => b-a);
        const newTopTags = sortedTags.slice(0, 3).map(([key]) => key);

        // Add the new review document
        const reviewRef = doc(collection(pinRef, "reviews"));
        transaction.set(reviewRef, reviewData);
        
        // Update the main pin document
        transaction.update(pinRef, {
            ratingCount: newRatingCount,
            averageRating: getNewAverage(pinData.averageRating, diamonds),
            difficulty: Math.round(getNewAverage(pinData.averageRating, diamonds)),
            averageFunFactor: getNewAverage(pinData.averageFunFactor, funFactor),
            averageDaredevilFactor: getNewAverage(pinData.averageDaredevilFactor, daredevilFactor),
            tagCounts: newTagCounts,
            topTags: newTopTags,
        });
      });
      
      await updateDoc(doc(db, "users", user.uid), { pinsReviewedCount: increment(1) });
      toast.dismiss(toastId);
      toast.success("Review submitted successfully!");
      navigate(`/pin/${pinId}`);

    } catch (err) {
      console.error("Error submitting review:", err);
      toast.dismiss(toastId);
      toast.error("Something went wrong. Try again: " + err.message);
    }

    setSubmitting(false);
  };
  
  const difficultyLabels = ["Cruisey", "Challenging", "Spicy", "Expert Tier", "Pro Line"];
  const funFactorLabels = ["Meh", "Kinda Fun", "Good Times", "Super Fun", "Best Hit Ever!"];
  const daredevilLabels = ["Low Commitment", "Requires Focus", "Full Send", "Calculated Risk", "Huck and Pray"];
  const powderLabels = ["Scraped", "Dust on Crust", "A Few Inches", "Soft Stuff", "Blower Pow"];
  const landingLabels = ["No Air", "Buttery", "Perfect", "A Bit Flat", "Pancake"];
  const fallSeverityLabels = ["Popped right up", "Minor inconvenience", "Took a minute", "Definitely felt that", "YARD SALE"];

  if (loading) {
      return <div className="text-center p-8">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 bg-white rounded-lg shadow-xl my-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
          How was <Link to={`/pin/${pinId}`} className="text-blue-600 hover:underline">{pin?.featureName}</Link>?
        </h1>
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-gray-500">
            {renderBlackDiamonds(pin?.averageRating, 'text-lg')}
            <span className="font-bold text-gray-700">{pin?.averageRating ? pin.averageRating.toFixed(1) : 'N/A'}</span>
            <Link to={`/pin/${pinId}`} className="text-blue-500 hover:text-blue-700"><FaExternalLinkAlt /></Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Main Difficulty Rating */}
        <div className="bg-gray-50 p-4 rounded-lg border">
          <label className="block text-lg font-semibold mb-2">Overall Difficulty: <span className="text-black font-bold">{difficultyLabels[diamonds - 1] || 'Select a rating'}</span></label>
          <div className="flex gap-1 text-4xl cursor-pointer">
            {[1, 2, 3, 4, 5].map((i) => ( <span key={i} onClick={() => setDiamonds(i)} className={`transition-colors ${i <= diamonds ? "text-black" : "text-gray-300 hover:text-gray-400"}`}>◆</span>))}
          </div>
        </div>

        {/* --- All the Sliders --- */}
        <div className="space-y-6 border-t pt-6">
            <h3 className="text-xl font-bold text-gray-800 text-center">Rate the Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div><label className="block font-medium mb-1">Fun Factor: <span className="font-semibold text-blue-600">{funFactorLabels[funFactor - 1]}</span></label><input type="range" min={1} max={5} value={funFactor} onChange={(e) => setFunFactor(Number(e.target.value))} className="w-full" /></div>
                <div><label className="block font-medium mb-1">Daredevil Rating: <span className="font-semibold text-red-600">{daredevilLabels[daredevilFactor - 1]}</span></label><input type="range" min={1} max={5} value={daredevilFactor} onChange={(e) => setDaredevilFactor(Number(e.target.value))} className="w-full" /></div>
                <div><label className="block font-medium mb-1">Powder on Hit: <span className="font-semibold text-sky-600">{powderLabels[powder]}</span></label><input type="range" min={0} max={4} value={powder} onChange={(e) => setPowder(Number(e.target.value))} className="w-full" /></div>
                <div><label className="block font-medium mb-1">Landing Impact: <span className="font-semibold text-green-600">{landingLabels[landing]}</span></label><input type="range" min={0} max={4} value={landing} onChange={(e) => setLanding(Number(e.target.value))} className="w-full" /></div>
            </div>
        </div>
        
        {/* NEW: Tag Selection Section */}
        <div className="border-t pt-6">
          <label className="block text-lg font-semibold text-gray-800 mb-3">Tag the Feature (optional)</label>
          <div className="flex flex-wrap gap-2">
            {OBJECTIVE_TAGS.map(tag => (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  tags.includes(tag)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Fall Section */}
        <div className="border-t pt-6">
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 p-4 rounded-lg">
                <input type="checkbox" id="fall" checked={didFall} onChange={(e) => setDidFall(e.target.checked)} className="w-5 h-5 accent-red-600"/>
                <label htmlFor="fall" className="text-md font-semibold text-red-800">Did you take a tumble?</label>
            </div>
             {didFall && (
                <div className="mt-4 pl-8">
                    <label className="block font-medium mb-1">How bad was it? <span className="font-semibold text-red-600">{fallSeverityLabels[fallSeverity]}</span></label>
                    <input type="range" min={0} max={4} value={fallSeverity} onChange={(e) => setFallSeverity(Number(e.target.value))} className="w-full"/>
                </div>
            )}
        </div>

        <div>
          <label className="block font-medium mb-1">Comment (optional)</label>
          <textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="What made it tough or easy? Any tips?" />
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-400 transition-transform hover:scale-105">
          {submitting ? "Submitting..." : "Submit Review"}
        </button>
      </form>
    </div>
  );
}