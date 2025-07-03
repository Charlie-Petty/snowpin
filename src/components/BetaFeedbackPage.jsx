// src/components/BetaFeedbackPage.jsx
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  runTransaction,
  doc,
  increment
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { FaThumbsUp, FaThumbsDown } from 'react-icons/fa';

// -- FAQ Section Component --
const FaqSection = () => (
    <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-gray-900">Welcome, Beta Testers!</h1>
        <p className="text-center text-gray-600 mt-2">Thank you for helping shape the future of SnowPin. Your feedback is crucial.</p>
        <div className="mt-8 space-y-6 text-gray-700">
            <div>
                <h2 className="text-xl font-bold mb-2">What is SnowPin?</h2>
                <p>SnowPin is a community-driven map for expert skiers and riders to discover, share, and conquer the best unmarked lines, features, and hits at their favorite resorts.</p>
            </div>
            <div>
                <h2 className="text-xl font-bold mb-2">How do I use it?</h2>
                <ul className="list-disc list-inside space-y-1">
                    <li>Use the <span className="font-semibold">Map Page</span> to explore pins at different resorts.</li>
                    <li>Click a pin to see its details, community ratings, and video clips.</li>
                    <li>Found a new spot? Go to the map, click "Add a Pin", and drop it on the location.</li>
                    <li>Hit a feature? Leave a <span className="font-semibold">review</span> to rate its difficulty and conditions.</li>
                    <li>Think you hit it better? Submit a <span className="font-semibold">challenge</span> video to become the new "King of the Hill" for that pin!</li>
                </ul>
            </div>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                <h2 className="text-xl font-bold mb-2 text-yellow-800">Your Mission, Should You Choose to Accept It...</h2>
                <p className="text-yellow-900">Please, <span className="font-bold">try to break everything.</span> Seriously. Click every button, fill out every form, and explore every corner of the site. If something looks weird, doesn't work, or causes an error, we need to know!</p>
                <p className="mt-2 text-yellow-900">Use the open forum below to submit bugs, errors, suggestions, or any thoughts you have. There are no bad ideas. Let us know what you love, what you hate, and what you wish the app could do.</p>
            </div>
        </div>
    </div>
);

// -- Feedback Item Component --
const FeedbackItem = ({ item, user, handleVote }) => {
    const userVote = item.userVotes?.[user?.uid];
    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <p className="text-gray-800">{item.text}</p>
                <p className="text-xs text-gray-500 mt-2">
                    Submitted by <span className="font-semibold">{item.username || 'Anonymous'}</span> on {item.createdAt?.toDate().toLocaleDateString()}
                </p>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
                <button
                    onClick={() => handleVote(item.id, 'likes')}
                    disabled={!user}
                    className="flex items-center gap-2 text-gray-600 hover:text-green-600 disabled:opacity-50"
                >
                    <FaThumbsUp className={userVote === 'likes' ? 'text-green-500' : ''} />
                    <span className="font-semibold">{item.likes || 0}</span>
                </button>
                <button
                    onClick={() => handleVote(item.id, 'dislikes')}
                    disabled={!user}
                    className="flex items-center gap-2 text-gray-600 hover:text-red-600 disabled:opacity-50"
                >
                    <FaThumbsDown className={userVote === 'dislikes' ? 'text-red-500' : ''} />
                    <span className="font-semibold">{item.dislikes || 0}</span>
                </button>
            </div>
        </div>
    );
};

// -- Main Beta Feedback Page Component --
export default function BetaFeedbackPage() {
    const { user } = useOutletContext();
    const [feedback, setFeedback] = useState([]);
    const [newFeedback, setNewFeedback] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const feedbackRef = collection(db, 'betaFeedback');
        const q = query(feedbackRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const feedbackList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFeedback(feedbackList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching feedback:", error);
            toast.error("Could not load feedback from the server.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user) {
            toast.error("You must be logged in to submit feedback.");
            return;
        }
        if (newFeedback.trim().length < 10) {
            toast.error("Feedback must be at least 10 characters long.");
            return;
        }
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'betaFeedback'), {
                text: newFeedback,
                userId: user.uid,
                username: user.username,
                createdAt: serverTimestamp(),
                likes: 0,
                dislikes: 0,
                userVotes: {} // Map to store user votes
            });
            setNewFeedback('');
            toast.success("Feedback submitted. Thank you!");
        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast.error("There was an issue submitting your feedback.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleVote = async (feedbackId, voteType) => {
        if (!user) return;

        const feedbackRef = doc(db, 'betaFeedback', feedbackId);
        
        try {
            await runTransaction(db, async (transaction) => {
                const feedbackDoc = await transaction.get(feedbackRef);
                if (!feedbackDoc.exists()) throw "Document does not exist!";

                const data = feedbackDoc.data();
                const userVotes = data.userVotes || {};
                const existingVote = userVotes[user.uid];

                let newLikes = data.likes || 0;
                let newDislikes = data.dislikes || 0;

                // If user is re-voting for the same thing, undo the vote.
                if (existingVote === voteType) {
                    if (voteType === 'likes') newLikes--;
                    else newDislikes--;
                    delete userVotes[user.uid];
                } else {
                    // If user is switching vote, undo the previous one.
                    if (existingVote === 'likes') newLikes--;
                    if (existingVote === 'dislikes') newDislikes--;
                    // Apply the new vote.
                    if (voteType === 'likes') newLikes++;
                    else newDislikes++;
                    userVotes[user.uid] = voteType;
                }

                transaction.update(feedbackRef, {
                    likes: newLikes,
                    dislikes: newDislikes,
                    userVotes: userVotes
                });
            });
        } catch (error) {
            console.error("Transaction failed: ", error);
            toast.error("Couldn't process your vote.");
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-0">
            <FaqSection />
            <div className="bg-gray-50 p-6 sm:p-8 rounded-xl shadow-inner">
                <h2 className="text-2xl font-bold text-center mb-6">Open Feedback Forum</h2>
                {user && (
                    <form onSubmit={handleSubmit} className="mb-8">
                        <textarea
                            value={newFeedback}
                            onChange={(e) => setNewFeedback(e.target.value)}
                            className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500"
                            rows="4"
                            placeholder="Found a bug? Have a killer idea? Let it all out..."
                        />
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full mt-3 bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                        >
                            {submitting ? 'Submitting...' : 'Submit Feedback'}
                        </button>
                    </form>
                )}

                <div className="space-y-4">
                    {loading ? (
                        <p className="text-center text-gray-500">Loading feedback...</p>
                    ) : feedback.length > 0 ? (
                        feedback.map(item => (
                            <FeedbackItem key={item.id} item={item} user={user} handleVote={handleVote} />
                        ))
                    ) : (
                        <p className="text-center text-gray-500 py-6">No feedback yet. Be the first!</p>
                    )}
                </div>
            </div>
        </div>
    );
}