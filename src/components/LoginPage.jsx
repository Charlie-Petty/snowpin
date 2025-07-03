// src/components/LoginPage.jsx
import React, { useState } from "react";
import { auth, googleProvider, signInWithPopup } from "../firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { FaGoogle } from 'react-icons/fa';

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/"); // Navigate to home, App.jsx will handle redirects
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/"); // Navigate to home, App.jsx will handle redirects
    } catch (error) {
      toast.error("Google Sign-In Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) return toast.error("Please enter your email in the field above to reset your password.");
    const toastId = toast.loading("Sending reset link...");
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(`Password reset email sent to ${email}`, { id: toastId });
    } catch (err) {
      toast.error(err.message, { id: toastId });
    }
  };

  return (
    <div className="max-w-md mx-auto p-8 mt-10 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-2 text-center text-gray-900">Welcome Back</h2>
      <p className="text-center text-gray-500 mb-6 text-sm">Log in to find your next line.</p>
      
      <button onClick={handleGoogleSignIn} disabled={loading} className="w-full flex justify-center items-center gap-2 bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 font-semibold mb-6">
        <FaGoogle /> Sign in with Google
      </button>

      <div className="relative flex items-center mb-6">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink mx-4 text-gray-400 text-sm">OR</span>
          <div className="flex-grow border-t border-gray-300"></div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium sr-only">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" className="w-full border px-3 py-2.5 rounded-lg" required />
        </div>
        <div>
          <label className="block text-sm font-medium sr-only">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full border px-3 py-2.5 rounded-lg" required />
        </div>
        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400">
            {loading ? 'Logging In...' : 'Log In'}
        </button>
      </form>

      <div className="text-sm text-center mt-6 space-y-2">
        <button type="button" onClick={handlePasswordReset} className="text-blue-600 hover:underline">
          Forgot Password?
        </button>
        <p>
          New to SnowPin?{" "}
          <Link to="/signup" className="font-semibold text-blue-600 hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}