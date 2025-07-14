import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useOutletContext, Link } from "react-router-dom";
import { fetchUserInteractionState, toggleFavorite, handleVote as handlePinVote, toggleFlag, handleReviewHelpful, handleReviewInaccurate } from "../utils/interactions.js";
import { toggleVouch } from "../utils/vouching.js";
import { db } from "../firebase.js";
import {
  doc,
  getDoc,
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
  arrayUnion,
  limit
} from "firebase/firestore";
import "leaflet/dist/leaflet.css";
import {
    FaHeart, FaRegHeart, FaThumbsUp, FaThumbsDown, FaRegThumbsUp,
    FaRegThumbsDown, FaFlag, FaRegFlag, FaPoo, FaGrinStars, FaUser,
    FaMountain, FaRegEdit, FaCommentAlt, FaCrown, FaVideo, FaCheckCircle,
    FaShieldAlt, FaFistRaised, FaShoePrints, FaAngleDoubleDown, FaLightbulb
} from "react-icons/fa";
import { GiDeathSkull, GiPodiumWinner, GiSandsOfTime } from 'react-icons/gi';
import toast from "react-hot-toast";
import PinViewerMap from "./PinViewerMap.jsx";

import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// --- HELPER & SUB-COMPONENTS (DEFINED BEFORE USE) ---

const renderBlackDiamonds = (count, size = 'text-xl') => (
  <div className="flex gap-0.5 text-gray-800">
    {[...Array(5)].map((_, i) => <span key={i} className={`${size} ${i < Math.round(count) ? 'text-black' : 'text-gray-300'}`}>◆</span>)}
  </div>
);

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

const GranularDifficultyDisplay = ({ pin }) => {
  const ratings = [
    { label: 'Technicality', value: pin.avg_technicality, icon: <FaFistRaised />, color: 'bg-purple-500' },
    { label: 'Exposure', value: pin.avg_exposure, icon: <FaShieldAlt />, color: 'bg-red-500' },
    { label: 'Entry', value: pin.avg_entry, icon: <FaShoePrints />, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-3">
      {ratings.map(rating => (
        <div key={rating.label}>
          <div className="flex justify-between items-center text-sm mb-1">
            <span className="font-semibold text-gray-700 flex items-center gap-2">{rating.icon} {rating.label}</span>
            <span className="font-bold text-gray-800">{rating.value?.toFixed(1) || 'N/A'}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className={`${rating.color} h-2.5 rounded-full`} style={{ width: `${((rating.value || 0) / 5) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  );
};

const GranularReviewRatings = ({ review }) => {
    const ratings = [
        { label: 'Tech', value: review.rating_technicality },
        { label: 'Expo', value: review.rating_exposure },
        { label: 'Entry', value: review.rating_entry },
    ];

    if (review.rating_technicality === undefined) {
        return null;
    }

    return (
        <div className="flex justify-around items-center gap-2 sm:gap-4 text-xs text-gray-600 my-2 p-2 bg-gray-100 rounded-md">
            {ratings.map(r => (
                <div key={r.label} className="flex flex-col items-center text-center">
                    <span className="font-bold">{r.label}</span>
                    <span>{r.value}/5</span>
                </div>
            ))}
        </div>
    );
};

const ReviewConditionRatings = ({ review }) => {
    const sliderLabels = {
        fun: ["Meh", "Kinda Fun", "Good Times", "Super Fun", "Best Hit Ever!"],
        powder: ["Scraped", "Dusty", "Few Inches", "Soft", "Blower"],
        landing: ["No Air", "Buttery", "Perfect", "Flat", "Pancake"]
    };

    const ratings = [
        { label: 'Fun Factor', value: review.funFactor, labels: sliderLabels.fun, color: 'text-blue-500' },
        { label: 'Powder', value: review.powder, labels: sliderLabels.powder, color: 'text-sky-500' },
        { label: 'Landing', value: review.landing, labels: sliderLabels.landing, color: 'text-green-500' },
    ];

    if (review.funFactor === undefined) return null;

    return (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
            {ratings.map(r => (
                <div key={r.label} className="text-xs flex justify-between items-center">
                    <span className="font-semibold text-gray-600">{r.label}:</span>
                    <span className={`font-bold ${r.color}`}>{r.labels[r.value]}</span>
                </div>
            ))}
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
  }, [challenge]);

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

const HitItModal = ({ onVouch, onReview, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm text-center space-y-4">
                <h2 className="text-2xl font-bold">You Hit This Pin?</h2>
                <p className="text-gray-600">Confirm the pin's accuracy with a quick vouch, or add details by writing a full review.</p>
                <div className="space-y-3">
                    <button 
                        onClick={onVouch}
                        className="w-full bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 transition-transform hover:scale-105"
                    >
                        Quick Vouch
                    </button>
                    <button 
                        onClick={onReview}
                        className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-lg hover:bg-gray-300 transition-transform hover:scale-105"
                    >
                        Write a Full Review
                    </button>
                </div>
                <button onClick={onClose} className="text-sm text-gray-500 hover:underline mt-2">Cancel</button>
            </div>
        </div>
    );
};

const GoNoGoScore = ({ pin }) => {
    const score = (pin.vouchCount * 10) - (pin.flagCount * 20);
    const scoreColor = score >= 50 ? 'bg-green-500' : score > 10 ? 'bg-yellow-500' : 'bg-red-500';
    const scoreText = score >= 50 ? 'Looking Good' : score > 10 ? 'Use Caution' : 'Sketchy';

    return (
        <div className={`p-4 rounded-lg text-white text-center ${scoreColor}`}>
            <p className="font-bold text-xl">{scoreText}</p>
            <p className="text-xs opacity-80">Community Consensus</p>
        </div>
    );
};

const ConditionsTicker = ({ reviews }) => {
    if (!reviews || reviews.length === 0) return null;
    const recentReviews = reviews.slice(0, 3);
    const sliderLabels = {
        powder: ["Scraped", "Dusty", "Few Inches", "Soft", "Blower"],
        landing: ["No Air", "Buttery", "Perfect", "Flat", "Pancake"]
    };

    return (
        <div className="space-y-2">
            {recentReviews.map((review, index) => (
                <div key={index} className="bg-gray-100 p-2 rounded-md text-xs flex justify-between items-center">
                    <span className="font-semibold">{review.hitDate || 'Recently'}:</span>
                    <div className="flex gap-4">
                        <span>Powder: <span className="font-bold">{sliderLabels.powder[review.powder]}</span></span>
                        <span>Landing: <span className="font-bold">{sliderLabels.landing[review.landing]}</span></span>
                        {review.fall && <FaPoo className="text-red-600" title="Fell" />}
                    </div>
                </div>
            ))}
        </div>
    );
};

const TrustIndicators = ({ topVoucher, helpfulReviewCount }) => (
    <div className="grid grid-cols-2 gap-4 text-center">
        <div className="bg-gray-100 p-3 rounded-lg">
            <p className="text-xs font-semibold text-gray-500">Top Vouch By</p>
            <p className="font-bold text-gray-800 truncate">{topVoucher?.username || 'N/A'}</p>
        </div>
        <div className="bg-gray-100 p-3 rounded-lg">
            <p className="text-xs font-semibold text-gray-500">Helpful Reviews</p>
            <p className="font-bold text-gray-800">{helpfulReviewCount}</p>
        </div>
    </div>
);

const ReviewFilters = ({ sort, setSort, dateFilter, setDateFilter }) => {
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 p-2 bg-gray-200 rounded-lg">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Sort by:</span>
                <button onClick={() => setSort('recent')} className={`px-3 py-1 text-sm rounded-full ${sort === 'recent' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Most Recent</button>
                <button onClick={() => setSort('helpful')} className={`px-3 py-1 text-sm rounded-full ${sort === 'helpful' ? 'bg-blue-600 text-white' : 'bg-white'}`}>Most Helpful</button>
            </div>
        </div>
    );
};

const ReviewCard = ({ review, user, pinId, onHelpful, onInaccurate }) => {
    return (
        <div className="border-b pb-4 last:border-b-0">
            <div className="flex justify-between items-center text-sm font-medium mb-2">
                <div className="flex gap-2 items-center">
                    <Link to={review.userId === user?.uid ? '/profile' : `/user/${review.userId}`} className="text-blue-600 hover:underline font-bold">{review.username}</Link>
                    {review.fall && (<span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1"><FaPoo /> Fell</span>)}
                </div>
                <span className="text-gray-500">{review.hitDate || review.createdAt?.toDate().toLocaleDateString()}</span>
            </div>
            
            <GranularReviewRatings review={review} />
            {review.comment && (<p className="text-gray-700 bg-white p-3 rounded-md shadow-sm mb-3">{review.comment}</p>)}
            
            {review.media && (
              <div className="mt-3">
                <video src={review.media} controls className="w-full max-w-sm mx-auto rounded-lg" />
              </div>
            )}
            
            <ReviewConditionRatings review={review} />

            <div className="flex items-center justify-end gap-4 mt-3 text-xs">
                <button onClick={() => onHelpful(review.id)} className="flex items-center gap-1 text-gray-600 hover:text-green-600">
                    <FaThumbsUp /> Helpful ({review.helpfulCount || 0})
                </button>
                <button onClick={() => onInaccurate(review.id)} className="flex items-center gap-1 text-gray-600 hover:text-red-600">
                    <FaFlag /> Inaccurate
                </button>
            </div>
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
  const [isFlagged, setIsFlagged] = useState(false);
  const [isVouched, setIsVouched] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [userSuggestionVotes, setUserSuggestionVotes] = useState({});
  const [userChallengeVote, setUserChallengeVote] = useState(null);
  const [showSuggestionForm, setShowSuggestionForm] = useState(false);
  const [newSuggestedName, setNewSuggestedName] = useState("");
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [showHitItModal, setShowHitItModal] = useState(false);
  
  const [viewMode, setViewMode] = useState('chairlift');
  const [reviewSort, setReviewSort] = useState('recent');
  const [reviewDateFilter, setReviewDateFilter] = useState('All Time');
  const [topVoucher, setTopVoucher] = useState(null);

  useEffect(() => {
    if (!pinId) return;
    let isMounted = true;
    
    const fetchAllData = async () => {
      setLoadingState('loading');
      try {
        const pinRef = doc(db, "pins", pinId);
        const pinSnap = await getDoc(pinRef);

        if (!isMounted || !pinSnap.exists() || (!pinSnap.data().approved && !isAdmin)) {
          if (isMounted) { toast.error("Pin not found or awaiting approval."); setLoadingState('error'); navigate('/map'); }
          return;
        }

        const pinData = { id: pinSnap.id, ...pinSnap.data() };
        setPin(pinData);

        const [kingSnap, originalCreatorSnap, reviewsSnap, nameSuggestionsSnap, vouchesSnap] = await Promise.all([
          getDoc(doc(db, "users", pinData.createdBy)),
          pinData.originalCreatedBy ? getDoc(doc(db, "users", pinData.originalCreatedBy)) : Promise.resolve(null),
          getDocs(query(collection(pinRef, "reviews"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(pinRef, "nameSuggestions"), orderBy("upvotes", "desc"))),
          getDocs(query(collection(pinRef, "vouches"), orderBy("createdAt", "desc"), limit(5)))
        ]);

        if (!isMounted) return;

        if (kingSnap.exists()) setSubmitter(kingSnap.data());
        if (originalCreatorSnap?.exists()) setOriginalSubmitter(originalCreatorSnap.data());
        else if (kingSnap.exists()) setOriginalSubmitter(kingSnap.data());

        const reviewsData = reviewsSnap.docs.map(d => ({...d.data(), id: d.id}));
        const userIds = [...new Set(reviewsData.map(r => r.userId))];
        const voucherIds = [...new Set(vouchesSnap.docs.map(v => v.id))];
        const allUserIds = [...new Set([...userIds, ...voucherIds])];

        const usersMap = new Map();
        if (allUserIds.length > 0) {
            const usersQuery = query(collection(db, "users"), where("__name__", "in", allUserIds));
            const usersSnapshot = await getDocs(usersQuery);
            usersSnapshot.forEach(doc => usersMap.set(doc.id, doc.data()));
        }

        const reviewList = reviewsData.map(review => ({ ...review, username: usersMap.get(review.userId)?.username || "Anonymous" }));
        setReviews(reviewList);
        
        if (vouchesSnap.docs.length > 0) {
            const topVoucherId = vouchesSnap.docs[0].id;
            setTopVoucher(usersMap.get(topVoucherId));
        }

        const suggestions = nameSuggestionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setNameSuggestions(suggestions);
        
        setLoadingState('success');
        
        if (user) {
          fetchUserSpecificData(pinRef, suggestions);
        }
        
      } catch (error) {
        console.error("Fatal error loading pin details:", error);
        if (isMounted) { setLoadingState('error'); toast.error("Could not load pin data."); }
      }
    };

    const fetchUserSpecificData = async (pinRef, suggestions) => {
      const vouchRef = doc(db, "pins", pinId, "vouches", user.uid);
      const [userInteractions, suggestionVoteSnaps, challengesSnap, vouchSnap] = await Promise.all([
        fetchUserInteractionState(pinId, user.uid),
        Promise.all(suggestions.map(s => getDoc(doc(pinRef, `nameSuggestions/${s.id}/votes`, user.uid)))),
        getDocs(query(collection(pinRef, "dethroneChallenges"), where("status", "==", "voting"))),
        getDoc(vouchRef)
    ]);

        if (!isMounted) return;
        
        const challenge = challengesSnap.empty ? null : { id: challengesSnap.docs[0].id, pinId, ...challengesSnap.docs[0].data() };
        setActiveChallenge(challenge);

        setIsFavorited(userInteractions.isFavorited);
        setIsFlagged(userInteractions.isFlagged);
        setIsVouched(vouchSnap.exists());
        
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

    fetchAllData();

    return () => { isMounted = false; };
  }, [pinId, user, isAdmin, navigate]);

  const handleVouchClick = async () => {
    if (!user || !pin) return;
    const result = await toggleVouch(pinId, pin.createdBy, user.uid);
    if (result !== null) {
      setIsVouched(result);
      setPin(p => ({ ...p, vouchCount: (p.vouchCount || 0) + (result ? 1 : -1) }));
    }
    setShowHitItModal(false);
  };

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
  
  const getUserReputation = (userData) => {
      if (!userData || !pin) return 0;
      return userData.resortReputation?.[pin.resort] || 0;
  };

  const getReputationBadge = (reputation) => {
      if (reputation >= 1500) return <span className="ml-2 text-xs font-bold text-yellow-500 bg-yellow-100 px-2 py-1 rounded-full">Local Legend</span>;
      if (reputation >= 500) return <span className="ml-2 text-xs font-bold text-blue-500 bg-blue-100 px-2 py-1 rounded-full">Proven Rider</span>;
      return null;
  };
  
  const filteredAndSortedReviews = useMemo(() => {
    let filtered = [...reviews];
    
    if (reviewSort === 'helpful') {
        return filtered.sort((a, b) => (b.helpfulCount || 0) - (a.helpfulCount || 0));
    }
    return filtered;
  }, [reviews, reviewSort, reviewDateFilter]);

  if (loadingState === 'loading') return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div></div>;
  if (loadingState === 'error' || !pin) return <div className="text-center p-8">Could not load pin. Please try again later.</div>;

  const fallCount = reviews.filter(r => r.fall === true).length;
  const fallPercentage = reviews.length > 0 ? (fallCount / reviews.length) * 100 : 0;
  const helpfulReviewCount = reviews.reduce((acc, r) => acc + (r.helpfulCount || 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8">
        {showHitItModal && (
            <HitItModal 
                onVouch={handleVouchClick}
                onReview={() => navigate(`/pin/${pinId}/review`)}
                onClose={() => setShowHitItModal(false)}
            />
        )}

        <div className="text-center">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-gray-900">{pin.featureName}</h1>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                {submitter && (
                    <Link to={`/user/${pin.createdBy}`} className="flex items-center gap-1.5 hover:text-indigo-600 font-semibold">
                        <FaCrown size={12} />
                        <span>King: {submitter.username || 'A User'}</span>
                        {getReputationBadge(getUserReputation(submitter))}
                    </Link>
                )}
                {originalSubmitter && pin.originalCreatedBy && pin.createdBy !== pin.originalCreatedBy && (
                    <>
                        <span>•</span>
                        <Link to={`/user/${pin.originalCreatedBy}`} className="flex items-center gap-1.5 hover:text-blue-600 font-semibold">
                            <FaMountain size={12} />
                            <span>Founded by: {originalSubmitter.username || 'A User'}</span>
                            {getReputationBadge(getUserReputation(originalSubmitter))}
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
        
        {/* --- CHAIRLIFT MODE DASHBOARD --- */}
        <div className="space-y-4">
            <GoNoGoScore pin={pin} />
            <ConditionsTicker reviews={reviews} />
            <TrustIndicators topVoucher={topVoucher} helpfulReviewCount={helpfulReviewCount} />
        </div>

        {viewMode === 'chairlift' && (
            <div className="text-center">
                <button onClick={() => setViewMode('armchair')} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-lg hover:bg-gray-300 transition-transform hover:scale-105 flex items-center justify-center gap-2">
                    Show Full Details & All Reviews <FaAngleDoubleDown />
                </button>
            </div>
        )}

        {/* --- ARMCHAIR MODE (EXPANDED VIEW) --- */}
        {viewMode === 'armchair' && (
            <>
                {activeChallenge && <ChallengeVoting challenge={activeChallenge} user={user} isAdmin={isAdmin} onVoteFinished={handleVoteFinished} userVote={userChallengeVote} />}

                <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <button onClick={() => setShowHitItModal(true)} className="flex-1 bg-blue-600 text-white px-8 py-3 rounded-full hover:bg-blue-700 font-semibold text-lg shadow-md transition-transform hover:scale-105">I Hit This!</button>
                    <button onClick={() => navigate(`/pin/${pinId}/challenge`)} className="flex-1 bg-gray-700 text-white px-8 py-3 rounded-full hover:bg-black font-semibold text-lg shadow-md transition-transform hover:scale-105" disabled={!!activeChallenge}>{activeChallenge ? "Vote in Progress!" : "I Hit This Better"}</button>
                </div>
            
                <div className="bg-white p-6 rounded-xl shadow-md space-y-6">
                    <h3 className="text-2xl font-bold text-center">Community Ratings</h3>
                    <div className="text-center mb-4">
                        <p className="font-semibold mb-1">Overall Difficulty</p>
                        <div className="flex justify-center text-2xl text-black">{renderBlackDiamonds(pin.difficulty)}</div>
                        <p className="text-lg font-bold">{pin.difficulty?.toFixed(1) || 'N/A'}</p>
                        <p className="text-xs text-gray-500">({pin.ratingCount || 0} ratings)</p>
                    </div>
                    <GranularDifficultyDisplay pin={pin} />
                </div>

                <CarnageOMeter fallPercentage={fallPercentage} fallCount={fallCount} reviewCount={reviews.length} />
                
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
                  <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                    <h3 className="text-2xl font-bold flex items-center gap-2">Hit Reports ({reviews.length})</h3>
                    <ReviewFilters sort={reviewSort} setSort={setReviewSort} dateFilter={reviewDateFilter} setDateFilter={setReviewDateFilter} />
                  </div>
                  {filteredAndSortedReviews.length === 0 ? (
                    <p className="text-gray-600 mt-4 text-center">No reviews yet. Be the first to send it!</p>
                  ) : (
                    <div className="space-y-6 mt-6">
                      {filteredAndSortedReviews.map(review => (
                        <ReviewCard 
                          key={review.id} 
                          review={review} 
                          user={user} 
                          pinId={pinId}
                          onHelpful={() => handleReviewHelpful(pinId, review.id)}
                          onInaccurate={() => handleReviewInaccurate(pinId, review.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
            </>
        )}
    </div>
  );
}
