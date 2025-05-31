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

export async function generateBotChatMessage(
  gameState: any,
  botPlayer: any,
  phase: string,
  recentMessages: any[] = []
): Promise<string> {
  // Enhanced fallback messages based on role and phase
  const getFallbackMessage = (role: string, phase: string, hasContext: boolean) => {
    const messages = {
      detective: [
        "Let me check my clues.",
        "I have some hints.",
        "This looks suspicious.",
        "My evidence suggests...",
        "I'm analyzing this.",
        ...(hasContext ? ["Good point.", "I agree.", "Interesting."] : [])
      ],
      witness: [
        "I have a feeling.",
        "Something's familiar.",
        "Trust your gut.",
        "Think carefully.",
        "Good direction.",
        ...(hasContext ? ["Makes sense.", "I think so too.", "Yes, maybe."] : [])
      ],
      suspect: [
        "Not sure about that.",
        "Maybe we're wrong?",
        "Different angle?",
        "I disagree.",
        "Seems off.",
        ...(hasContext ? ["Doubtful.", "Not convinced.", "Hmm, no."] : [])
      ],
      judge: [
        "Listening carefully.",
        "Interesting points.",
        "Tough decision.",
        "Weighing options.",
        "Taking notes.",
        ...(hasContext ? ["Good input.", "Noted.", "Continue."] : [])
      ]
    };
    
    const roleMessages = messages[role as keyof typeof messages] || messages.detective;
    return roleMessages[Math.floor(Math.random() * roleMessages.length)];
  };

  // Return fallback immediately - no AI calls to prevent 503 errors
  return getFallbackMessage(botPlayer.role || 'detective', phase, recentMessages.length > 0);
}

export async function generateBotDecision(
  gameState: any,
  botPlayer: any,
  decisionType: 'word' | 'suspect',
  options: string[]
): Promise<string> {
  if (botPlayer.role !== 'judge') return options[0];

  // Simple logic without AI calls to prevent errors
  if (decisionType === 'word') {
    // For words, choose correct answer most of the time
    const correctAnswer = gameState.stage === 'location' ? gameState.correctLocation : gameState.correctWeapon;
    if (options.includes(correctAnswer) && Math.random() < 0.8) {
      return correctAnswer;
    }
  }
  
  // Random selection as fallback
  return options[Math.floor(Math.random() * options.length)];
} 