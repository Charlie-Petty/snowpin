import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "../firebase";
import { collection, collectionGroup, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FaCrown, FaSearch, FaHeart, FaMountain, FaClipboardList, FaPoo, FaMapMarkerAlt, FaUserClock, FaUsers } from 'react-icons/fa';
import { resorts as allResorts } from '../utils/resorts';

// --- LEAFLET ICON SETUP --- //
const markerShadow = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png';
const resortIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});


// --- Reusable Sub-Components --- //

function MediaRenderer({ url, title }) {
    if (!url) {
        return <div className="aspect-video w-full bg-gray-300 rounded-lg flex items-center justify-center text-gray-500">No Media Provided</div>;
    }
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    
    return (
        <div className="w-full bg-black rounded-xl shadow-lg overflow-hidden">
            {isYoutube ? (
                <div className="aspect-video"><iframe className="w-full h-full" src={url} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>
            ) : (<video controls muted loop src={url} className="w-full h-auto" />)}
        </div>
    );
}

function Leaderboard({ title, data, icon, unit = "" }) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-md h-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center flex items-center justify-center gap-2">{icon}{title}</h3>
            <ol className="space-y-3">
                {data && data.length > 0 ? data.map((item, index) => (
                    <li key={item.id || item.name} className="flex items-center justify-between text-sm p-2 rounded-md transition-colors hover:bg-gray-100">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <span className="font-bold text-gray-400 w-5 text-center flex-shrink-0">{index + 1}</span>
                            {item.avatar && <img src={item.avatar} alt={item.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />}
                            <Link to={item.link} className="font-semibold text-blue-600 hover:underline truncate" title={item.name}>{item.name}</Link>
                        </div>
                        <span className="font-extrabold text-gray-800 bg-gray-200 px-2 py-0.5 rounded-md flex-shrink-0">{item.value}{unit}</span>
                    </li>
                )) : <p className="text-center text-sm text-gray-500 py-4">Awaiting data...</p>}
            </ol>
        </div>
    );
}

function StatCard({ title, value, icon }) {
    return (
        <div className="bg-white p-4 rounded-lg shadow text-center">
            <div className="text-4xl text-sky-600 mx-auto w-fit mb-2">{icon}</div>
            <div className="text-3xl font-bold text-gray-800">{value}</div>
            <h3 className="text-sm font-semibold text-gray-600 mt-1">{title}</h3>
        </div>
    );
}


// --- Main HomePage Component --- //

export default function HomePage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalPins: 0, totalDethrones: 0, totalFalls: 0, totalReviews: 0 });
    const [leaderboards, setLeaderboards] = useState({ kings: [], masters: [], likedPins: [], activeResorts: [] });
    const [resortMapData, setResortMapData] = useState([]);
    const [communityPick, setCommunityPick] = useState(null);
    const [recentActivity, setRecentActivity] = useState([]);
    
    const resortsByState = { Utah: [], Colorado: [], Wyoming: [] };
    Object.values(allResorts).flat().forEach(resort => {
        const state = Object.keys(allResorts).find(key => allResorts[key].some(r => r.name === resort.name));
        if (resortsByState[state]) resortsByState[state].push(resort.name);
    });
    const [selectedState, setSelectedState] = useState("Utah");
    const [selectedResort, setSelectedResort] = useState(resortsByState["Utah"][0]);
    
    const navigate = useNavigate();
    const mapCenter = [39.8, -108.9];
    const mapZoom = 5;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const pinsQuery = query(collection(db, "pins"), where("approved", "==", true));
                const usersQuery = query(collection(db, "users"), where("profileComplete", "==", true));
                const reviewsQuery = query(collectionGroup(db, 'reviews'));
                const recentReviewsQuery = query(collectionGroup(db, 'reviews'), orderBy('createdAt', 'desc'), limit(5));

                const [pinsSnapshot, usersSnapshot, reviewsSnapshot, recentReviewsSnap] = await Promise.all([
                    getDocs(pinsQuery), getDocs(usersQuery), getDocs(reviewsQuery), getDocs(recentReviewsQuery)
                ]);

                const pins = pinsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const reviews = reviewsSnapshot.docs.map(doc => doc.data());
                
                setStats({
                    totalPins: pins.length,
                    totalDethrones: pins.reduce((acc, pin) => acc + (pin.previousKings?.length || 0), 0),
                    totalFalls: reviews.filter(review => review.fall).length,
                    totalReviews: reviews.length,
                });

                const usersMap = new Map(users.map(u => [u.id, u]));
                const sortedPinsByFun = [...pins].sort((a,b) => (b.averageFunFactor || 0) - (a.averageFunFactor || 0));
                setCommunityPick(sortedPinsByFun.length > 0 ? sortedPinsByFun[0] : null);

                setLeaderboards({
                    kings: [...users].sort((a,b)=>(b.dethroneSuccessCount||0)-(a.dethroneSuccessCount||0)).slice(0,5).map(u=>({id:u.id,name:u.username,value:u.dethroneSuccessCount||0,link:`/user/${u.id}`,avatar:u.profilePic})),
                    masters: [...users].sort((a,b)=>(b.pinsSubmittedCount||0)-(a.pinsSubmittedCount||0)).slice(0,5).map(u=>({id:u.id,name:u.username,value:u.pinsSubmittedCount||0,link:`/user/${u.id}`,avatar:u.profilePic})),
                    likedPins: [...pins].sort((a,b)=>(b.likeCount||0)-(a.likeCount||0)).slice(0,5).map(p=>({id:p.id,name:p.featureName,value:p.likeCount||0,link:`/pin/${p.id}`})),
                    activeResorts: Object.entries(pins.reduce((acc,p)=>{acc[p.resort]=(acc[p.resort]||0)+(p.ratingCount||0);return acc},{})).sort(([,a],[,b])=>b-a).slice(0,5).map(([n,v])=>({name:n,value:v,link:`/map?resort=${encodeURIComponent(n)}`}))
                });

                const pinsForRecentReviews = [...new Set(recentReviewsSnap.docs.map(r => r.data().pinId))];
                let recentPinsMap = new Map();
                if(pinsForRecentReviews.length > 0){
                    const recentPinsDocs = await getDocs(query(collection(db, "pins"), where("__name__", "in", pinsForRecentReviews)));
                    recentPinsMap = new Map(recentPinsDocs.docs.map(p => [p.id, p.data()]));
                }
                setRecentActivity(recentReviewsSnap.docs.map(doc => ({...doc.data(),id:doc.id,user:usersMap.get(doc.data().userId),pin:recentPinsMap.get(doc.data().pinId)})).filter(a=>a.user&&a.pin));
                
                const resortData = {};
                Object.values(allResorts).flat().forEach(r => {
                    resortData[r.name] = { 
                        lat: r.lat, 
                        lng: r.lng, 
                        pinCount: 0, 
                        userSet: new Set() 
                    }; 
                });
                
                pins.forEach(pin => { 
                    if (resortData[pin.resort]) { 
                        resortData[pin.resort].pinCount++;
                        resortData[pin.resort].userSet.add(pin.createdBy);
                    }
                });
                
                const finalResortMapData = Object.entries(resortData).map(([name, data]) => ({
                    name,
                    ...data,
                    userCount: data.userSet.size,
                }));

                setResortMapData(finalResortMapData);

            } catch (error) { console.error("Failed to fetch homepage data:", error); } 
            finally { setLoading(false); }
        };
        fetchData();
    }, []);


    return (
        <div className="space-y-16">
            <div className="relative h-96 -mt-6 -mx-6 flex items-center justify-center text-white text-center bg-gray-800">
                <video autoPlay loop muted className="absolute z-0 w-full h-full object-cover opacity-30" src="https://assets.mixkit.co/videos/preview/mixkit-person-skiing-down-a-snow-slope-29221-large.mp4" />
                <div className="relative z-10 p-4">
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>Find Your Line</h1>
                    <p className="max-w-2xl mx-auto mt-4 text-lg md:text-xl font-medium">The ultimate map for expert skiers and riders. Discover, share, and conquer.</p>
                </div>
            </div>

            <div className="max-w-4xl mx-auto -mt-8 sm:-mt-2">
                <Link to="/beta-feedback" className="block bg-yellow-400 hover:bg-yellow-500 transition-all text-yellow-900 font-bold p-4 rounded-xl shadow-lg text-center">
                    <p className="text-xl">👋 Welcome Beta Tester!</p>
                    <p className="text-sm">Click here to view the FAQ and leave your feedback.</p>
                </Link>
            </div>

            <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-12">
                <div className="bg-white p-4 rounded-xl shadow-lg">
                    <h2 className="text-3xl font-bold text-center mb-4">Explore Resorts</h2>
                    <div className="w-full h-[500px] rounded-lg overflow-hidden border-2 border-blue-300">
                        <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom={true} style={{ height: "100%", width: "100%" }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                            {!loading && resortMapData.map(resort => (
                                <Marker key={resort.name} position={[resort.lat, resort.lng]} icon={resortIcon}>
                                    <Popup>
                                        <div className="text-center p-1">
                                            <h3 className="font-bold text-lg text-gray-900">{resort.name}</h3>
                                            <div className="text-sm text-gray-700 mt-1 space-y-0.5">
                                                <p><FaMapMarkerAlt className="inline mr-1.5 opacity-70"/>{resort.pinCount} Pins</p>
                                                <p><FaUsers className="inline mr-1.5 opacity-70"/>{resort.userCount} Contributors</p>
                                            </div>
                                            <button 
                                                onClick={() => navigate(`/map?resort=${encodeURIComponent(resort.name)}`)}
                                                className="mt-2 w-full bg-blue-600 text-white font-semibold text-xs px-2 py-1.5 rounded hover:bg-blue-700 transition-all"
                                            >
                                                Explore
                                            </button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                    <div className="flex flex-col md:flex-row items-center justify-center gap-2 mt-4 pt-4 border-t">
                        <select value={selectedState} onChange={e => { setSelectedState(e.target.value); setSelectedResort(resortsByState[e.target.value][0]); }} className="w-full md:w-auto px-4 py-2 border rounded-md">
                            {Object.keys(resortsByState).map(state => <option key={state} value={state}>{state}</option>)}
                        </select>
                        <select value={selectedResort} onChange={e => setSelectedResort(e.target.value)} className="w-full md:w-auto px-4 py-2 border rounded-md">
                            {resortsByState[selectedState].map(resort => <option key={resort} value={resort}>{resort}</option>)}
                        </select>
                        <button onClick={() => selectedResort && navigate(`/map?resort=${encodeURIComponent(selectedResort)}`)} className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition">Go</button>
                    </div>
                </div>

                <div className="pt-8">
                    <h2 className="text-3xl font-bold text-center mb-6">Site Stats</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up">
                        <StatCard title="Total Pins" value={loading ? '...' : stats.totalPins} icon={<FaMapMarkerAlt />} />
                        <StatCard title="Total Dethrones" value={loading ? '...' : stats.totalDethrones} icon={<FaCrown />} />
                        <StatCard title="Total Reviews" value={loading ? '...' : stats.totalReviews} icon={<FaClipboardList />} />
                        <StatCard title="Total Falls" value={loading ? '...' : stats.totalFalls} icon={<FaPoo />} />
                    </div>
                </div>

                <div className="pt-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-8">
                        <div>
                            <h2 className="text-3xl font-bold text-center mb-6">Community Pick</h2>
                            {loading ? <div className="bg-white p-6 rounded-xl shadow-md text-center">Loading...</div> : communityPick ? (
                                <div className="bg-white p-4 rounded-xl shadow-md">
                                    <MediaRenderer url={communityPick.media[0]} title={communityPick.featureName} />
                                    <div className="p-4">
                                        <h3 className="text-xl font-bold truncate">{communityPick.featureName}</h3>
                                        <p className="text-sm text-gray-500 mb-2">at {communityPick.resort}</p>
                                        <Link to={`/pin/${communityPick.id}`} className="w-full block text-center bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700">View Pin</Link>
                                    </div>
                                </div>
                            ) : <p className="text-center text-gray-500">No pins yet!</p>}
                        </div>
                        <div>
                             <h3 className="text-xl font-bold text-gray-900 mb-4 text-center flex items-center justify-center gap-2"><FaUserClock/> Recent Activity</h3>
                             <div className="space-y-3">
                                 {recentActivity.map(act => (
                                     <div key={act.id} className="bg-white p-3 rounded-lg shadow-sm text-xs">
                                        <p><Link to={`/user/${act.user.id}`} className="font-bold text-blue-600">{act.user.username}</Link> reviewed <Link to={`/pin/${act.pin.id}`} className="font-bold text-blue-600">{act.pin.featureName}</Link></p>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <h2 className="text-3xl font-bold text-center mb-6">Leaderboards</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Leaderboard title="Kings of SnowPin" data={leaderboards.kings} icon={<FaCrown className="text-yellow-500" />} unit=" 👑"/>
                            <Leaderboard title="Discovery Masters" data={leaderboards.masters} icon={<FaSearch className="text-blue-500" />} unit=" 🏔️"/>
                            <Leaderboard title="Most Liked Pins" data={leaderboards.likedPins} icon={<FaHeart className="text-red-500" />} unit=" ❤️"/>
                            <Leaderboard title="Busiest Resorts" data={leaderboards.activeResorts} icon={<FaMountain className="text-green-500" />} unit=" 📈"/>
                        </div>
                    </div>
                </div>

                <div className="text-center mt-8 pt-8 border-t border-gray-300">
                    <h3 className="font-bold text-gray-700">Ride Responsibly</h3>
                    <p className="text-xs text-gray-500 max-w-3xl mx-auto mt-2">Skiing and snowboarding are inherently dangerous activities. Conditions change, and features may be located in hazardous or closed terrain. Always ski or ride within your ability level, obey all resort signs and closures, and use proper safety equipment. SnowPin and its contributors are not liable for any injuries, damages, or other consequences resulting from the use of this application. You are responsible for your own safety and decisions.</p>
                </div>
            </div>
        </div>
    );
}
