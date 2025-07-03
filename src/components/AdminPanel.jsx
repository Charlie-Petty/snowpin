import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collectionGroup,
  writeBatch,
  arrayUnion,
  addDoc,
  Timestamp,
  orderBy, // Import orderBy
} from "firebase/firestore";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { FaThumbsUp, FaUser, FaEdit, FaSave, FaTimes, FaMedal } from "react-icons/fa";
import PinViewerMap from "./PinViewerMap";

// Helper to render a media URL
const MediaRenderer = ({ url, title, className = "" }) => {
    if (!url) return <div className={`aspect-video w-full bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 ${className}`}>No media.</div>;
    const isYoutube = url.includes("youtube.com/embed");
    return (
        <div className={`w-full bg-black rounded-xl shadow-lg overflow-hidden ${className}`}>
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

const RejectionModal = ({ submission, onReject, onCancel, onBan }) => {
    const [reasons, setReasons] = useState([]);
    const [otherReason, setOtherReason] = useState("");
    const commonReasons = ["Inaccurate Location", "Inappropriate Media", "Duplicate Pin", "Private Property / Closed Area", "Low Quality Content"];
    const handleReasonChange = (reason) => setReasons(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]);
    const handleSubmit = () => {
        const finalReasons = [...reasons];
        if (otherReason.trim()) { finalReasons.push(otherReason.trim()); }
        if (finalReasons.length === 0) { return toast.error("Please select at least one reason for rejection."); }
        onReject(finalReasons);
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[2000]">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
                <h3 className="text-xl font-bold">Reject Pin: <span className="text-blue-600">{submission.featureName}</span></h3>
                <div className="space-y-2">
                    <p className="font-semibold">Reason(s) for rejection:</p>
                    {commonReasons.map(reason => (<label key={reason} className="flex items-center gap-2"><input type="checkbox" checked={reasons.includes(reason)} onChange={() => handleReasonChange(reason)} className="h-4 w-4 accent-blue-600"/>{reason}</label>))}
                    <input type="text" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Other reason..." className="w-full border px-3 py-2 rounded mt-2"/>
                </div>
                 <div className="pt-4 border-t">
                    <button onClick={() => { if(window.confirm(`Are you sure you want to BAN the user "${submission.username}"? This is permanent.`)) onBan(); }} className="w-full bg-red-800 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-900">Ban User</button>
                    <p className="text-xs text-center text-gray-500 mt-1">Banning will also reject the pin.</p>
                </div>
                <div className="flex gap-4 pt-4 border-t">
                    <button onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded text-sm w-1/2">Cancel</button>
                    <button onClick={handleSubmit} className="bg-red-600 text-white px-4 py-2 rounded text-sm w-1/2">Confirm Rejection</button>
                </div>
            </div>
        </div>
    );
};


export default function AdminPanel() {
  const [submissions, setSubmissions] = useState([]);
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [dethroneChallenges, setDethroneChallenges] = useState([]); // NEW state for challenges
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pins');
  const [editingSubmissionId, setEditingSubmissionId] = useState(null);
  const [editedData, setEditedData] = useState({});
  const [rejectionTarget, setRejectionTarget] = useState(null);

  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });
  }, []);

  const yellowIcon = new L.Icon({ iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/yellow-dot.png", iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowUrl: markerShadow });

  const fetchPinSubmissions = async () => {
    const q = query(collection(db, "pins"), where("approved", "==", false));
    const snapshot = await getDocs(q);
    const data = await Promise.all(snapshot.docs.map(async (docSnap) => {
      const pin = docSnap.data();
      let username = "Unknown";
      if (pin.createdBy) {
        const userSnap = await getDoc(doc(db, "users", pin.createdBy));
        username = userSnap.exists() ? userSnap.data().username || "User" : "User";
      }
      return { id: docSnap.id, ...pin, username };
    }));
    setSubmissions(data);
  };

  const fetchNameSuggestions = async () => {
    const q = query(collectionGroup(db, "nameSuggestions"), where("status", "==", "pending"));
    const snapshot = await getDocs(q);
    const data = await Promise.all(snapshot.docs.map(async (suggestionDoc) => {
        const suggestion = suggestionDoc.data();
        const upvotes = suggestion.upvotes || 0;
        const downvotes = suggestion.downvotes || 0;
        if (downvotes >= upvotes) return null;
        const pinRef = suggestionDoc.ref.parent.parent;
        const pinSnap = await getDoc(pinRef);
        const pinData = pinSnap.exists() ? pinSnap.data() : null;
        return { id: suggestionDoc.id, pinId: pinRef.id, ...suggestion, pinData };
    }));
    setNameSuggestions(data.filter(Boolean));
  };

  // NEW: Function to fetch pending dethrone challenges
  const fetchDethroneChallenges = async () => {
      const q = query(collectionGroup(db, "dethroneChallenges"), where("status", "==", "pending"), orderBy("submittedAt", "desc"));
      const snapshot = await getDocs(q);
      const data = await Promise.all(snapshot.docs.map(async (challengeDoc) => {
          const challenge = challengeDoc.data();
          const pinRef = doc(db, "pins", challenge.pinId);
          const pinSnap = await getDoc(pinRef);
          return {
              id: challengeDoc.id,
              ...challenge,
              pinData: pinSnap.exists() ? pinSnap.data() : null
          };
      }));
      setDethroneChallenges(data);
  };
  
  useEffect(() => {
    const fetchAllData = async () => {
        setLoading(true);
        try {
            // Updated to fetch all three data sources
            await Promise.all([fetchPinSubmissions(), fetchNameSuggestions(), fetchDethroneChallenges()]);
        } catch (err) {
            console.error("Error fetching admin panel data:", err);
            toast.error("Failed to load admin data.");
        } finally {
            setLoading(false);
        }
    };
    fetchAllData();
  }, []);

  const sendNotification = async (userId, type, data) => {
    if (!userId) return;
    const userNotificationsRef = collection(db, `users/${userId}/notifications`);
    await addDoc(userNotificationsRef, { type, ...data, createdAt: Timestamp.now(), read: false });
  };

  const handleEditToggle = (submission) => {
    if (editingSubmissionId === submission.id) {
        setEditingSubmissionId(null);
        setEditedData({});
    } else {
        setEditingSubmissionId(submission.id);
        setEditedData({ featureName: submission.featureName || "", description: submission.description || "", directions: submission.directions || "" });
    }
  };
  
  const handleEditChange = (e) => setEditedData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSaveEdit = async (submissionId) => {
      const pinRef = doc(db, "pins", submissionId);
      try {
          await updateDoc(pinRef, editedData);
          setSubmissions(prev => prev.map(sub => sub.id === submissionId ? { ...sub, ...editedData } : sub));
          setEditingSubmissionId(null);
          toast.success("Edits saved!");
      } catch (error) { toast.error("Could not save edits."); }
  };

  const handleApprovePin = async (submission) => {
    const pinRef = doc(db, "pins", submission.id);
    try {
        await updateDoc(pinRef, { approved: true });
        // --- vv ADD THIS ENTIRE BLOCK vv ---
        // Automatically add a "review" for the submitter to mark it as completed for them.
        try {
          const reviewData = {
            pinId: submission.id,
            userId: submission.createdBy,
            createdAt: Timestamp.now(),
            rating: submission.difficulty || 3, // Use their submitted rating or a default
            fall: false,
            comment: "Original submission of this pin.",
            isSubmissionReview: true // Flag to identify this auto-review
          };
          const reviewsRef = collection(db, `pins/${submission.id}/reviews`);
          await addDoc(reviewsRef, reviewData);
      } catch (reviewError) {
          console.error("Could not add automatic completion review:", reviewError);
          toast.error("Pin approved, but failed to add completion review.");
      }
      // --- ^^ END OF BLOCK TO ADD ^^ ---
        await sendNotification(submission.createdBy, 'approval', { pinName: submission.featureName, pinId: submission.id });
        setSubmissions(prev => prev.filter(s => s.id !== submission.id));
        toast.success("Pin approved and is now live!");
    } catch (error) { toast.error(`Failed to approve pin: ${error.message}`); }
  };

  const handleRejectSubmit = async (reasons) => {
    if (!rejectionTarget) return;
    const { id, createdBy, featureName } = rejectionTarget;
    try {
        await deleteDoc(doc(db, "pins", id));
        await sendNotification(createdBy, 'rejection', { pinName: featureName, reasons: reasons });
        setSubmissions(prev => prev.filter(s => s.id !== id));
        setRejectionTarget(null);
        toast.success("Pin rejected and user notified.");
    } catch(error) { toast.error(`Failed to reject pin: ${error.message}`); }
  };

  const handleBanUser = async () => {
      if (!rejectionTarget) return;
      const { createdBy, username } = rejectionTarget;
      try {
        await updateDoc(doc(db, "users", createdBy), { isBanned: true });
        await handleRejectSubmit(["User account has been banned."]);
        toast.error(`User ${username} has been banned.`, { duration: 5000 });
      } catch (error) { toast.error(`Failed to ban user: ${error.message}`); }
  };

  const handleApproveSuggestion = async (suggestion) => {
    if (!suggestion.pinData) return toast.error("Pin data is missing.");
    const batch = writeBatch(db);
    const pinRef = doc(db, "pins", suggestion.pinId);
    const suggestionRef = doc(pinRef, "nameSuggestions", suggestion.id);
    batch.update(pinRef, { previousNames: arrayUnion(suggestion.pinData.featureName), featureName: suggestion.suggestedName });
    batch.update(suggestionRef, { status: "approved" });
    try {
        await batch.commit();
        setNameSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
        toast.success("✅ Name change approved!");
    } catch (error) { toast.error("Failed to approve name change."); }
  };
  
  const handleRejectSuggestion = async (suggestion) => {
    const suggestionRef = doc(db, "pins", suggestion.pinId, "nameSuggestions", suggestion.id);
    try {
        await updateDoc(suggestionRef, { status: "rejected" });
        setNameSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
        toast.success("❌ Suggestion rejected.");
    } catch (error) { toast.error("Failed to reject suggestion."); }
  };

  // NEW: Handlers for Dethrone Challenges
  const handleApproveChallenge = async (challenge) => {
      const challengeRef = doc(db, `pins/${challenge.pinId}/dethroneChallenges/${challenge.id}`);
      try {
          // Set status to 'voting' and add a timestamp for when voting ends.
          const votingEnds = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 hours from now
          await updateDoc(challengeRef, { status: "voting", votingEnds: votingEnds });
          setDethroneChallenges(prev => prev.filter(c => c.id !== challenge.id));
          toast.success("Challenge approved and now open for voting!");
          // Optional: Send notification to challenger
          await sendNotification(challenge.challengerId, 'dethrone_approved', { pinName: challenge.pinData.featureName, pinId: challenge.pinId });
      } catch (error) {
          toast.error("Failed to approve challenge.");
      }
  };

  const handleRejectChallenge = async (challenge) => {
      const challengeRef = doc(db, `pins/${challenge.pinId}/dethroneChallenges/${challenge.id}`);
      try {
          await updateDoc(challengeRef, { status: "rejected" });
          setDethroneChallenges(prev => prev.filter(c => c.id !== challenge.id));
          toast.success("Challenge rejected.");
           // Optional: Send notification to challenger
          await sendNotification(challenge.challengerId, 'dethrone_rejected', { pinName: challenge.pinData.featureName, pinId: challenge.pinId });
      } catch (error) {
          toast.error("Failed to reject challenge.");
      }
  };


  const getYouTubeId = (url) => {
    if (typeof url !== 'string') return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {rejectionTarget && <RejectionModal submission={rejectionTarget} onCancel={() => setRejectionTarget(null)} onReject={handleRejectSubmit} onBan={handleBanUser} />}
      <h2 className="text-3xl font-bold mb-6 text-center">Admin Panel</h2>
      <div className="flex justify-center border-b mb-6">
          <button onClick={() => setActiveTab('pins')} className={`px-4 py-2 text-lg font-semibold ${activeTab === 'pins' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Pins ({submissions.length})</button>
          <button onClick={() => setActiveTab('names')} className={`px-4 py-2 text-lg font-semibold ${activeTab === 'names' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Names ({nameSuggestions.length})</button>
          {/* NEW: Dethrone Challenges Tab */}
          <button onClick={() => setActiveTab('dethrone')} className={`px-4 py-2 text-lg font-semibold ${activeTab === 'dethrone' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-500'}`}>Challenges ({dethroneChallenges.length})</button>
      </div>
      
      {loading && <p className="text-center text-gray-500 py-10">Loading...</p>}

      {/* --- Pin Submissions Tab --- */}
      {activeTab === 'pins' && !loading && (
        submissions.length === 0 
          ? <p className="text-center text-gray-500 py-10">No pending pin submissions.</p>
          : <div className="space-y-6">{submissions.map(submission => {
              const isEditing = editingSubmissionId === submission.id;
              const hasValidLocation = typeof submission.lat === 'number' && typeof submission.lng === 'number';
              return (
                <div key={submission.id} className="bg-white p-6 rounded-lg shadow-lg border grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <MediaRenderer url={submission.media && submission.media[0]} title={submission.featureName} />
                    <div className="mt-4">
                      {hasValidLocation ? <PinViewerMap position={[submission.lat, submission.lng]} icon={yellowIcon} /> : <div className="h-40 w-full rounded bg-gray-100 flex items-center justify-center text-gray-500">Location data missing</div>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {isEditing ? <input name="featureName" value={editedData.featureName} onChange={handleEditChange} className="text-2xl font-bold w-full border-b-2 p-1" /> : <h3 className="text-2xl font-bold">{submission.featureName}</h3> }
                    <p className="text-md text-gray-600">at <span className="font-semibold">{submission.resort}</span></p>
                    <div className="text-sm text-gray-500 border-t pt-3">
                      <p>Submitted by: <Link to={`/user/${submission.createdBy}`} className="font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"><FaUser size={12}/> {submission.username}</Link></p>
                      <p>On: {submission.createdAt?.toDate ? submission.createdAt.toDate().toLocaleString() : 'Date unavailable'}</p>
                    </div>
                    <div className="space-y-2 pt-2">
                        <h4 className="font-semibold">Description:</h4>
                        {isEditing ? <textarea name="description" value={editedData.description} onChange={handleEditChange} rows={3} className="w-full border p-2 rounded text-sm"/> : <p className="text-sm bg-gray-50 p-2 rounded">{submission.description || "N/A"}</p> }
                        <h4 className="font-semibold">Directions:</h4>
                        {isEditing ? <textarea name="directions" value={editedData.directions} onChange={handleEditChange} rows={3} className="w-full border p-2 rounded text-sm"/> : <p className="text-sm bg-gray-50 p-2 rounded">{submission.directions || "N/A"}</p>}
                    </div>
                    {submission.tags && submission.tags.length > 0 && (<div><h4 className="font-semibold">Tags:</h4><div className="flex flex-wrap gap-2 mt-1">{submission.tags.map(tag => <span key={tag} className="bg-gray-200 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{tag}</span>)}</div></div>)}
                    <div className="flex gap-3 mt-5 border-t pt-4">
                      <button onClick={() => handleApprovePin(submission)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-bold" disabled={isEditing}>Approve</button>
                      <button onClick={() => setRejectionTarget(submission)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold" disabled={isEditing}>Reject</button>
                      <div className="ml-auto flex gap-2">
                        {isEditing ? <button onClick={() => handleSaveEdit(submission.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"><FaSave/></button> : null}
                        <button onClick={() => handleEditToggle(submission)} className="bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded text-sm">{isEditing ? <FaTimes /> : <FaEdit />}</button>
                      </div>
                    </div>
                  </div>
                </div>
              )})}</div>
      )}
      
      {/* --- Name Suggestions Tab --- */}
      {activeTab === 'names' && !loading && (
          nameSuggestions.length === 0 
          ? <p className="text-center text-gray-500 py-10">No pending name suggestions.</p>
          : <div className="space-y-6">{nameSuggestions.map(suggestion => (
              suggestion.pinData && <div key={suggestion.id} className="bg-white p-6 rounded-lg shadow border">
                <div className="mb-4">
                  <p className="text-sm text-gray-500">Suggestion for Pin:</p>
                  <Link to={`/pin/${suggestion.pinId}`} className="text-2xl font-bold text-blue-600 hover:underline">{suggestion.pinData.featureName}</Link>
                  <p className="text-xs text-gray-400">at {suggestion.pinData.resort}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 items-center">
                    <div><p className="text-sm text-gray-500">Suggested New Name:</p><p className="text-xl font-semibold">{suggestion.suggestedName}</p></div>
                    <div className="text-right"><p className="text-sm text-gray-500">Submitted by {suggestion.username}</p><div className="flex items-center justify-end gap-2 mt-2 text-lg font-bold"><FaThumbsUp className="text-gray-400" /> {suggestion.upvotes}</div></div>
                </div>
                <div className="flex gap-3 mt-5 border-t pt-4">
                  <button onClick={() => handleApproveSuggestion(suggestion)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm">Approve Name</button>
                  <button onClick={() => handleRejectSuggestion(suggestion)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm">Reject</button>
                </div>
              </div>
            ))}</div>
      )}

      {/* --- NEW: Dethrone Challenges Tab --- */}
      {activeTab === 'dethrone' && !loading && (
        dethroneChallenges.length === 0
          ? <p className="text-center text-gray-500 py-10">No pending challenges.</p>
          : <div className="space-y-8">{dethroneChallenges.map(challenge => (
              challenge.pinData && <div key={challenge.id} className="bg-white p-6 rounded-xl shadow-lg border-2 border-yellow-400">
                <div className="text-center mb-4">
                  <h3 className="text-2xl font-bold text-gray-800">
                    <FaMedal className="inline mr-2 text-yellow-500" />
                    Video Challenge for: <Link to={`/pin/${challenge.pinId}`} className="text-blue-600 hover:underline">{challenge.pinData.featureName}</Link>
                  </h3>
                  <p className="text-sm text-gray-500">Challenger: <Link to={`/user/${challenge.challengerId}`} className="font-semibold text-blue-600">{challenge.challengerUsername}</Link></p>
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
                <div className="flex justify-center gap-4 mt-6 border-t pt-4">
                  <button onClick={() => handleApproveChallenge(challenge)} className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg">Approve Challenge</button>
                  <button onClick={() => handleRejectChallenge(challenge)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded-lg">Reject Challenge</button>
                </div>
              </div>
            ))}</div>
      )}
    </div>
  );
}
