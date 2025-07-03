import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { FaExpand } from 'react-icons/fa';

// This component now ensures the map view stays in sync with the marker's position
function MapViewUpdater({ position }) {
    const map = useMap();
    useEffect(() => {
        map.setView(position, map.getZoom());
    }, [position, map]);
    return null;
}

export default function InteractivePinMap({ position, onPositionChange }) {
    const markerRef = useRef(null);
    const mapContainerRef = useRef(null); // Ref for the full-screen element

    const eventHandlers = useMemo(() => ({
        dragend() {
            const marker = markerRef.current;
            if (marker != null) {
                // Tell the parent component about the new, dragged position
                onPositionChange(marker.getLatLng());
            }
        },
    }), [onPositionChange]);

    const handleFullScreen = () => {
        const elem = mapContainerRef.current;
        if (elem && !document.fullscreenElement) {
            elem.requestFullscreen().catch(err => {
                alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        }
    };

    // The Done button will only be visible when in full-screen mode via CSS
    const handleDone = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    };
    
    return (
        // The ref is attached to this container for the Fullscreen API
        <div ref={mapContainerRef} className="relative w-full h-64 rounded-lg bg-white leaflet-container-fullscreen">
            <MapContainer
                center={position}
                zoom={17}
                scrollWheelZoom={true}
                className="w-full h-full"
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <TileLayer url="https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png" />
                <Marker
                    draggable={true}
                    eventHandlers={eventHandlers}
                    position={position}
                    ref={markerRef}
                />
                <MapViewUpdater position={position} />
            </MapContainer>
            
            {/* This button enters fullscreen */}
            <button
                type="button"
                onClick={handleFullScreen}
                className="absolute top-2 right-2 z-[1000] bg-white p-2 rounded-md shadow-lg text-gray-700 hover:bg-gray-100 fullscreen-enter-btn"
                aria-label="Enter Fullscreen"
            >
                <FaExpand />
            </button>
            
            {/* This button is only visible IN fullscreen to exit */}
            <button
                type="button"
                onClick={handleDone}
                className="absolute top-4 right-4 z-[1000] bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-lg font-semibold fullscreen-done-btn"
                aria-label="Done"
            >
                Done
            </button>
        </div>
    );
}