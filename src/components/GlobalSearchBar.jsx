import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { resorts as allResorts } from '../utils/resorts';
import { FaSearch, FaMountain, FaMapMarkerAlt, FaUser } from 'react-icons/fa';

// Custom hook to debounce user input, preventing excessive queries
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

export default function GlobalSearchBar() {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState({ resorts: [], pins: [], users: [] });
    const [loading, setLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const searchRef = useRef(null);

    // Effect to handle closing the dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [searchRef]);

    // Effect to perform the search when the debounced search term changes
    useEffect(() => {
        const performSearch = async () => {
            if (debouncedSearchTerm.length < 2) {
                setResults({ resorts: [], pins: [], users: [] });
                return;
            }

            setLoading(true);

            try {
                const lowerCaseTerm = debouncedSearchTerm.toLowerCase();

                const resortResults = Object.values(allResorts)
                    .flat()
                    .filter(resort => resort.name.toLowerCase().includes(lowerCaseTerm))
                    .slice(0, 5);

                const pinsQuery = query(
                    collection(db, 'pins'),
                    where('approved', '==', true),
                    where('featureName_lowercase', '>=', lowerCaseTerm),
                    where('featureName_lowercase', '<=', lowerCaseTerm + '\uf8ff'),
                    limit(5)
                );
                const pinsSnapshot = await getDocs(pinsQuery);
                const pinResults = pinsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const usersQuery = query(
                    collection(db, 'users'),
                    where('username', '>=', lowerCaseTerm),
                    where('username', '<=', lowerCaseTerm + '\uf8ff'),
                    limit(5)
                );
                const usersSnapshot = await getDocs(usersQuery);
                const userResults = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                setResults({
                    resorts: resortResults,
                    pins: pinResults,
                    users: userResults
                });

            } catch (error) {
                console.error("Search failed:", error);
            } finally {
                setLoading(false);
            }
        };

        performSearch();

    }, [debouncedSearchTerm]);

    const handleResultClick = () => {
        setSearchTerm('');
        setIsFocused(false);
    };

    const showDropdown = isFocused && searchTerm.length >= 2;
    const hasResults = results.resorts.length > 0 || results.pins.length > 0 || results.users.length > 0;

    return (
        <div className="relative w-full max-w-lg mx-auto" ref={searchRef}>
            <div className="relative">
                <FaSearch className="absolute top-1/2 left-4 transform -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search resorts, pins, or users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    // THE FIX: Ensured text color is dark and visible
                    className="w-full pl-12 pr-4 py-2 border-2 border-transparent bg-gray-100 text-gray-900 rounded-full focus:bg-white focus:border-blue-500 focus:outline-none transition"
                />
            </div>

            {showDropdown && (
                <div className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-lg z-50 overflow-hidden border">
                    {loading ? (
                        <div className="p-4 text-center text-gray-500">Searching...</div>
                    ) : hasResults ? (
                        <div className="max-h-96 overflow-y-auto">
                            {results.resorts.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold uppercase text-gray-500 p-3 bg-gray-50 border-b">Resorts</h3>
                                    <ul>
                                        {results.resorts.map(resort => (
                                            <li key={resort.name}>
                                                <Link to={`/map?resort=${encodeURIComponent(resort.name)}`} onClick={handleResultClick} className="flex items-center gap-3 p-3 hover:bg-blue-50 transition">
                                                    <FaMountain className="text-gray-400" />
                                                    <span>{resort.name}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {results.pins.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold uppercase text-gray-500 p-3 bg-gray-50 border-b border-t">Pins</h3>
                                    <ul>
                                        {results.pins.map(pin => (
                                            <li key={pin.id}>
                                                <Link to={`/pin/${pin.id}`} onClick={handleResultClick} className="flex items-center gap-3 p-3 hover:bg-blue-50 transition">
                                                    <FaMapMarkerAlt className="text-gray-400" />
                                                    <div>
                                                        <p>{pin.featureName}</p>
                                                        <p className="text-xs text-gray-500">{pin.resort}</p>
                                                    </div>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {results.users.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold uppercase text-gray-500 p-3 bg-gray-50 border-b border-t">Users</h3>
                                    <ul>
                                        {results.users.map(user => (
                                            <li key={user.id}>
                                                <Link to={`/user/${user.id}`} onClick={handleResultClick} className="flex items-center gap-3 p-3 hover:bg-blue-50 transition">
                                                    <img src={user.profilePic || `https://ui-avatars.com/api/?name=${user.username}&background=random`} alt={user.username} className="w-8 h-8 rounded-full object-cover" />
                                                    <span>{user.username}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-gray-500">No results found for "{debouncedSearchTerm}"</div>
                    )}
                </div>
            )}
        </div>
    );
}
