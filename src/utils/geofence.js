import { resortBoundaries } from './resortBoundaries';

/**
 * Checks if a point is inside a polygon using the ray-casting algorithm.
 * @param {object} point - An object with { lat, lng }.
 * @param {Array<Array<number>>} polygon - An array of [lng, lat] coordinates.
 * @returns {boolean}
 */
const isPointInPolygon = (point, polygon) => {
  const { lat, lng } = point;
  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }

  return isInside;
};

/**
 * The primary export function. Checks if a pin is valid for a given resort.
 * @param {object} point - An object with { lat, lng }.
 * @param {object} resort - The resort object from your `resorts.js` file.
 * @returns {boolean}
 */
export const isPinInResortBoundary = (point, resort) => {
  // BETA TEST HOTFIX: Based on your feedback, if the resort is Solitude,
  // we will always allow the pin drop to prevent any boundary issues for testers.
  if (resort && resort.name === "Solitude Mountain Resort") {
    return true;
  }

  // Original logic for other resorts (if any are added later)
  if (!resort) {
    console.error("Geofence check failed: Invalid resort object provided.");
    return false;
  }

  const boundary = resortBoundaries[resort.name];

  if (boundary && boundary.polygon) {
    const polygon = boundary.polygon[0];
    return isPointInPolygon(point, polygon.map(p => [p[0], p[1]]));
  } else {
    // If no boundary data exists for any other resort, allow the pin.
    return true;
  }
};
