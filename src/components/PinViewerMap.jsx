import React, { useRef } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { FaExpand } from 'react-icons/fa';
import 'leaflet/dist/leaflet.css';

export default function PinViewerMap({ position, icon }) {
    const mapContainerRef = useRef(null);

    if (!position || typeof position[0] !== 'number' || typeof position[1] !== 'number') {
        return <div className="h-40 w-full rounded bg-gray-100 flex items-center justify-center text-gray-500">Location data invalid or missing</div>;
    }

    const handleFullScreen = () => {
        const elem = mapContainerRef.current;
        if (elem && !document.fullscreenElement) {
            elem.requestFullscreen().catch(err => {
                alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        }
    };

    const handleDone = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    };
    
    return (
        <div ref={mapContainerRef} className="relative w-full h-40 rounded-lg bg-white leaflet-container-fullscreen shadow">
            <MapContainer
                center={position}
                zoom={16}
                scrollWheelZoom={true}
                dragging={true}
                className="w-full h-full"
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <TileLayer url="https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png" attribution="© OpenSnowMap.org" />
                <Marker
                    draggable={false}
                    position={position}
                    icon={icon}
                />
            </MapContainer>
            
            <button
                type="button"
                onClick={handleFullScreen}
                className="absolute top-2 right-2 z-[1000] bg-white p-2 rounded-md shadow-lg text-gray-700 hover:bg-gray-100 fullscreen-enter-btn"
                aria-label="Enter Fullscreen"
            >
                <FaExpand />
            </button>
            
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
