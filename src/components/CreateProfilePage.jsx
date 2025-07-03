import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import toast from 'react-hot-toast';
import { resorts } from '../utils/resorts';

export default function CreateProfilePage() {
    const { user } = useOutletContext();
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [name, setName] = useState(user?.displayName || '');
    const [homeMountain, setHomeMountain] = useState('Not Set');
    const [type, setType] = useState('Skier');
    const [loading, setLoading] = useState(false);
    const [usernameAvailable, setUsernameAvailable] = useState(true);

    // Debounce timer for username checking
    let debounceTimeout;

    // Async function to check if a username is already taken in Firestore
    const checkUsername = async (newUsername) => {
        if (newUsername.length < 3) {
            setUsernameAvailable(true); // Don't show an error for short usernames yet
            return;
        }
        const q = query(collection(db, 'users'), where('username', '==', newUsername));
        const querySnapshot = await getDocs(q);
        setUsernameAvailable(querySnapshot.empty);
    };

    const handleUsernameChange = (e) => {
        const newUsername = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); // Sanitize username
        setUsername(newUsername);
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            checkUsername(newUsername);
        }, 500); // 500ms debounce
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user) return toast.error('You must be signed in.');
        if (username.length < 3) return toast.error('Username must be at least 3 characters.');
        if (!usernameAvailable) return toast.error('That username is already taken.');
        if (homeMountain === 'Not Set') return toast.error('Please select your home mountain.');

        setLoading(true);
        const toastId = toast.loading('Creating your profile...');

        try {
            const userRef = doc(db, 'users', user.uid);
            
            const profileData = {
                username: username,
                name: name,
                homeMountain: homeMountain,
                type: type,
                profileComplete: true, // Mark profile as complete
                email: user.email, // Ensure email is saved
                uid: user.uid, // Ensure uid is saved
                createdAt: new Date(), // Set creation date
            };

            // CRITICAL FIX: Use setDoc with { merge: true }
            // This will CREATE the document if it doesn't exist, or UPDATE it if it does.
            // This resolves the "No document to update" error.
            await setDoc(userRef, profileData, { merge: true });
            
            // Also update the auth profile for display name consistency
            await updateProfile(auth.currentUser, {
                displayName: name,
            });

            toast.success('Profile created! Welcome to SnowPin!', { id: toastId });
            navigate('/profile'); // Redirect to the main profile page

        } catch (error) {
            toast.error(`Error: ${error.message}`, { id: toastId });
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto mt-10 p-8 bg-white rounded-xl shadow-lg">
            <h1 className="text-3xl font-extrabold text-center text-gray-900">Complete Your Profile</h1>
            <p className="text-center text-gray-600 mt-2 mb-8">Welcome to the community! Let's get you set up.</p>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700">Full Name</label>
                    <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Appleseed" className="w-full mt-1 p-2 border rounded-md" required />
                </div>
                <div>
                    <label htmlFor="username" className="block text-sm font-semibold text-gray-700">Username</label>
                    <input id="username" type="text" value={username} onChange={handleUsernameChange} placeholder="johnnyrips" className="w-full mt-1 p-2 border rounded-md" required />
                    {!usernameAvailable && <p className="text-red-500 text-xs mt-1">Username is already taken.</p>}
                     <p className="text-gray-500 text-xs mt-1">Usernames can only contain lowercase letters, numbers, and underscores.</p>
                </div>
                 <div>
                    <label htmlFor="homeMountain" className="block text-sm font-semibold text-gray-700">Home Mountain</label>
                    <select id="homeMountain" value={homeMountain} onChange={(e) => setHomeMountain(e.target.value)} className="w-full mt-1 p-2 border rounded-md">
                        <option value="Not Set" disabled>-- Select a Resort --</option>
                        {Object.keys(resorts).map(state => (
                            <optgroup label={state} key={state}>
                                {resorts[state].sort((a,b) => a.name.localeCompare(b.name)).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                            </optgroup>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="type" className="block text-sm font-semibold text-gray-700">Primary Discipline</label>
                    <select id="type" value={type} onChange={(e) => setType(e.target.value)} className="w-full mt-1 p-2 border rounded-md">
                        <option value="Skier">Skier</option>
                        <option value="Snowboarder">Snowboarder</option>
                    </select>
                </div>
                <button type="submit" disabled={loading || !usernameAvailable} className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400">
                    {loading ? 'Saving...' : 'Complete Profile'}
                </button>
            </form>
        </div>
    );
}
