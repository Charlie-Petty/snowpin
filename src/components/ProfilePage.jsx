import React, { useState, useEffect, useRef } from "react";
import { auth, db, storage } from "../firebase";
import { updateProfile, sendPasswordResetEmail, deleteUser } from "firebase/auth";
import { doc, getDoc, updateDoc, setDoc, collection, query, getDocs, collectionGroup, where, orderBy, deleteDoc as deleteFirestoreDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { resorts } from "../utils/resorts";
import { fetchFavoritePinIds } from "../utils/interactions";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { FaEdit, FaCamera, FaBell, FaCheckCircle, FaTimesCircle, FaTimes, FaMountain, FaPlus, FaTrophy, FaMedal, FaCrown, FaHeart, FaPoo, FaGrinStars, FaUserShield } from 'react-icons/fa';
import { GiDeathSkull, GiPodiumWinner } from 'react-icons/gi';
import toast from "react-hot-toast";

// --- HELPER & SUB-COMPONENTS ---

const renderBlackDiamonds = (count, size = 'text-xl') => (
  <div className="flex gap-0.5 text-gray-800">
    {[...Array(5)].map((_, i) => <span key={i} className={`${size} ${i < Math.round(count) ? 'text-black' : 'text-gray-300'}`}>◆</span>)}
  </div>
);

const IncompleteProfile = ({ navigate }) => (
    <div className="max-w-xl mx-auto text-center bg-white p-8 rounded-xl shadow-lg my-10">
        <h1 className="text-3xl font-extrabold text-gray-900">One Last Step!</h1>
        <p className="text-gray-600 mt-4 mb-6">
            Your account is created, but you need to set up your public profile before you can continue. Let's pick your username and home mountain.
        </p>
        <button
            onClick={() => navigate('/create-profile')}
            className="bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-700 transition-transform hover:scale-105"
        >
            Complete Your Profile
        </button>
    </div>
);

const StatCard = ({ title, value, subtext, icon, link }) => (
  <Link to={link || '#'} className={`bg-white p-4 rounded-lg shadow-sm w-full h-full text-center flex flex-col justify-between ${link ? 'hover:bg-gray-100 hover:shadow-md transition-all' : 'cursor-default'}`}>
    <div>
        <div className="text-3xl text-sky-600 mx-auto w-fit mb-2">{icon}</div>
        <div className="text-3xl font-bold text-gray-800">{value}</div>
        <h3 className="text-sm font-semibold text-gray-600 mt-1">{title}</h3>
    </div>
    {subtext && <p className="text-xs text-gray-500 mt-2 truncate">{subtext}</p>}
  </Link>
);

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

const PinCarousel = ({ title, pins, emptyText, icon }) => {
    const carouselSettings = {
        dots: true,
        infinite: pins.length > 3,
        speed: 500,
        slidesToShow: Math.min(3, pins.length > 0 ? pins.length : 1),
        slidesToScroll: 1,
        responsive: [ { breakpoint: 1024, settings: { slidesToShow: Math.min(2, pins.length > 0 ? pins.length : 1) } }, { breakpoint: 600, settings: { slidesToShow: 1 } } ]
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center flex items-center justify-center gap-3">{icon}{title}</h2>
            {pins.length > 0 ? (
                <Slider {...carouselSettings}>{pins.map(pin => (
                    <div key={pin.pinId || pin.id} className="px-2 pb-4">
                        <Link to={`/pin/${pin.pinId || pin.id}`} className="block h-full">
                            <div className="bg-gray-100 hover:bg-gray-200 transition-colors p-4 rounded-lg shadow-md h-full flex flex-col justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold truncate">{pin.featureName}</h3>
                                    <p className="text-gray-600 text-sm">{pin.resort}</p>
                                </div>
                                <div className="flex justify-center mt-2">{renderBlackDiamonds(pin.difficulty || pin.averageRating, 'text-lg')}</div>
                            </div>
                        </Link>
                    </div>
                ))}</Slider>
            ) : <p className="text-center text-gray-500 py-4">{emptyText}</p>}
        </div>
    );
};

// NEW: Component to display resort-specific reputation
const ResortReputationList = ({ reputationData }) => {
    if (!reputationData || reputationData.length === 0) {
        return <p className="text-center text-gray-500 py-4">No resort reputation earned yet. Go hit some pins!</p>;
    }

    const getReputationBadge = (reputation) => {
        if (reputation >= 1500) {
            return <span className="text-xs font-bold text-yellow-600 bg-yellow-200 px-2 py-0.5 rounded-full">Local Legend</span>;
        }
        if (reputation >= 500) {
            return <span className="text-xs font-bold text-blue-600 bg-blue-200 px-2 py-0.5 rounded-full">Proven Rider</span>;
        }
        return null;
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Resort Reputations</h2>
            <ul className="space-y-3">
                {reputationData.map(({ resort, score }) => (
                    <li key={resort} className="flex items-center justify-between bg-gray-100 p-3 rounded-lg">
                        <span className="font-semibold">{resort}</span>
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-lg">{Math.round(score)}</span>
                            {getReputationBadge(score)}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};


// --- MAIN PROFILE PAGE COMPONENT ---

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(null); // NEW: To hold all user data from Firestore
  const [isProfileComplete, setIsProfileComplete] = useState(true);
  const [editable, setEditable] = useState(false);
  const [formData, setFormData] = useState({ name: "", username: "", bio: "", type: "Skier", homeMountain: "" });
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [profilePicUrl, setProfilePicUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [selectedStatResort, setSelectedStatResort] = useState("All");
  const [notifications, setNotifications] = useState([]);
  const [favoritePins, setFavoritePins] = useState([]);
  const [foundedPins, setFoundedPins] = useState([]);
  const [ruledPins, setRuledPins] = useState([]);
  const [recentReviewedPins, setRecentReviewedPins] = useState([]);
  
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            setProfileData(data); // Store the full user profile data
            const complete = data.profileComplete !== false;
            setIsProfileComplete(complete);
            if (complete) {
                setFormData({
                    name: data.name || "",
                    username: data.username || "",
                    bio: data.bio || "",
                    type: data.type || "Skier",
                    homeMountain: data.homeMountain || "Not Set"
                });
                setProfilePicUrl(data.profilePic || null);
                loadDashboardData(currentUser.uid);
                loadFavorites(currentUser.uid);
                loadNotifications(currentUser.uid);
            }
        } else {
            setIsProfileComplete(false);
        }
      } else {
        setUser(null);
        navigate("/login");
      }
    });
    return () => unsubscribe();
  }, [navigate]);
  
  const loadDashboardData = async (uid) => {
    setLoadingStats(true);
    try {
        const reviewsQuery = query(collectionGroup(db, "reviews"), where("userId", "==", uid), orderBy("createdAt", "desc"));
        const pinsFoundedQuery = query(collection(db, "pins"), where("originalCreatedBy", "==", uid), where("approved", "==", true));
        const pinsRuledQuery = query(collection(db, "pins"), where("createdBy", "==", uid), where("approved", "==", true));

        const [reviewsSnap, pinsFoundedSnap, pinsRuledSnap] = await Promise.all([
            getDocs(reviewsQuery), getDocs(pinsFoundedQuery), getDocs(pinsRuledQuery),
        ]);

        const allReviews = reviewsSnap.docs.map(d => ({...d.data(), id: d.id }));
        const allPinsFounded = pinsFoundedSnap.docs.map(d => ({...d.data(), id: d.id}));
        const allPinsRuled = pinsRuledSnap.docs.map(d => ({...d.data(), id: d.id})).filter(p => p.originalCreatedBy !== uid);
        
        setFoundedPins(allPinsFounded);
        setRuledPins(allPinsRuled);

        const pinIdsFromReviews = allReviews.map(r => r.pinId);
        const allPinIds = [...new Set([...pinIdsFromReviews, ...allPinsFounded.map(p => p.id), ...allPinsRuled.map(p => p.id)])];
        
        let pinsMap = new Map();
        if (allPinIds.length > 0) {
            for (let i = 0; i < allPinIds.length; i += 30) {
                const chunk = allPinIds.slice(i, i + 30);
                if (chunk.length > 0) {
                    const pinsQuery = query(collection(db, "pins"), where("__name__", "in", chunk));
                    const pinsChunkSnap = await getDocs(pinsQuery);
                    pinsChunkSnap.forEach(doc => pinsMap.set(doc.id, { id: doc.id, ...doc.data() }));
                }
            }
        }
        
        let maxDifficulty = 0, hardestPinData = null, totalFalls = 0;
        const tagFrequency = {}, resortStats = {};
        let totalFunFactor = 0, funFactorCount = 0;
        let totalPowder = 0, powderCount = 0, totalLanding = 0, landingCount = 0;
        const fallSeverityCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

        allReviews.forEach(review => {
            const pin = pinsMap.get(review.pinId);
            if (!pin) return;

            if (pin.difficulty > maxDifficulty) {
                maxDifficulty = pin.difficulty;
                hardestPinData = { id: pin.id, name: pin.featureName, difficulty: pin.difficulty };
            }
            if(review.fall) {
                totalFalls++;
                if (typeof review.fallSeverity === 'number') fallSeverityCounts[review.fallSeverity]++;
            }

            (review.tags || []).forEach(tag => { tagFrequency[tag] = (tagFrequency[tag] || 0) + 1; });

            if (typeof review.funFactor === 'number') { totalFunFactor += review.funFactor; funFactorCount++; }
            if (typeof review.powder === 'number') { totalPowder += review.powder; powderCount++; }
            if (typeof review.landing === 'number') { totalLanding += review.landing; landingCount++; }

            const resortName = pin.resort;
            if(!resortStats[resortName]) resortStats[resortName] = { name: resortName, completed: 0, falls: 0, totalDifficulty: 0, pins: new Set() };
            resortStats[resortName].completed++;
            resortStats[resortName].totalDifficulty += pin.difficulty;
            resortStats[resortName].pins.add(pin.id);
            if(review.fall) resortStats[resortName].falls++;
        });
        
        const allVisitedResorts = new Set(Object.keys(resortStats));
        [...allPinsFounded, ...allPinsRuled].forEach(pin => allVisitedResorts.add(pin.resort));

        allVisitedResorts.forEach(resort => {
            if(!resortStats[resort]) resortStats[resort] = { name: resort, completed: 0, falls: 0, totalDifficulty: 0, pins: new Set() };
            resortStats[resort].founded = allPinsFounded.filter(p => p.resort === resort).length;
            resortStats[resort].dethroned = allPinsRuled.filter(p => p.resort === resort).length;
        });

        const topTags = Object.entries(tagFrequency).sort(([, a], [, b]) => b - a).slice(0, 5).map(([key]) => key);

        setDashboardStats({
            global: {
                pinsCompleted: allReviews.length,
                pinsFounded: allPinsFounded.length,
                pinsDethroned: allPinsRuled.length,
                mountainsShredded: allVisitedResorts.size,
                fallRate: allReviews.length > 0 ? (totalFalls / allReviews.length) * 100 : 0,
                hardestPin: hardestPinData,
            },
            resortStats,
            topTags,
            analytics: {
                averageFunFactor: funFactorCount > 0 ? totalFunFactor / funFactorCount : 0,
                averagePowder: powderCount > 0 ? totalPowder / powderCount : 0,
                averageLanding: landingCount > 0 ? totalLanding / landingCount : 0,
                fallSeverityCounts,
            }
        });

        const recentPinsData = allReviews.slice(0, 5).map(review => {
            const pinData = pinsMap.get(review.pinId);
            return pinData ? { id: review.pinId, reviewId: review.id, name: pinData.featureName, resort: pinData.resort, difficulty: pinData.difficulty, reviewedAt: review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : 'N/A' } : null;
        }).filter(Boolean);
        setRecentReviewedPins(recentPinsData);

    } catch (err) {
        console.error("Error loading dashboard data:", err);
        toast.error("Could not load all your stats.");
    } finally {
        setLoadingStats(false);
    }
  };

  const loadFavorites = async (uid) => { /* ... (no changes) ... */ };
  const loadNotifications = async (uid) => { /* ... (no changes) ... */ };
  const handleSave = async () => { /* ... (no changes) ... */ };
  const handleDismissNotification = async (notificationId) => { /* ... (no changes) ... */ };
  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleProfilePicChange = (e) => { /* ... (no changes) ... */ };
  const handleResetPassword = async () => { /* ... (no changes) ... */ };
  const handleDeleteAccount = async () => { /* ... (no changes) ... */ };

  if (!user || (!isProfileComplete && !loadingStats)) return <IncompleteProfile navigate={navigate} />;
  
  if (loadingStats || !dashboardStats || !profileData) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div><p className="ml-4">Building your dashboard...</p></div>;
  
  const sliderLabels = {
    fun: ["Meh", "Kinda Fun", "Good Times", "Super Fun", "Best Hit Ever!"],
    daredevil: ["Low Commitment", "Requires Focus", "Full Send", "Calculated Risk", "Huck and Pray"],
    powder: ["Scraped", "Dust on Crust", "A Few Inches", "Soft Stuff", "Blower Pow"],
    landing: ["No Air", "Buttery", "Perfect", "A Bit Flat", "Pancake"]
  };
  const fallSeverityLabels = ["Popped right up", "Minor inconvenience", "Took a minute", "Definitely felt that", "YARD SALE"];
  const achievements = [
      { name: "Founder", desc: "Submit 5 approved pins", achieved: dashboardStats.global.pinsFounded >= 5, icon: <FaPlus/> },
      { name: "King Maker", desc: "Successfully dethrone 3 pins", achieved: dashboardStats.global.pinsDethroned >= 3, icon: <FaMedal/> },
      { name: "Mountain Goat", desc: "Visit 5 different resorts", achieved: dashboardStats.global.mountainsShredded >= 5, icon: <FaMountain/> },
      { name: "Solitude Shredder", desc: "Hit 10 pins at Solitude", achieved: (dashboardStats.resortStats['Solitude Mountain Resort']?.completed || 0) >= 10, icon: "🏔️" },
  ];
  const statsForSelectedResort = dashboardStats.resortStats[selectedStatResort];
  
  // NEW: Prepare resort reputation data for display
  const sortedResortReputation = Object.entries(profileData.resortReputation || {})
    .map(([resort, score]) => ({ resort, score }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 bg-gray-100/50 space-y-8">
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="text-right mb-4">
          <button onClick={() => editable ? handleSave() : setEditable(true)} className={`px-5 py-2 rounded-full font-semibold text-white transition-colors ${editable ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`} disabled={uploading}>
            {uploading ? "Saving..." : editable ? <><FaEdit className="inline -mt-1 mr-2"/>Save</> : <><FaEdit className="inline -mt-1 mr-2"/>Edit Profile</>}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center text-center">
            <div className="relative w-32 h-32 mb-4">
              <img src={profilePicUrl || `https://ui-avatars.com/api/?name=${formData.username || '?'}&background=random`} alt="Profile" className="w-full h-full rounded-full object-cover border-4 border-sky-500 shadow-lg"/>
              {editable && (<>
                  <input id="profile-pic-upload" type="file" ref={fileInputRef} onChange={handleProfilePicChange} accept="image/*" className="hidden"/>
                  <label htmlFor="profile-pic-upload" className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md cursor-pointer hover:bg-gray-200"><FaCamera/></label>
              </>)}
            </div>
            {editable ? (
              <div className="w-full max-w-xs space-y-2">
                <input type="text" name="username" value={formData.username} onChange={handleInputChange} placeholder="Username" className="text-2xl font-bold w-full border-b-2 p-1 text-center"/>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Full Name" className="text-lg w-full border-b-2 p-1 text-center"/>
              </div>
            ) : (
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900">{formData.username}</h1>
                <p className="text-xl text-gray-700">{formData.name}</p>
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <h3 className="font-bold text-gray-500 text-sm uppercase tracking-wider mb-2">Bio</h3>
            {editable ? (
              <textarea name="bio" value={formData.bio} onChange={handleInputChange} placeholder="Tell the community about your style..." rows={4} className="w-full border p-2 rounded text-base bg-gray-50"/>
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap min-h-[5rem] bg-gray-50 p-3 rounded-md">{formData.bio || "No bio yet. Click 'Edit Profile' to add one!"}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-bold">Home Mountain:</span>
                {editable ? (
                    <select name="homeMountain" value={formData.homeMountain} onChange={handleInputChange} className="text-base w-full border-b-2 p-1 mt-1">
                        <option value="Not Set">Select Home Mountain</option>
                        {Object.values(resorts).flat().sort((a,b) => a.name.localeCompare(b.name)).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                    </select>
                ) : <span className="ml-2">{formData.homeMountain}</span>}
                </div>
                <div><span className="font-bold">Discipline:</span>
                 {editable ? (
                    <select name="type" value={formData.type} onChange={handleInputChange} className="text-base w-full border-b-2 p-1 mt-1">
                        <option value="Skier">Skier</option><option value="Snowboarder">Snowboarder</option>
                    </select>
                 ) : <span className="ml-2">{formData.type}</span>}
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* UPDATED: StatCards now include Global Credibility */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        <StatCard title="Global Credibility" value={profileData.credibilityScore || 0} icon={<FaUserShield />}/>
        <StatCard title="Pins Completed" value={dashboardStats.global.pinsCompleted} icon="✔️"/>
        <StatCard title="Pins Founded" value={dashboardStats.global.pinsFounded} icon={<FaPlus/>}/>
        <StatCard title="Pins Ruled" value={dashboardStats.global.pinsDethroned} icon={<FaCrown/>}/>
      </div>
      
      {/* NEW: Resort Reputation Section */}
      <ResortReputationList reputationData={sortedResortReputation} />

      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Riding Style</h2>
            <div className="space-y-4">
                <RatingSlider label="Fun Factor" icon={<FaGrinStars/>} average={dashboardStats.analytics.averageFunFactor} labels={sliderLabels.fun} textColorClass="text-blue-500" bgColorClass="bg-blue-500"/>
                <RatingSlider label="Daredevil" icon={<GiDeathSkull/>} average={dashboardStats.analytics.averageDaredevilFactor} labels={sliderLabels.daredevil} textColorClass="text-red-500" bgColorClass="bg-red-500"/>
                <RatingSlider label="Powder" icon={<FaPoo/>} average={dashboardStats.analytics.averagePowder} labels={sliderLabels.powder} textColorClass="text-sky-500" bgColorClass="bg-sky-500"/>
                <RatingSlider label="Landing" icon={<GiPodiumWinner/>} average={dashboardStats.analytics.averageLanding} labels={sliderLabels.landing} textColorClass="text-green-500" bgColorClass="bg-green-500"/>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md">
             <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Carnage Report</h2>
             <div className="space-y-3">
                {fallSeverityLabels.map((label, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-600">{label}:</span>
                        <span className="font-bold text-lg text-red-600">{dashboardStats.analytics.fallSeverityCounts[index]}</span>
                    </div>
                ))}
             </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Resort Breakdown</h2>
            <select value={selectedStatResort} onChange={e => setSelectedStatResort(e.target.value)} className="border rounded px-3 py-2 text-base font-semibold bg-gray-50">
                <option value="All">-- Select a Resort --</option>
                {Object.keys(dashboardStats.resortStats).sort().map(resortName => (
                    <option key={resortName} value={resortName}>{resortName}</option>
                ))}
            </select>
        </div>
        {selectedStatResort !== "All" && statsForSelectedResort ? (
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-gray-100 p-3 rounded-lg"><p className="text-2xl font-bold">{statsForSelectedResort.completed}</p><p className="text-sm font-medium">Pins Hit</p></div>
                <div className="bg-gray-100 p-3 rounded-lg"><p className="text-2xl font-bold">{statsForSelectedResort.founded}</p><p className="text-sm font-medium">Pins Founded</p></div>
                <div className="bg-gray-100 p-3 rounded-lg"><p className="text-2xl font-bold">{statsForSelectedResort.dethroned}</p><p className="text-sm font-medium">Pins Ruled</p></div>
                <div className="bg-gray-100 p-3 rounded-lg"><p className="text-2xl font-bold">{(statsForSelectedResort.totalDifficulty / (statsForSelectedResort.completed || 1)).toFixed(1)}</p><p className="text-sm font-medium">Avg Difficulty</p></div>
             </div>
        ) : (
            <p className="text-center text-gray-500 py-4">Select a resort to see your detailed stats.</p>
        )}
      </div>
      
       <div className="bg-white p-6 rounded-xl shadow-md">
           <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center"><FaTrophy className="inline mr-2 text-yellow-500"/> Trophy Case</h2>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {achievements.map(ach => (
                   <div key={ach.name} className={`p-4 rounded-lg text-center border-2 ${ach.achieved ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 bg-gray-100 opacity-60'}`}>
                       <div className={`text-4xl mb-2 ${ach.achieved ? 'text-yellow-600' : 'text-gray-400'}`}>{ach.icon}</div>
                       <p className={`font-bold ${ach.achieved ? 'text-gray-800' : 'text-gray-500'}`}>{ach.name}</p>
                       <p className="text-xs text-gray-500 mt-1">{ach.desc}</p>
                   </div>
               ))}
           </div>
       </div>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center flex items-center justify-center gap-3"><FaBell /> Notifications</h2>
        <div className="max-w-3xl mx-auto space-y-4">
            {notifications.length > 0 ? (
                notifications.map(notif => (
                    <div key={notif.id} className={`relative p-4 pr-10 rounded-lg shadow-inner border-l-4 ${notif.type === 'approval' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                        <button onClick={() => handleDismissNotification(notif.id)} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"><FaTimes /></button>
                        <div className="flex items-start gap-3">
                            <div className="text-xl mt-1">{notif.type === 'approval' ? <FaCheckCircle className="text-green-500" /> : <FaTimesCircle className="text-red-500" />}</div>
                            <div>
                                <p className="font-semibold">Your pin submission "{notif.pinName}" was {notif.type === 'approval' ? 'approved!' : 'rejected.'}</p>
                                {notif.type === 'approval' && (<Link to={`/pin/${notif.pinId}`} className="text-sm text-blue-600 hover:underline">View your pin now.</Link>)}
                                {notif.type === 'rejection' && notif.reasons && (<div className="text-sm mt-2"><p className="font-medium">Reason(s):</p><ul className="list-disc list-inside text-gray-600">{notif.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></div>)}
                                <p className="text-xs text-gray-400 mt-2">{notif.createdAt?.toDate().toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                ))
            ) : (<p className="text-center text-gray-500 py-4">You have no new notifications.</p>)}
        </div>
      </div>
      
      <PinCarousel title="Favorite Pins" icon={<FaHeart className="text-red-500"/>} pins={favoritePins} emptyText="No favorite pins yet. Find some and heart them!"/>
      <PinCarousel title="Founded Pins" icon={<FaPlus className="text-green-500"/>} pins={foundedPins} emptyText="No founded pins yet. Go add some to the map!"/>
      <PinCarousel title="Pins Ruled" icon={<FaCrown className="text-yellow-500"/>} pins={ruledPins} emptyText="You haven't dethroned anyone... yet."/>

      <div className="bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Recent Activity</h2>
        {recentReviewedPins.length > 0 ? (
          <div className="space-y-4">
            {recentReviewedPins.map((pin) => (
              <Link to={`/pin/${pin.id}`} key={pin.reviewId} className="block group">
                <div className="bg-gray-100 p-4 rounded-lg shadow-md hover:shadow-lg hover:bg-gray-200 transition-all flex justify-between items-center">
                  <div>
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">{pin.name}</h3>
                      <p className="text-gray-600 text-sm mt-1">@ {pin.resort}</p>
                  </div>
                  <div className="text-right">
                      <div className="flex justify-center">{renderBlackDiamonds(pin.difficulty)}</div>
                      <p className="text-gray-500 text-xs mt-2">Reviewed: {pin.reviewedAt}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : <p className="text-gray-600 text-center text-lg py-8 bg-gray-50 rounded-md">No recent reviews yet.</p>}
      </div>

      <div className="text-center mt-8 pt-6 border-t border-gray-300">
         <h3 className="text-xl font-semibold text-red-700">Danger Zone</h3>
         <div className="flex flex-wrap justify-center gap-4 mt-4">
            <button onClick={handleResetPassword} className="bg-yellow-500 text-white px-6 py-3 rounded-full font-semibold hover:bg-yellow-600">Reset Password</button>
            <button onClick={handleDeleteAccount} className="bg-red-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-red-700">Delete Account</button>
         </div>
      </div>
    </div>
  );
}