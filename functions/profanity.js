// functions/profanity.js

// Add any words you want to block to this array.
const BANNED_WORDS = [
    'nigger',
    'faggot',
    'nigga',
    'fag',
    'fuck',
    'dick',
    'nicotine',
    
    // Add more words here, all lowercase
  ];
  
  // Create a regular expression from the banned words list.
  // The 'i' flag makes the search case-insensitive.
  // The '\\b' ensures it matches whole words only.
  const profanityRegex = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'i');
  
  /**
   * Checks if a given text contains any profanity.
   * @param {string} text The text to check.
   * @returns {boolean} True if profanity is found, false otherwise.
   */
  const containsProfanity = (text) => {
    if (!text) return false;
    return profanityRegex.test(text);
  };
  
  module.exports = { containsProfanity };