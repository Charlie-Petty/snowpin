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
} from "firebase/firestore";
import toast from "react-hot-toast";
import { FaExternalLinkAlt, FaCheckCircle } from 'react-icons/fa';
import { OBJECTIVE_TAGS } from "../utils/tagList";

// Helper to render the black diamond ratings
const renderBlackDiamonds = (count, size = 'text-xl') => (
  <div className="flex gap-0.5 text-gray-800">
    {[...Array(5)].map((_, i) => <span key={i} className={`${size} ${i < Math.round(count) ? 'text-black' : 'text-gray-300'}`}>◆</span>)}
  </div>
);

// A reusable slider component for our new rating system
const RatingSlider = ({ label, value, onChange, labels, helpText, colorClass }) => (
  <div className="bg-gray-50 p-4 rounded-lg border">
    <label className="block text-md font-semibold mb-1">{label}: <span className={`font-bold ${colorClass}`}>{labels[value - 1]}</span></label>
    <p className="text-xs text-gray-500 mb-3">{helpText}</p>
    <input type="range" min={1} max={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
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
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [didFall, setDidFall] = useState(false);
  const [fallSeverity, setFallSeverity] = useState(0);
  const [tags, setTags] = useState([]);
  
  // NEW: State for Task 2 features
  const [hitDate, setHitDate] = useState('Today');
  const [isVouching, setIsVouching] = useState(true);
  const [unvouchReasons, setUnvouchReasons] = useState([]);

  // Granular difficulty rating states
  const [technicality, setTechnicality] = useState(3);
  const [exposure, setExposure] = useState(3);
  const [entry, setEntry] = useState(3);

  // Other sliders
  const [powder, setPowder] = useState(2);
  const [landing, setLanding] = useState(2);
  const [funFactor, setFunFactor] = useState(3);

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

  const toggleTag = (tag) => {
    setTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // NEW: Handler for un-vouch reason checkboxes
  const handleUnvouchReasonChange = (reason) => {
    setUnvouchReasons(prev =>
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return toast.error("You must be logged in to submit a review.");
    if (!pinId) return toast.error("Error: Missing Pin ID.");

    setSubmitting(true);
    const toastId = toast.loading("Submitting your review...");

    try {
      const reviewData = {
        pinId: pinId,
        userId: user.uid,
        createdAt: serverTimestamp(),
        
        // Granular ratings
        rating_technicality: technicality,
        rating_exposure: exposure,
        rating_entry: entry,

        // Condition-specific data
        fall: didFall,
        ...(didFall && { fallSeverity }),
        powder,
        landing,
        funFactor,
        comment,
        tags: tags,

        // NEW: Data from Task 2
        hitDate: hitDate,
        isVouching: isVouching,
        ...(!isVouching && unvouchReasons.length > 0 && { unvouchReasons: unvouchReasons }),
      };

      await addDoc(collection(db, `pins/${pinId}/reviews`), reviewData);
      
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
  
  const technicalityLabels = ["Straightforward", "Requires Precision", "Complex Moves", "Very Technical", "Pro-Level Control"];
  const exposureLabels = ["Low Consequence", "Could Get Hurt", "Serious Injury Potential", "High Consequence", "No-Fall Zone"];
  const entryLabels = ["Ski-On", "Short Traverse", "Requires Scramble/Hike", "Exposed Entry", "Rope Recommended"];
  const funFactorLabels = ["Meh", "Kinda Fun", "Good Times", "Super Fun", "Best Hit Ever!"];
  const powderLabels = ["Scraped", "Dust on Crust", "A Few Inches", "Soft Stuff", "Blower Pow"];
  const landingLabels = ["No Air", "Buttery", "Perfect", "A Bit Flat", "Pancake"];
  const fallSeverityLabels = ["Popped right up", "Minor inconvenience", "Took a minute", "Definitely felt that", "YARD SALE"];
  const unvouchReasonOptions = ["Inaccurate Location", "Incorrect Difficulty", "Unsafe Landing", "Feature No Longer Exists"];

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
            {renderBlackDiamonds(pin?.difficulty, 'text-lg')}
            <span className="font-bold text-gray-700">{pin?.difficulty ? pin.difficulty.toFixed(1) : 'N/A'}</span>
            <Link to={`/pin/${pinId}`} className="text-blue-500 hover:text-blue-700"><FaExternalLinkAlt /></Link>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* NEW: Date of Hit Input */}
        <div>
            <label htmlFor="hitDate" className="block text-lg font-semibold text-gray-800 mb-2">When did you hit this?</label>
            <select 
              id="hitDate" 
              value={hitDate} 
              onChange={(e) => setHitDate(e.target.value)}
              className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
            >
              <option>Today</option>
              <option>Yesterday</option>
              <option>Last 3 Days</option>
              <option>This Week</option>
              <option>Older</option>
            </select>
        </div>

        <div className="space-y-4 border-t pt-8">
            <h3 className="text-xl font-bold text-gray-800 text-center">Rate the Difficulty</h3>
            <RatingSlider 
              label="Technicality"
              value={technicality}
              onChange={setTechnicality}
              labels={technicalityLabels}
              helpText="How complex are the required moves?"
              colorClass="text-purple-600"
            />
            <RatingSlider 
              label="Exposure"
              value={exposure}
              onChange={setExposure}
              labels={exposureLabels}
              helpText="What are the consequences of a fall?"
              colorClass="text-red-600"
            />
            <RatingSlider 
              label="Entry"
              value={entry}
              onChange={setEntry}
              labels={entryLabels}
              helpText="How difficult is it to access the line?"
              colorClass="text-orange-600"
            />
        </div>

        <div className="space-y-6 border-t pt-8">
            <h3 className="text-xl font-bold text-gray-800 text-center">Rate the Conditions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div><label className="block font-medium mb-1">Fun Factor: <span className="font-semibold text-blue-600">{funFactorLabels[funFactor - 1]}</span></label><input type="range" min={1} max={5} value={funFactor} onChange={(e) => setFunFactor(Number(e.target.value))} className="w-full" /></div>
                <div><label className="block font-medium mb-1">Powder on Hit: <span className="font-semibold text-sky-600">{powderLabels[powder]}</span></label><input type="range" min={0} max={4} value={powder} onChange={(e) => setPowder(Number(e.target.value))} className="w-full" /></div>
                <div><label className="block font-medium mb-1">Landing Impact: <span className="font-semibold text-green-600">{landingLabels[landing]}</span></label><input type="range" min={0} max={4} value={landing} onChange={(e) => setLanding(Number(e.target.value))} className="w-full" /></div>
            </div>
        </div>
        
        <div className="border-t pt-8">
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

        <div className="border-t pt-8">
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

        {/* NEW: Implicit Vouching Section */}
        <div className="border-t pt-8 space-y-4">
            <label className="flex items-start gap-3 text-md font-semibold text-gray-800 cursor-pointer">
                <input 
                    type="checkbox" 
                    checked={isVouching} 
                    onChange={(e) => setIsVouching(e.target.checked)} 
                    className="mt-1 h-5 w-5 accent-green-600"
                />
                <span>Vouch for this pin's accuracy.</span>
            </label>
            {!isVouching && (
                <div className="pl-8 p-4 bg-orange-50 border-l-4 border-orange-400">
                    <p className="font-semibold text-sm mb-3">What's wrong with this pin?</p>
                    <div className="space-y-2">
                        {unvouchReasonOptions.map(reason => (
                            <label key={reason} className="flex items-center gap-2 text-sm">
                                <input 
                                    type="checkbox"
                                    checked={unvouchReasons.includes(reason)}
                                    onChange={() => handleUnvouchReasonChange(reason)}
                                    className="h-4 w-4 accent-orange-600"
                                />
                                {reason}
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-400 transition-transform hover:scale-105">
          {submitting ? "Submitting..." : "Submit Review"}
        </button>
      </form>
    </div>
  );
}
