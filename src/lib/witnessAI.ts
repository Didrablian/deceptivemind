// AI utility functions for generating witness game clues

const GEMINI_API_KEY = 'AIzaSyDn-7sMT7HIrbCdjaJVY9fOz2TknDHF4sE';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

interface ClueGenerationResult {
  locationClues: string[];
  weaponClues: string[];
}

interface DetectiveClues {
  playerId: string;
  locationClue: string;
  weaponClue: string;
}

export async function generateDetectiveClues(
  locationWords: string[],
  weaponWords: string[],
  correctLocation: string,
  correctWeapon: string,
  detectiveCount: number
): Promise<DetectiveClues[]> {
  const prompt = `You are generating single-word clues for a detective game. I need ${Math.min(detectiveCount, 2)} location clues and ${Math.min(detectiveCount, 2)} weapon clues.

LOCATION WORDS: ${locationWords.join(', ')}
CORRECT LOCATION: ${correctLocation}

WEAPON WORDS: ${weaponWords.join(', ')}
CORRECT WEAPON: ${correctWeapon}

Generate clues that are:
1. EXACTLY ONE WORD each
2. Vaguely describe "${correctLocation}" and "${correctWeapon}" 
3. Could apply to 2-3 other items in each list (overlapping but not obvious)
4. Subtle and not too obvious

Return ONLY a JSON object in this exact format:
{
  "locationClues": ["word1", "word2"],
  "weaponClues": ["word1", "word2"]
}`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error('No response from Gemini API');
    }

    // Extract JSON from the response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not extract JSON from Gemini response');
    }

    const clues: ClueGenerationResult = JSON.parse(jsonMatch[0]);
    
    if (!clues.locationClues || !clues.weaponClues) {
      throw new Error('Invalid clue format from Gemini API');
    }

    // Distribute clues among detectives (max 2 duplicates)
    return distributeClues(clues, detectiveCount);
  } catch (error) {
    console.error('Error generating AI clues:', error);
    
    // Fallback clues if AI fails
    const fallbackClues: ClueGenerationResult = {
      locationClues: ['indoor', 'outdoor'],
      weaponClues: ['sharp', 'blunt']
    };
    
    return distributeClues(fallbackClues, detectiveCount);
  }
}

function distributeClues(clues: ClueGenerationResult, detectiveCount: number): DetectiveClues[] {
  const result: DetectiveClues[] = [];
  
  for (let i = 0; i < detectiveCount; i++) {
    // For location clues: max 2 of same clue
    const locationClueIndex = Math.floor(i / 2) % clues.locationClues.length;
    // For weapon clues: max 2 of same clue  
    const weaponClueIndex = Math.floor(i / 2) % clues.weaponClues.length;
    
    result.push({
      playerId: `detective_${i}`, // Will be replaced with actual player ID
      locationClue: clues.locationClues[locationClueIndex] || clues.locationClues[0],
      weaponClue: clues.weaponClues[weaponClueIndex] || clues.weaponClues[0]
    });
  }
  
  return result;
} 