import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext, Link } from "react-router-dom";
import { fetchUserInteractionState, toggleFavorite, handleVote as handlePinVote, toggleFlag } from "../utils/interactions.js";
import { db } from "../firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  increment,
  addDoc,
  Timestamp,
  query,
  orderBy,
  runTransaction,
  where,
  writeBatch,
  arrayUnion 
} from "firebase/firestore";
import "leaflet/dist/leaflet.css";
import {
    FaHeart, FaRegHeart, FaThumbsUp, FaThumbsDown, FaRegThumbsUp,
    FaRegThumbsDown, FaFlag, FaRegFlag, FaPoo, FaGrinStars, FaUser,
    FaMountain, FaRegEdit, FaCommentAlt, FaCrown, FaVideo
} from "react-icons/fa";
import { GiDeathSkull, GiPodiumWinner, GiSandsOfTime } from 'react-icons/gi';
import toast from "react-hot-toast";
import PinViewerMap from "./PinViewerMap.jsx";

import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Set up the default icon for Leaflet maps
const defaultIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// --- Helper Components ---

const MediaRenderer = ({ url, title }) => {
    if (!url) return <div className="aspect-video w-full bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">No media.</div>;
    const isYoutube = url.includes("youtube.com/embed");
    return (
        <div className="w-full bg-black rounded-xl shadow-lg overflow-hidden">
            {isYoutube ? <div className="aspect-video"><iframe className="w-full h-full" src={url} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>
            : <video controls src={url} className="w-full h-auto" />}
        </div>
    );
};

const RatingSlider = ({ label, icon, average, labels, textColorClass, bgColorClass }) => {
    const numericAverage = average ?? 0;
    const safeAverage = Math.max(0, Math.min(labels.length - 1, numericAverage));
    const percentage = labels.length > 1 ? (safeAverage / (labels.length - 1)) * 100 : 0;
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">{icon} {label}</span>
                <span className={`text-sm font-bold ${textColorClass}`}>{labels[Math.round(safeAverage)]}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 relative">
                <div className={`h-2.5 rounded-full ${bgColorClass}`} style={{ width: `${percentage}%` }}></div>
            </div>
        </div>
    );
};

const CarnageOMeter = ({ fallPercentage, fallCount, reviewCount }) => {
    const radius = 40;
    const circumference = radius * Math.PI;
    const offset = (1 - fallPercentage / 100) * circumference;
    return (
        <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <h3 className="text-xl font-bold mb-2">Carnage-O-Meter</h3>
            <div className="relative w-40 h-20 mx-auto">
                <svg className="w-full h-full" viewBox="0 0 100 50">
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#ef4444" strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }} />
                </svg>
                <div className="absolute inset-0 flex items-end justify-center text-3xl font-bold pb-1">{fallPercentage.toFixed(0)}%</div>
            </div>
            <p className="text-xs text-gray-500 mt-1">{fallCount} of {reviewCount} reviewers took a tumble.</p>
        </div>
    );
};

const ChallengeVoting = ({ challenge, user, isAdmin, onVoteFinished, userVote: initialUserVote }) => {
  const [timeLeft, setTimeLeft] = useState("");
  const [userVote, setUserVote] = useState(initialUserVote);
  const [votes, setVotes] = useState({ upvotes: challenge.upvotes || 0, downvotes: challenge.downvotes || 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
      if (!challenge.votingEnds) return;
      const timer = setInterval(() => {
          const now = Date.now();
          const ends = challenge.votingEnds.toDate().getTime();
          const diff = ends - now;

          if (diff <= 0) {
              setTimeLeft("Time's up!");
              clearInterval(timer);
              
              return;
          }
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${h}h ${m}m ${s}s`);
      }, 1000);
      return () => clearInterval(timer);
  }, [challenge, isProcessing, onVoteFinished]);

  const handleVote = async (voteType) => {
      if (!user || userVote !== null) {
          toast.error("You’ve already voted or aren’t signed in.");
          return;
      }
      const challengeRef = doc(db, `pins/${challenge.pinId}/dethroneChallenges/${challenge.id}`);
      const voteRef = doc(challengeRef, "votes", user.uid);
      try {
          await runTransaction(db, async (t) => {
              const voteDoc = await t.get(voteRef);
              if (voteDoc.exists()) throw new Error("Already voted.");
              t.update(challengeRef, { [`${voteType}votes`]: increment(1) });
              t.set(voteRef, { vote: voteType });
          });
          setUserVote(voteType);
          setVotes(p => ({ ...p, [`${voteType}votes`]: (p[`${voteType}votes`] || 0) + 1 }));
          toast.success("Vote counted!");
      } catch (e) {
          console.error("Vote failed:", e);
          toast.error(e.message || "Vote failed.");
      }
  };

  return (
      <div className="bg-yellow-50 border-2 border-yellow-400 p-6 rounded-2xl shadow-lg my-8">
          <h3 className="text-2xl font-bold text-center text-gray-800 flex items-center justify-center gap-2"><FaCrown /> DETHRONE IN PROGRESS <FaCrown /></h3>
          <div className="text-center my-4">
              <div className="p-3 bg-gray-800 text-white rounded-lg inline-block mx-auto">
                  <p className="font-semibold text-sm">Time Left to Vote:</p>
                  <p className="text-2xl font-bold tracking-widest flex items-center gap-2"><GiSandsOfTime /> {timeLeft || "Calculating..."}</p>
              </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div>
                  <h4 className="font-bold text-center mb-2">Original Clip</h4>
                  <MediaRenderer url={challenge.originalMediaUrl} title="Original Video" />
              </div>
              <div>
                  <h4 className="font-bold text-center mb-2">Challenger's Clip</h4>
                  <MediaRenderer url={challenge.challengerMediaUrl} title="Challenger Video" />
              </div>
          </div>
          <div className="flex justify-center items-center gap-6 mt-6 pt-6 border-t border-yellow-300">
              <button onClick={() => handleVote('up')} disabled={!!userVote} className="flex items-center gap-2 p-3 rounded-lg text-green-600 bg-green-100 disabled:opacity-50 hover:bg-green-200 transition">
                  <span className="font-bold">Keep Old Video</span>
                  <span className="font-bold text-xl">({votes.upvotes})</span>
              </button>
              <button onClick={() => handleVote('down')} disabled={!!userVote} className="flex items-center gap-2 p-3 rounded-lg text-red-600 bg-red-100 disabled:opacity-50 hover:bg-red-200 transition">
                  <span className="font-bold">Dethrone</span>
                  <span className="font-bold text-xl">({votes.downvotes})</span>
              </button>
          </div>
          {isAdmin && (
              <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-dashed border-gray-400">
                  <button onClick={() => onVoteFinished(challenge)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded">Admin: End Now</button>
                  <button onClick={() => onVoteFinished(challenge, true)} className="text-xs bg-red-600 text-white px-3 py-1 rounded">Admin: Cancel</button>
              </div>
          )}
      </div>
  );
};


export default function PinDetail() {
  const { pinId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useOutletContext();
  
  const [loadingState, setLoadingState] = useState('loading');
  const [pin, setPin] = useState(null);
  const [submitter, setSubmitter] = useState(null);
  const [originalSubmitter, setOriginalSubmitter] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [userPinVote, setUserPinVote] = useState(null);
  const [isFlagged, setIsFlagged] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [userSuggestionVotes, setUserSuggestionVotes] = useState({});
  const [userChallengeVote, setUserChallengeVote] = useState(null);
  const [showSuggestionForm, setShowSuggestionForm] = useState(false);
  const [newSuggestedName, setNewSuggestedName] = useState("");
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [aggregatedRatings, setAggregatedRatings] = useState({ powder: null, landing: null });

  useEffect(() => {
    if (!pinId) return;
    let isMounted = true;
    
    const fetchPublicData = async () => {
      setLoadingState('loading');
      try {
        const pinRef = doc(db, "pins", pinId);
        const pinSnap = await getDoc(pinRef);

        if (!isMounted || !pinSnap.exists() || (!pinSnap.data().approved && !isAdmin)) {
          if (isMounted) {
            toast.error("Pin not found or awaiting approval.");
            setLoadingState('error');
            navigate('/map');
          }
          return;
        }

        const pinData = { id: pinSnap.id, ...pinSnap.data() };
        setPin(pinData);

        const [kingSnap, originalCreatorSnap, reviewsSnap, nameSuggestionsSnap] = await Promise.all([
          getDoc(doc(db, "users", pinData.createdBy)),
          pinData.originalCreatedBy ? getDoc(doc(db, "users", pinData.originalCreatedBy)) : Promise.resolve(null),
          getDocs(query(collection(pinRef, "reviews"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(pinRef, "nameSuggestions"), orderBy("upvotes", "desc")))
        ]);

        if (!isMounted) return;

        if (kingSnap.exists()) setSubmitter(kingSnap.data());
        if (originalCreatorSnap?.exists()) {
          setOriginalSubmitter(originalCreatorSnap.data());
        } else if (kingSnap.exists()) {
          setOriginalSubmitter(kingSnap.data());
        }

        const reviewList = await Promise.all(reviewsSnap.docs.map(async rDoc => {
            const review = rDoc.data();
            const userSnap = await getDoc(doc(db, "users", review.userId));
            return { ...review, id: rDoc.id, username: userSnap.exists() ? userSnap.data().username : "Anonymous" };
        }));
        setReviews(reviewList);
        
        let totalPowder = 0, powderCount = 0, totalLanding = 0, landingCount = 0;
        reviewList.forEach(r => {
            if (typeof r.powder === 'number') { totalPowder += r.powder; powderCount++; }
            if (typeof r.landing === 'number') { totalLanding += r.landing; landingCount++; }
        });
        setAggregatedRatings({
            powder: powderCount > 0 ? totalPowder / powderCount : null,
            landing: landingCount > 0 ? totalLanding / landingCount : null,
        });

        const suggestions = nameSuggestionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setNameSuggestions(suggestions);
        
        setLoadingState('success');
        
        if (user) {
          fetchUserSpecificData(pinRef, suggestions);
        }
        
      } catch (error) {
        console.error("Fatal error loading pin details:", error);
        if (isMounted) setLoadingState('error');
        if (isMounted) toast.error("Could not load pin data.");
      }
    };

    const fetchUserSpecificData = async (pinRef, suggestions) => {
        const [userInteractions, suggestionVoteSnaps, challengesSnap] = await Promise.all([
            fetchUserInteractionState(pinId, user.uid),
            Promise.all(suggestions.map(s => getDoc(doc(pinRef, `nameSuggestions/${s.id}/votes`, user.uid)))),
            getDocs(query(collection(pinRef, "dethroneChallenges"), where("status", "==", "voting")))
        ]);

        if (!isMounted) return;
        
        const challenge = challengesSnap.empty ? null : { id: challengesSnap.docs[0].id, pinId, ...challengesSnap.docs[0].data() };
        setActiveChallenge(challenge);

        setIsFavorited(userInteractions.isFavorited);
        setUserPinVote(userInteractions.userVote);
        setIsFlagged(userInteractions.isFlagged);
        
        const collectedSuggestionVotes = {};
        suggestionVoteSnaps.forEach((voteSnap, index) => {
            if (voteSnap.exists()) collectedSuggestionVotes[suggestions[index].id] = voteSnap.data().vote;
        });
        setUserSuggestionVotes(collectedSuggestionVotes);
        
        if (challenge) {
            const challengeVoteSnap = await getDoc(doc(db, `pins/${pinId}/dethroneChallenges/${challenge.id}/votes`, user.uid));
            if (isMounted && challengeVoteSnap.exists()) {
                setUserChallengeVote(challengeVoteSnap.data().vote);
            }
        }
    }

    fetchPublicData();

    return () => { isMounted = false; };
  }, [pinId, user, isAdmin, navigate]);

  const handleVoteFinished = async (challenge, cancelled = false) => {
    if (!activeChallenge) return;
    const currentChallengeId = activeChallenge.id;
    setActiveChallenge(null); 
    const challengeRef = doc(db, `pins/${challenge.pinId}/dethroneChallenges/${currentChallengeId}`);
    const pinRef = doc(db, "pins", challenge.pinId);

    if (cancelled) {
        await updateDoc(challengeRef, { status: "cancelled" });
        toast("Admin cancelled the challenge.", { icon: "🛡️" });
        return;
    }

    try {
        const finalChallengeSnap = await getDoc(challengeRef);
        if (!finalChallengeSnap.exists() || finalChallengeSnap.data().status !== 'voting') {
            toast.error("Challenge has already been processed.");
            return;
        }

        const finalData = finalChallengeSnap.data();
        const winner = (finalData.downvotes || 0) > (finalData.upvotes || 0);
        const batch = writeBatch(db);

        if (winner) {
            const pinSnap = await getDoc(pinRef);
            if (!pinSnap.exists()) throw new Error("Pin to be dethroned does not exist!");
            
            const pinData = pinSnap.data();
            const previousKingId = pinData.createdBy;

            batch.update(pinRef, {
                media: [finalData.challengerMediaUrl],
                createdBy: finalData.challengerId,
                previousKings: arrayUnion(previousKingId)
            });
            batch.update(doc(db, "users", finalData.challengerId), { dethroneSuccessCount: increment(1) });
            batch.update(doc(db, "users", previousKingId), { dethroneLostCount: increment(1) });
            batch.update(challengeRef, { status: "successful" });
            
            toast.success("A new champion has been crowned!");
        } else {
            batch.update(challengeRef, { status: "failed" });
            toast.success("The challenger has failed!");
        }
        
        await batch.commit();

        if (winner) {
            const newPinSnap = await getDoc(pinRef);
            setPin({ id: newPinSnap.id, ...newPinSnap.data() });
            const newUserSnap = await getDoc(doc(db, "users", finalData.challengerId));
            if (newUserSnap.exists()) {
              setSubmitter(newUserSnap.data()); 
            }
        }
    } catch (e) {
        console.error("Error finalizing vote:", e);
        toast.error("Failed to finalize vote.");
    }
  };
  
  const handleSuggestionSubmit = async (e) => {
    e.preventDefault();
    if (!user || newSuggestedName.trim().length < 3) return;
    setIsSubmittingSuggestion(true);
    const pinRef = doc(db, "pins", pinId);
    try {
        const data = { suggestedName: newSuggestedName.trim(), userId: user.uid, username: user.username || "Anonymous", createdAt: Timestamp.now(), upvotes: 0, downvotes: 0, status: 'pending' };
        const docRef = await addDoc(collection(pinRef, "nameSuggestions"), data);
        setNameSuggestions(prev => [{...data, id: docRef.id}, ...prev]);
        setNewSuggestedName("");
        setShowSuggestionForm(false);
        toast.success("Suggestion submitted!");
    } catch (error) { toast.error("Submission failed."); } 
    finally { setIsSubmittingSuggestion(false); }
  };

  const handleNameVote = async (suggestionId, voteType) => {
    if (!user || userSuggestionVotes[suggestionId]) return;
    const suggestionRef = doc(db, `pins/${pinId}/nameSuggestions/${suggestionId}`);
    const voteRef = doc(suggestionRef, "votes", user.uid);
    try {
        await runTransaction(db, async (t) => {
            if ((await t.get(voteRef)).exists) throw new Error("Already voted.");
            t.update(suggestionRef, { [`${voteType}votes`]: increment(1) });
            t.set(voteRef, { vote: voteType });
        });
        setUserSuggestionVotes(p => ({ ...p, [suggestionId]: voteType }));
        setNameSuggestions(p => p.map(s => s.id === suggestionId ? { ...s, [`${voteType}votes`]: (s[`${voteType}votes`] || 0) + 1 } : s));
        toast.success("Vote recorded!");
    } catch (error) { toast.error(error.message || "Vote failed."); }
  };
  
  const renderBlackDiamonds = (count) => (<div className="flex gap-1">{[...Array(5)].map((_, i) => <span key={i} className="text-xl">{i < Math.round(count || 0) ? "◆" : "◇"}</span>)}</div>);

  const sliderLabels = {
    fun: ["Meh", "Kinda Fun", "Good Times", "Super Fun", "Best Hit Ever!"],
    daredevil: ["Low Commitment", "Requires Focus", "Full Send", "Calculated Risk", "Huck and Pray"],
    powder: ["Scraped", "Dust on Crust", "A Few Inches", "Soft Stuff", "Blower Pow"],
    landing: ["No Air", "Buttery", "Perfect", "A Bit Flat", "Pancake"]
  };
  
  if (loadingState === 'loading') return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div></div>;
  if (loadingState === 'error' || !pin) return <div className="text-center p-8">Could not load pin. Please try again later.</div>;

  const fallCount = reviews.filter(r => r.fall === true).length;
  const fallPercentage = reviews.length > 0 ? (fallCount / reviews.length) * 100 : 0;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8">
        <div className="text-center">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900">{pin.featureName}</h1>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                {submitter && (
                    <Link to={`/user/${pin.createdBy}`} className="flex items-center gap-1.5 hover:text-indigo-600 font-semibold">
                        <FaCrown size={12} />
                        <span>King: {submitter.username || 'A User'}</span>
                    </Link>
                )}
                {originalSubmitter && pin.originalCreatedBy && pin.createdBy !== pin.originalCreatedBy && (
                    <>
                        <span>•</span>
                        <Link to={`/user/${pin.originalCreatedBy}`} className="flex items-center gap-1.5 hover:text-blue-600 font-semibold">
                            <FaMountain size={12} />
                            <span>Founded by: {originalSubmitter.username || 'A User'}</span>
                        </Link>
                    </>
                )}
                <span>•</span>
                <p>Added on {pin.createdAt?.toDate().toLocaleDateString()}</p>
                <span>•</span>
                <Link to={`/map?resort=${encodeURIComponent(pin.resort)}`} className="font-semibold hover:text-blue-600 flex items-center gap-1.5">
                    <FaMountain size={12} />
                    {pin.resort}
                </Link>
            </div>          
        </div>
        
        <MediaRenderer url={pin.media && pin.media[0]} title={pin.featureName} />
        
        {activeChallenge && <ChallengeVoting challenge={activeChallenge} user={user} isAdmin={isAdmin} onVoteFinished={handleVoteFinished} userVote={userChallengeVote} />}

        <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button onClick={() => navigate(`/pin/${pinId}/review`)} className="flex-1 bg-blue-600 text-white px-8 py-3 rounded-full hover:bg-blue-700 font-semibold text-lg shadow-md transition-transform hover:scale-105">I Hit This!</button>
            <button onClick={() => navigate(`/pin/${pinId}/challenge`)} className="flex-1 bg-gray-700 text-white px-8 py-3 rounded-full hover:bg-black font-semibold text-lg shadow-md transition-transform hover:scale-105" disabled={!!activeChallenge}>{activeChallenge ? "Vote in Progress!" : "I Hit This Better"}</button>
        </div>
      
        <div className="bg-white p-4 rounded-xl shadow-md">
            <div className="flex justify-around items-center bg-gray-50 p-3 rounded-lg shadow-inner">
                <button onClick={async () => user && setIsFavorited(await toggleFavorite(pinId, user.uid))} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${isFavorited ? 'text-red-500' : 'text-gray-600 hover:bg-red-50'}`} disabled={!user}>{isFavorited ? <FaHeart size={24}/> : <FaRegHeart size={24}/>}<span className="text-xs font-semibold">Favorite</span></button>
                <div className="flex items-center gap-4 border-x px-4 mx-2 sm:px-6 sm:mx-3">
                    <button onClick={async () => {if(user){const newVote=await handlePinVote(pinId,user.uid,'like');setUserPinVote(newVote);setPin(p=>({...p,likeCount:p.likeCount+(newVote==='like'?1:(userPinVote==='like'?-1:0))+(newVote===null&&userPinVote==='like'?-1:0),dislikeCount:p.dislikeCount+(userPinVote==='dislike'?-1:0)}))}}} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${userPinVote === 'like' ? 'text-green-600 bg-green-50' : 'text-gray-600 hover:bg-green-50'}`} disabled={!user}>{userPinVote === 'like' ? <FaThumbsUp size={20}/> : <FaRegThumbsUp size={20}/>}<span className="font-bold">{pin.likeCount || 0}</span></button>
                    <button onClick={async () => {if(user){const newVote=await handlePinVote(pinId,user.uid,'dislike');setUserPinVote(newVote);setPin(p=>({...p,dislikeCount:p.dislikeCount+(newVote==='dislike'?1:(userPinVote==='dislike'?-1:0))+(newVote===null&&userPinVote==='dislike'?-1:0),likeCount:p.likeCount+(userPinVote==='like'?-1:0)}))}}} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${userPinVote === 'dislike' ? 'text-purple-600 bg-purple-50' : 'text-gray-600 hover:bg-purple-50'}`} disabled={!user}>{userPinVote === 'dislike' ? <FaThumbsDown size={20}/> : <FaRegThumbsDown size={20}/>}<span className="font-bold">{pin.dislikeCount || 0}</span></button>
                </div>
                <button onClick={async () => user && setIsFlagged(await toggleFlag(pinId, user.uid))} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${isFlagged ? 'text-yellow-600' : 'text-gray-600 hover:bg-yellow-50'}`} disabled={!user}>{isFlagged ? <FaFlag size={20} /> : <FaRegFlag size={20}/>}<span className="text-xs font-semibold">Report</span></button>
            </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-md space-y-6">
            <h3 className="text-2xl font-bold text-center">Community Ratings</h3>
            <div className="text-center"><p className="font-semibold mb-1">Overall Difficulty</p>{renderBlackDiamonds(pin.averageRating)}<p className="text-lg font-bold">{pin.averageRating?.toFixed(1) || 'N/A'}</p><p className="text-xs text-gray-500">({pin.ratingCount || 0} ratings)</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <RatingSlider label="Fun Factor" icon={<FaGrinStars/>} average={pin.averageFunFactor} labels={sliderLabels.fun} textColorClass="text-blue-500" bgColorClass="bg-blue-500"/>
                <RatingSlider label="Daredevil" icon={<GiDeathSkull/>} average={pin.averageDaredevilFactor} labels={sliderLabels.daredevil} textColorClass="text-red-500" bgColorClass="bg-red-500"/>
                <RatingSlider label="Powder" icon={<FaPoo/>} average={aggregatedRatings.powder} labels={sliderLabels.powder} textColorClass="text-sky-500" bgColorClass="bg-sky-500"/>
                <RatingSlider label="Landing" icon={<GiPodiumWinner/>} average={aggregatedRatings.landing} labels={sliderLabels.landing} textColorClass="text-green-500" bgColorClass="bg-green-500"/>
            </div>
        </div>

        <CarnageOMeter fallPercentage={fallPercentage} fallCount={fallCount} reviewCount={reviews.length} />

        <div className="bg-gray-50 p-4 sm:p-6 rounded-lg shadow-inner">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FaRegEdit /> Name Suggestions</h3>
          {nameSuggestions.filter(s => s.status === 'pending').length > 0 ? (
            <ul className="space-y-3">
              {nameSuggestions.filter(s => s.status === 'pending').map(s => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between bg-white p-3 rounded shadow-sm gap-2">
                    <div>
                      <p className="font-semibold">{s.suggestedName}</p>
                      <p className="text-xs text-gray-500">by {s.username}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button onClick={() => handleNameVote(s.id, 'upvotes')} disabled={!user || userSuggestionVotes[s.id]} className="flex items-center gap-2 p-2 rounded-full hover:bg-green-100 disabled:opacity-50">
                        <FaThumbsUp className={userSuggestionVotes[s.id] === 'upvotes' ? 'text-green-600' : 'text-gray-500'}/>
                        <span className="font-bold text-lg">{s.upvotes || 0}</span>
                      </button>
                      <button onClick={() => handleNameVote(s.id, 'downvotes')} disabled={!user || userSuggestionVotes[s.id]} className="flex items-center gap-2 p-2 rounded-full hover:bg-red-100 disabled:opacity-50">
                        <FaThumbsDown className={userSuggestionVotes[s.id] === 'downvotes' ? 'text-red-600' : 'text-gray-500'} />
                        <span className="font-bold text-lg">{s.downvotes || 0}</span>
                      </button>
                    </div>
                  </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">No other names have been suggested yet.</p>
          )}
          <div className="mt-4">
            {showSuggestionForm ? (
              <form onSubmit={handleSuggestionSubmit} className="flex flex-wrap items-center gap-2">
                <input type="text" value={newSuggestedName} onChange={e => setNewSuggestedName(e.target.value)} placeholder="Enter a different name" className="flex-grow border px-3 py-2 rounded" required />
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700" disabled={isSubmittingSuggestion}>{isSubmittingSuggestion ? '...' : 'Submit'}</button>
                <button type="button" onClick={() => setShowSuggestionForm(false)} className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600">Cancel</button>
              </form>
            ) : (
              <button onClick={() => setShowSuggestionForm(true)} className="text-blue-600 hover:underline text-sm font-semibold" disabled={!user}>Know this feature by a different name?</button>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-md space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">The Deets</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{pin.description || 'No description provided.'}</p>
          </div>
          {pin.directions && (
            <div className="border-t pt-4">
              <h2 className="text-2xl font-bold mb-2">How to Get There</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{pin.directions}</p>
            </div>
          )}
          {pin.lat != null && !isNaN(pin.lat) && (
            <div className="border-t pt-4">
              <div className="rounded-xl overflow-hidden shadow-md w-full h-[450px] sm:h-[600px]">
                <PinViewerMap position={[pin.lat, pin.lng]} icon={defaultIcon} />
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-4 sm:p-6 rounded-lg shadow-inner">
          <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">Hit Reports ({reviews.length})</h3>
          {reviews.length === 0 ? (
            <p className="text-gray-600 mt-4 text-center">No reviews yet. Be the first to send it!</p>
          ) : (
            <div className="space-y-6 mt-6">
              {reviews.map(review => (
                <div key={review.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex justify-between items-center text-sm font-medium mb-2">
                    <div className="flex gap-2 items-center">
                      <Link to={review.userId === user?.uid ? '/profile' : `/user/${review.userId}`} className="text-blue-600 hover:underline font-bold">{review.username}</Link>
                      {review.fall && (<span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1"><FaPoo /> Fell</span>)}
                    </div>
                    {review.createdAt?.toDate && (<span className="text-gray-500">{review.createdAt.toDate().toLocaleDateString()}</span>)}
                  </div>
                  <div className="flex items-center gap-2 mb-2">{renderBlackDiamonds(review.rating)}</div>
                  {review.comment && (<p className="text-gray-700 bg-white p-3 rounded-md shadow-sm">{review.comment}</p>)}
                  {review.media && (
                    <div className="mt-3">
                      <video src={review.media} controls className="w-full max-w-sm mx-auto rounded-lg" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
