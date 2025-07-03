// src/components/SignupPage.jsx
import React, { useState } from "react";
import { auth, db, googleProvider, signInWithPopup } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FaGoogle } from 'react-icons/fa';

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create a basic user document in Firestore, marking profile as incomplete
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        uid: user.uid,
        createdAt: new Date(),
        profileComplete: false // NEW: This flag is crucial for the onboarding flow
      });
      
      toast.success("Account created! Let's set up your profile.");
      navigate("/create-profile");

    } catch (err) {
      toast.error(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      // If the user doesn't exist in Firestore, create a basic document
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: user.email,
          uid: user.uid,
          name: user.displayName,
          profilePic: user.photoURL,
          createdAt: new Date(),
          profileComplete: false // Mark as incomplete to force profile creation
        });
      }
      
      toast.success(`Welcome, ${user.displayName}!`);
      // The logic in App.jsx will handle redirecting to /create-profile if needed
      navigate("/"); 

    } catch (error) {
      toast.error("Google Sign-In Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-8 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-2 text-center text-gray-900">Create an Account</h2>
      <p className="text-center text-gray-500 mb-6 text-sm">Join the SnowPin community to discover and share the best lines.</p>
      
      <button onClick={handleGoogleSignIn} disabled={loading} className="w-full flex justify-center items-center gap-2 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 font-semibold mb-6">
        <FaGoogle /> Sign up with Google
      </button>

      <div className="relative flex items-center mb-6">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink mx-4 text-gray-400 text-sm">OR</span>
          <div className="flex-grow border-t border-gray-300"></div>
      </div>
      
      <form onSubmit={handleSignup} className="space-y-4">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" className="w-full p-2.5 border rounded-lg" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ characters)" className="w-full p-2.5 border rounded-lg" required />
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400">
            {loading ? 'Creating Account...' : 'Create Account with Email'}
        </button>
      </form>
      <p className="text-center text-xs text-gray-500 mt-4">
          By signing up, you agree to our Terms of Service (pending).
      </p>
      <p className="text-center text-sm text-gray-600 mt-6">
        Already have an account? <Link to="/login" className="font-semibold text-blue-600 hover:underline">Log In</Link>
      </p>
    </div>
  );
}