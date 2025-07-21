// src/App.jsx - DEFINITIVE VERSION

import React, { useEffect, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { auth, onAuthStateChanged, signOut, getUserDetails } from "./firebase";
import { Toaster, toast } from "react-hot-toast";
import GlobalSearchBar from './components/GlobalSearchBar';
import { FaBars, FaTimes } from 'react-icons/fa';

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const data = await getUserDetails(firebaseUser.uid);
        setUser({ ...firebaseUser, ...data });
        setIsAdmin(data?.admin || false);
        if (data && data.profileComplete === false && location.pathname !== "/create-profile") {
            toast("Please complete your profile to continue.", { icon: "👋" });
            navigate("/create-profile");
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, [navigate, location.pathname]);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setIsAdmin(false);
    navigate("/");
  };
  
  const goToProfile = () => {
    if(isAuthLoading) return;
    navigate(user ? "/profile" : "/login");
  };

  const handleHomeMountainClick = () => {
    if(isAuthLoading) return;
    if (user?.homeMountain && user.homeMountain !== 'Not Set') {
      navigate(`/map?resort=${encodeURIComponent(user.homeMountain)}`);
    } else if (user) {
        toast.error("Please set your Home Mountain in your profile first!");
        navigate('/profile');
    } else {
        toast.error("You need to log in to see your home mountain!");
        navigate('/login');
    }
  };

  return (
    <>
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} />
      <div className="min-h-screen flex flex-col bg-sky-50 text-gray-800">
        <header className="bg-blue-600 text-white flex items-center justify-between px-4 sm:px-6 py-3 shadow-md sticky top-0 z-40">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate("/")}>
            <img src="/logo.png" alt="SnowPin Logo" className="w-10 h-10" />
            <h1 className="text-2xl font-bold hidden md:block">SnowPin</h1>
          </div>
          <div className="flex-1 px-4 lg:px-16">
            <GlobalSearchBar />
          </div>
          <nav className="hidden lg:flex items-center gap-4 text-sm font-medium">
            <button onClick={handleHomeMountainClick} className="hover:underline">Home Mtn</button>
            <button onClick={goToProfile} className="hover:underline">Profile</button>
            {user ? (
              <button onClick={handleLogout} className="hover:underline">Log Out</button>
            ) : (
              <Link to="/login" className="hover:underline">Log In</Link>
            )}
            {isAdmin && (<Link to="/admin" className="hover:underline">Admin</Link>)}
          </nav>
          <div className="lg:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-2xl p-2">
              {isMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
          </div>
        </header>
        
        {isMenuOpen && (
          <div className="lg:hidden bg-blue-700 text-white absolute top-[76px] left-0 w-full z-30 shadow-lg">
            <nav className="flex flex-col items-center text-lg">
              <button onClick={handleHomeMountainClick} className="w-full py-4 hover:bg-blue-600">Home Mountain</button>
              <button onClick={goToProfile} className="w-full py-4 hover:bg-blue-600">Profile</button>
              {isAdmin && (<Link to="/admin" className="w-full text-center py-4 hover:bg-blue-600">Admin Panel</Link>)}
              {user ? (
                <button onClick={handleLogout} className="w-full py-4 hover:bg-blue-600">Log Out</button>
              ) : (
                <Link to="/login" className="w-full text-center py-4 hover:bg-blue-600">Log In</Link>
              )}
            </nav>
          </div>
        )}

        <main className="flex-1">
          {isAuthLoading ? (
            <div className="w-full h-full flex items-center justify-center">
                <p>Finding the pow...</p> 
            </div>
          ) : (
            <Outlet context={{ user, isAdmin, isLoadingUser: isAuthLoading }} />
          )}
        </main>
        
        <footer className="bg-gray-100 text-center py-2 text-xs text-gray-500">
          © {new Date().getFullYear()} SnowPin. All rights reserved.
        </footer>
      </div>
    </>
  );
}