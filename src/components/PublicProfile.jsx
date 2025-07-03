import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs, collectionGroup, orderBy } from "firebase/firestore";
import { useParams, Link, useNavigate } from "react-router-dom";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { FaMountain, FaPlus, FaCrown, FaTrophy, FaMedal } from 'react-icons/fa';
import { GiDeathSkull, GiPodiumWinner } from 'react-icons/gi';
import { FaPoo, FaGrinStars } from 'react-icons/fa';
import toast from "react-hot-toast";

// --- HELPER & SUB-COMPONENTS ---

const renderBlackDiamonds = (count, size = 'text-xl') => (
  <div className="flex gap-0.5 text-gray-800">
    {[...Array(5)].map((_, i) => <span key={i} className={`${size} ${i < Math.round(count) ? 'text-black' : 'text-gray-300'}`}>◆</span>)}
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


// --- MAIN PUBLIC PROFILE COMPONENT ---

export default function PublicProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatResort, setSelectedStatResort] = useState("All");

  const [foundedPins, setFoundedPins] = useState([]);
  const [ruledPins, setRuledPins] = useState([]);
  const [recentReviewedPins, setRecentReviewedPins] = useState([]);

  useEffect(() => {
    if (!userId) {
      navigate('/');
      return;
    }

    const loadAllProfileData = async () => {
        setLoading(true);
        try {
            // 1. Fetch User Data
            const userDocRef = doc(db, "users", userId);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists() || userDocSnap.data().profileComplete === false) {
                toast.error("This user profile is not available.");
                navigate('/');
                return;
            }
            const userData = userDocSnap.data();
            setProfile(userData);

            // 2. Fetch all user-related data (reviews, pins)
            const reviewsQuery = query(collectionGroup(db, "reviews"), where("userId", "==", userId), orderBy("createdAt", "desc"));
            const pinsFoundedQuery = query(collection(db, "pins"), where("originalCreatedBy", "==", userId), where("approved", "==", true));
            const pinsRuledQuery = query(collection(db, "pins"), where("createdBy", "==", userId), where("approved", "==", true));

            const [reviewsSnap, pinsFoundedSnap, pinsRuledSnap] = await Promise.all([
                getDocs(reviewsQuery), getDocs(pinsFoundedQuery), getDocs(pinsRuledQuery),
            ]);

            const allReviews = reviewsSnap.docs.map(d => ({ ...d.data(), id: d.id }));
            const allPinsFounded = pinsFoundedSnap.docs.map(d => ({ ...d.data(), id: d.id }));
            const allPinsRuled = pinsRuledSnap.docs.map(d => ({ ...d.data(), id: d.id })).filter(p => p.originalCreatedBy !== userId);
            
            setFoundedPins(allPinsFounded);
            setRuledPins(allPinsRuled);

            // 3. Aggregate all unique pin IDs to fetch their data
            const allPinIds = [...new Set([
                ...allReviews.map(r => r.pinId), 
                ...allPinsFounded.map(p => p.id), 
                ...allPinsRuled.map(p => p.id)
            ])];
            
            let pinsMap = new Map();
            if (allPinIds.length > 0) {
                 for (let i = 0; i < allPinIds.length; i += 30) {
                    const chunk = allPinIds.slice(i, i + 30);
                    if (chunk.length > 0) {
                        const pinsQuery = query(collection(db, "pins"), where("__name__", "in", chunk));
                        const pinsChunkSnap = await getDocs(pinsQuery);
                        pinsChunkSnap.forEach(d => pinsMap.set(d.id, { id: d.id, ...d.data() }));
                    }
                }
            }
            
            // 4. Calculate all stats from the fetched data
            let maxDifficulty = 0, hardestPinData = null, totalFalls = 0;
            const tagFrequency = {}, resortStats = {};
            let totalFunFactor = 0, funFactorCount = 0, totalDaredevilFactor = 0, daredevilCount = 0;
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
                if (typeof review.daredevilFactor === 'number') { totalDaredevilFactor += review.daredevilFactor; daredevilCount++; }
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
                    averageDaredevilFactor: daredevilCount > 0 ? totalDaredevilFactor / daredevilCount : 0,
                    averagePowder: powderCount > 0 ? totalPowder / powderCount : 0,
                    averageLanding: landingCount > 0 ? totalLanding / landingCount : 0,
                    fallSeverityCounts,
                }
            });

            const recentPinsData = allReviews.slice(0, 5).map(review => {
                const pinData = pinsMap.get(review.pinId);
                return pinData ? {
                  id: review.pinId,
                  reviewId: review.id,
                  name: pinData.featureName,
                  resort: pinData.resort,
                  difficulty: pinData.difficulty,
                  reviewedAt: review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : 'N/A'
                } : null;
            }).filter(Boolean);
            setRecentReviewedPins(recentPinsData);

        } catch (error) {
            console.error("Error loading public profile:", error);
            toast.error("Could not load this user's profile.");
            navigate('/');
        } finally {
            setLoading(false);
        }
    };

    loadAllProfileData();
  }, [userId, navigate]);

  if (loading || !profile || !dashboardStats) {
    return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div><p className="ml-4">Loading Profile...</p></div>;
  }
  
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

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 bg-gray-100/50 space-y-8">
      {/* Profile Header */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center text-center">
            <div className="relative w-32 h-32 mb-4">
              <img src={profile.profilePic || `https://ui-avatars.com/api/?name=${profile.username || '?'}&background=random`} alt="Profile" className="w-full h-full rounded-full object-cover border-4 border-sky-500 shadow-lg"/>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gray-900">{profile.username}</h1>
            </div>
          </div>
          <div className="md:col-span-2">
            <h3 className="font-bold text-gray-500 text-sm uppercase tracking-wider mb-2">Bio</h3>
            <p className="text-gray-700 whitespace-pre-wrap min-h-[5rem] bg-gray-50 p-3 rounded-md">{profile.bio || "This user hasn't written a bio yet."}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-bold">Home Mountain:</span><span className="ml-2">{profile.homeMountain}</span></div>
                <div><span className="font-bold">Discipline:</span><span className="ml-2">{profile.type}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Pins Completed" value={dashboardStats.global.pinsCompleted} icon="✔️"/>
        <StatCard title="Pins Founded" value={dashboardStats.global.pinsFounded} icon={<FaPlus/>}/>
        <StatCard title="Pins Ruled" value={dashboardStats.global.pinsDethroned} icon={<FaCrown/>}/>
        <StatCard title="Mountains Shredded" value={dashboardStats.global.mountainsShredded} icon={<FaMountain/>}/>
        <StatCard title="Fall Rate" value={`${dashboardStats.global.fallRate.toFixed(0)}%`} icon="💥"/>
        {dashboardStats.global.hardestPin ?
            <StatCard title="Hardest Pin" value={renderBlackDiamonds(dashboardStats.global.hardestPin.difficulty, 'text-base')} subtext={dashboardStats.global.hardestPin.name} icon="💎" link={`/pin/${dashboardStats.global.hardestPin.id}`}/>
            : <StatCard title="Hardest Pin" value="N/A" icon="💎"/>
        }
        <div className="col-span-full bg-white p-4 rounded-lg shadow-sm">
             <h3 className="text-lg font-bold text-gray-800 text-center mb-2">Their Forte</h3>
             <div className="flex flex-wrap justify-center gap-2">
                {dashboardStats.topTags.length > 0 ? dashboardStats.topTags.map(tag => (
                    <span key={tag} className="bg-sky-100 text-sky-800 text-sm font-medium px-3 py-1.5 rounded-full">{tag}</span>
                )) : <p className="text-sm text-gray-500">This user's forte is yet to be discovered!</p>}
             </div>
        </div>
      </div>
      
      {/* Analytics (Riding Style & Carnage Report) */}
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
      
      {/* Resort Breakdown */}
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
            <p className="text-center text-gray-500 py-4">Select a resort to see this user's detailed stats.</p>
        )}
      </div>
      
      {/* Trophy Case */}
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

      {/* Pin Carousels */}
      <PinCarousel title="Founded Pins" icon={<FaPlus className="text-green-500"/>} pins={foundedPins} emptyText="This user hasn't founded any pins yet."/>
      <PinCarousel title="Pins Ruled" icon={<FaCrown className="text-yellow-500"/>} pins={ruledPins} emptyText="This user hasn't dethroned anyone... yet."/>

      {/* Recent Activity */}
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
        ) : <p className="text-gray-600 text-center text-lg py-8 bg-gray-50 rounded-md">This user has no recent reviews.</p>}
      </div>
    </div>
  );
}