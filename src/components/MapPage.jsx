// src/components/MapPage.jsx

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvent } from "react-leaflet";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { db } from "../firebase";
import { resorts as allResorts } from "../utils/resorts";
import { isPinInResortBoundary } from "../utils/geofence";
import { collection, getDocs, where, query as firestoreQuery, collectionGroup, getDoc, doc, deleteDoc } from "firebase/firestore";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import toast from "react-hot-toast";
import { FaCrown, FaUser, FaMountain, FaTimes, FaMedal, FaHeart, FaMapMarkerAlt, FaCheck, FaStar, FaTrash } from 'react-icons/fa';


// --- LEAFLET ICON SETUP --- //
// Fix default marker display issues
delete L.Icon.Default.prototype._getIconUrl;
const markerShadow = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png';
const createIcon = (iconUrl) => new L.Icon({
    iconUrl,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Default (Incomplete)
const blueIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png');
// Favorite
const redIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png');
// Submitted by You (Founder)
const greenIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png');
// Current Dethrone (King of the Hill, but you didn't create it)
const goldIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png');
// Completed
const lightBlueIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png'); // Using violet for visibility
// Pin Drop Marker
const greyIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png');


// --- CHILD COMPONENTS (can be moved to separate files) --- //

const StatCard = ({ title, value, icon, link }) => {
    const content = (
        <div className="bg-white p-4 rounded-lg shadow-md text-center h-full flex flex-col justify-center items-center">
            {icon}
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-sm text-gray-600">{title}</p>
        </div>
    );
    return link ? <Link to={link}>{content}</Link> : content;
};

const CommunityStats = ({ stats, resortName, loading }) => {
    if (loading) {
        return <div className="text-center p-4">Loading Community Stats...</div>;
    }

    return (
        <div className="bg-gray-100 p-6 rounded-lg shadow-inner">
            <h2 className="text-2xl font-bold text-center mb-4">Community Stats: {resortName}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard title="King of the Mountain" value={stats.kingOfMountain.username || 'N/A'} icon={<FaCrown className="text-yellow-500 text-2xl mb-1"/>} link={stats.kingOfMountain.id ? `/user/${stats.kingOfMountain.id}` : null}/>
                <StatCard title="Pins Placed" value={stats.totalPins} icon={<FaMapMarkerAlt className="text-red-500 text-2xl mb-1"/>}/>
                <StatCard title="Reviews Made" value={stats.totalReviews} icon={<FaCheck className="text-blue-500 text-2xl mb-1"/>}/>
                <StatCard title="Dethrones" value={stats.totalDethrones} icon={<FaMedal className="text-orange-500 text-2xl mb-1"/>} />
                <StatCard title="Total Falls" value={stats.totalFalls} icon={<p className="text-2xl mb-1">💥</p>} />
                <StatCard title="Avg. Difficulty" value={stats.averageDifficulty.toFixed(1)} icon={<div className="flex text-2xl mb-1">◆</div>} />
            </div>
             <div className="text-center mt-6">
                <button className="bg-sky-600 text-white font-semibold px-6 py-2 rounded-full hover:bg-sky-700 transition disabled:bg-gray-400" disabled>
                    View Conditions Report (Coming Soon)
                </button>
            </div>
        </div>
    );
};

const PersonalStats = ({ stats, loading }) => {
     if (loading) {
        return <div className="text-center p-4">Loading Personal Stats...</div>;
    }
    return (
        <div className="bg-blue-50 p-6 rounded-lg">
             <h2 className="text-2xl font-bold text-center mb-4">Your Stats at this Resort</h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Pins Completed" value={`${stats.pinsCompleted} / ${stats.totalPins}`} icon={<FaCheck className="text-green-500 text-2xl mb-1"/>} />
                <StatCard title="Pins Founded" value={stats.pinsSubmitted} icon={<FaUser className="text-green-500 text-2xl mb-1"/>}/>
                <StatCard title="Pins You Rule" value={stats.pinsDethroned} icon={<FaCrown className="text-yellow-500 text-2xl mb-1"/>} />
             </div>
        </div>
    );
};

const MapFilterControls = ({ activeFilter, setFilter, disabled }) => {
    const filters = [
        { id: 'all', label: 'All Pins', icon: <FaMountain/> },
        { id: 'completed', label: 'Completed', icon: <FaCheck className="text-violet-500"/> },
        { id: 'favorites', label: 'Favorites', icon: <FaHeart className="text-red-500"/> },
        { id: 'my-pins', label: 'My Founded Pins', icon: <FaUser className="text-green-500"/> },
        { id: 'my-dethrones', label: 'Pins I Rule', icon: <FaCrown className="text-yellow-500"/> },
        { id: 'incomplete', label: 'Incomplete', icon: <FaMapMarkerAlt className="text-blue-500"/> },
    ];

    return (
        <div className="flex flex-wrap justify-center gap-2 p-2 bg-gray-200 rounded-md">
            {filters.map(filter => (
                <button
                    key={filter.id}
                    onClick={() => setFilter(filter.id)}
                    disabled={disabled}
                    className={`px-3 py-1.5 text-sm font-semibold flex items-center gap-2 rounded-md transition ${
                        activeFilter === filter.id
                            ? 'bg-blue-600 text-white shadow'
                            : 'bg-white text-gray-700 hover:bg-blue-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {filter.icon}
                    {filter.label}
                </button>
            ))}
        </div>
    );
};


// --- MAP UTILITY COMPONENTS --- //

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, 14);
    }
  }, [center, map]);
  return null;
}

function PinDropHandler({ pinMode, setMarkerPos, selectedResortName }) {
  const map = useMap();

  useMapEvent("click", (e) => {
    if (pinMode) {
      // THE FIX: For beta testing, the geofence check is bypassed.
      // The original code is commented out below.
      const { lat, lng } = e.latlng;
      setMarkerPos({ lat, lng });
      map.setView(e.latlng, map.getZoom());

      /*
      // Original code with geofence check
      const resort = selectedResortName ? Object.values(allResorts).flat().find(
        r => r.name.trim().toLowerCase() === selectedResortName.trim().toLowerCase()
      ) : null;
      
      const { lat, lng } = e.latlng;
      if (resort && isPinInResortBoundary({ lat, lng }, resort)) {
        setMarkerPos({ lat, lng });
        map.setView(e.latlng, map.getZoom());
      } else {
        toast.error("Pin must be placed within the resort boundaries.");
      }
      */
    }
  });
  return null;
}


// --- MAIN MAP PAGE COMPONENT --- //

export default function MapPage() {
  const [urlSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useOutletContext(); // Get user and isAdmin status from context

  // Component State
  const [selectedResort, setSelectedResort] = useState(urlSearchParams.get("resort") || "Solitude Mountain Resort");
  const [resortCenter, setResortCenter] = useState([40.62, -111.591]);
  const [pinMode, setPinMode] = useState(false);
  const [markerPos, setMarkerPos] = useState(null);
  const [allPins, setAllPins] = useState([]);
  const [loading, setLoading] = useState(true);

  // User-specific pin statuses
  const [userPinData, setUserPinData] = useState({
      completedIds: new Set(),
      favoriteIds: new Set(),
      submittedIds: new Set(),
      dethronedIds: new Set(),
  });

  // Stats State
  const [communityStats, setCommunityStats] = useState({ kingOfMountain: {}, totalPins: 0, totalReviews: 0, totalDethrones: 0, totalFalls: 0, averageDifficulty: 0 });
  const [personalStats, setPersonalStats] = useState({ pinsCompleted: 0, totalPins: 0, pinsSubmitted: 0, pinsDethroned: 0 });

  // Filtering State
  const [activeFilter, setActiveFilter] = useState('all');

  const resortData = useMemo(() => {
    return Object.values(allResorts).flat().find(r => r.name === selectedResort)
  }, [selectedResort]);

  useEffect(() => {
    if (resortData) {
      setResortCenter([resortData.lat, resortData.lng]);
    }
  }, [resortData]);

  // Main Data Fetching and Processing Hook
  useEffect(() => {
    const fetchAndProcessData = async () => {
        setLoading(true);
        if (!resortData) return;

        // 1. Fetch all approved pins for the resort
        const pinsRef = collection(db, "pins");
        const q = firestoreQuery(pinsRef, where("approved", "==", true), where("resort", "==", resortData.name));
        const pinsSnapshot = await getDocs(q);
        const pins = pinsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllPins(pins);
        const pinIds = pins.map(p => p.id);

        // 2. Fetch all reviews for these pins
        let reviews = [];
        if (pinIds.length > 0) {
            const reviewsQuery = firestoreQuery(collectionGroup(db, 'reviews'), where('pinId', 'in', pinIds));
            const reviewsSnapshot = await getDocs(reviewsQuery);
            reviews = reviewsSnapshot.docs.map(doc => doc.data());
        }
        
        // 3. Calculate Community Stats
        const kingCounter = {};
        let totalDifficulty = 0;
        pins.forEach(pin => {
            kingCounter[pin.createdBy] = (kingCounter[pin.createdBy] || 0) + 1;
            totalDifficulty += pin.difficulty || 0;
        });

        const kingId = Object.keys(kingCounter).reduce((a, b) => kingCounter[a] > kingCounter[b] ? a : b, null);
        let kingData = {};
        if (kingId) {
            const userRef = doc(db, "users", kingId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                 kingData = {id: userSnap.id, username: userSnap.data().username, ...userSnap.data()};
            }
        }

        const totalDethrones = pins.reduce((acc, pin) => acc + (pin.previousKings?.length || 0), 0);

        setCommunityStats({
            kingOfMountain: kingData,
            totalPins: pins.length,
            totalReviews: reviews.length,
            totalDethrones: totalDethrones,
            totalFalls: reviews.filter(r => r.fall).length,
            averageDifficulty: pins.length > 0 ? totalDifficulty / pins.length : 0,
        });

        // 4. Fetch User-Specific Data & Calculate Personal Stats
        if (user && pinIds.length > 0) {
            const favsQuery = firestoreQuery(collectionGroup(db, 'favorites'), where('userId', '==', user.uid));
            const favsSnapshot = await getDocs(favsQuery);
            const favoriteIds = new Set(favsSnapshot.docs.map(doc => doc.ref.path.split('/')[1]).filter(id => pinIds.includes(id)));

            const userReviews = reviews.filter(r => r.userId === user.uid);
            const completedIds = new Set(userReviews.map(r => r.pinId));
            
            const submittedIds = new Set();
            const dethronedIds = new Set();
            pins.forEach(pin => {
                if (pin.originalCreatedBy === user.uid) {
                    submittedIds.add(pin.id);
                }
                if (pin.createdBy === user.uid && pin.originalCreatedBy !== user.uid) {
                    dethronedIds.add(pin.id);
                }
            });

            setUserPinData({ completedIds, favoriteIds, submittedIds, dethronedIds });
            setPersonalStats({
                pinsCompleted: completedIds.size,
                totalPins: pins.length,
                pinsSubmitted: submittedIds.size,
                pinsDethroned: dethronedIds.size
            });
        } else {
            setUserPinData({ completedIds: new Set(), favoriteIds: new Set(), submittedIds: new Set(), dethronedIds: new Set() });
            setPersonalStats({ pinsCompleted: 0, totalPins: pins.length, pinsSubmitted: 0, pinsDethroned: 0 });
        }

        setLoading(false);
    };

    fetchAndProcessData();
  }, [selectedResort, user, resortData]);


  // NEW: Function to delete a pin (for admins)
  const handleDeletePin = async (pinId, pinName) => {
    if (!window.confirm(`Are you sure you want to permanently delete the pin "${pinName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const pinRef = doc(db, "pins", pinId);
      await deleteDoc(pinRef);
      
      setAllPins(prevPins => prevPins.filter(p => p.id !== pinId));
      toast.success(`Pin "${pinName}" has been deleted.`);
    } catch (error) {
      console.error("Error deleting pin: ", error);
      toast.error("Failed to delete pin.");
    }
  };

  // Helper to render difficulty diamonds - font size is now smaller
  const renderBlackDiamonds = (count) => (
    <div className="flex justify-center gap-0.5 text-gray-800">
      {[...Array(5)].map((_, i) => <span key={i} className={`text-base ${i < Math.round(count) ? 'text-black' : 'text-gray-300'}`}>◆</span>)}
    </div>
  );

  const getPinIcon = useCallback((pin) => {
      const { id, createdBy, originalCreatedBy } = pin;
      const { favoriteIds, completedIds } = userPinData;

      if (createdBy === user?.uid) {
          return originalCreatedBy === user?.uid ? greenIcon : goldIcon;
      }
      if (favoriteIds.has(id)) return redIcon;
      if (completedIds.has(id)) return lightBlueIcon;
      
      return blueIcon;
  }, [userPinData, user]);

  const filteredPins = useMemo(() => {
    if (activeFilter === 'all') return allPins;
    if (!user) {
        toast.error("You must be logged in to use filters.");
        return allPins;
    };

    const { completedIds, favoriteIds, submittedIds, dethronedIds } = userPinData;

    switch (activeFilter) {
        case 'completed':
            return allPins.filter(p => completedIds.has(p.id));
        case 'favorites':
            return allPins.filter(p => favoriteIds.has(p.id));
        case 'my-pins':
            return allPins.filter(p => submittedIds.has(p.id));
        case 'my-dethrones':
            return allPins.filter(p => dethronedIds.has(p.id));
        case 'incomplete':
             return allPins.filter(p => !completedIds.has(p.id));
        default:
            return allPins;
    }
  }, [activeFilter, allPins, user, userPinData]);

  return (
    <div key={selectedResort} className="h-screen-minus-header flex flex-col bg-gray-50">
      {/* --- Top Control Bar --- */}
      <div className="bg-white shadow-md p-4 space-y-4 z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <label className="text-sm font-medium mr-2">Select Resort:</label>
            <select value={selectedResort} onChange={(e) => {
                const newResort = e.target.value;
                navigate(`/map?resort=${encodeURIComponent(newResort)}`);
                setSelectedResort(newResort);
                setActiveFilter('all');
              }} className="border rounded px-2 py-1 text-sm">
              {Object.values(allResorts).flat().sort((a,b) => a.name.localeCompare(b.name)).map(resort => <option key={resort.name} value={resort.name}>{resort.name}</option>)}
            </select>
          </div>
          <button onClick={() => { setPinMode(prev => !prev); setMarkerPos(null); }} className={`px-4 py-2 rounded font-semibold text-white shadow ${pinMode ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`}>
            {pinMode ? "Cancel Pin Drop" : "Add a Pin"}
          </button>
        </div>
        {user && <MapFilterControls activeFilter={activeFilter} setFilter={setActiveFilter} disabled={loading} />}
      </div>

      {/* --- Main Content Area (Map + Stats) --- */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* --- Map Container --- */}
        <div className="w-full h-[60vh] md:h-[70vh] bg-gray-300">
            {resortCenter && !isNaN(resortCenter[0]) && !isNaN(resortCenter[1]) ? (
            <MapContainer center={resortCenter} zoom={14} style={{ height: "100%", width: "100%" }}>
                <RecenterMap center={resortCenter} />
                <PinDropHandler pinMode={pinMode} setMarkerPos={setMarkerPos} selectedResortName={selectedResort} />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
                <TileLayer url="https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png" attribution="© OpenSnowMap.org" />

                {pinMode && markerPos && (
                <Marker position={[markerPos.lat, markerPos.lng]} icon={greyIcon}>
                    <Popup>
                    <button onClick={() => navigate(`/submit-pin?lat=${markerPos.lat}&lng=${markerPos.lng}&resort=${encodeURIComponent(selectedResort)}`)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded">
                        Add Pin Here
                    </button>
                    </Popup>
                </Marker>
                )}

                {!loading && filteredPins.map((pin) => (
                (pin.lat && pin.lng) ? (
                    <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={user ? getPinIcon(pin) : blueIcon}>
                    {/* --- SMALLER POPUP --- */}
                    <Popup>
                        <div className="relative w-44 text-center p-1">
                            {isAdmin && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePin(pin.id, pin.featureName);
                                    }}
                                    className="absolute -top-2 -left-2 z-20 bg-red-700 text-white rounded-full p-1.5 leading-none shadow-lg hover:bg-red-800"
                                    aria-label="Delete Pin"
                                >
                                    <FaTrash size={9} />
                                </button>
                            )}
                            <h3 className="font-extrabold text-gray-900 text-base mb-1 truncate px-1" title={pin.featureName}>{pin.featureName}</h3>
                            <div className="mb-2">
                                {renderBlackDiamonds(pin.difficulty)}
                            </div>
                            {pin.topTags && pin.topTags.length > 0 && (
                                <div className="flex flex-wrap justify-center gap-1 mb-2 px-1">
                                    {pin.topTags.map(tag => (
                                        <span key={tag} className="text-xs bg-sky-100 text-sky-800 font-medium px-1.5 py-0.5 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <button onClick={() => navigate(`/pin/${pin.id}`)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-1.5 px-3 rounded-md transition-transform transform hover:scale-105">
                                View Pin
                            </button>
                        </div>
                    </Popup>
                    </Marker>
                ) : null
                ))}
            </MapContainer>
            ) : (
            <div className="h-full flex items-center justify-center text-gray-500">Select a resort to view the map.</div>
            )}
        </div>

        {/* --- Stats Sections --- */}
        <div className="p-4 space-y-4">
            <CommunityStats stats={communityStats} resortName={selectedResort} loading={loading} />
            {user && <PersonalStats stats={personalStats} loading={loading}/>}
        </div>
      </div>
    </div>
  );
}

