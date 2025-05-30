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
        "Based on my analysis, I think we should consider...",
        "My clues suggest we look at these options.",
        "I'm getting some hints about this.",
        "Let me share what I'm thinking.",
        "The evidence points to something specific.",
        ...(hasContext ? ["I agree with that point.", "That's an interesting observation.", "Good thinking there."] : [])
      ],
      witness: [
        "I have a feeling about this one.",
        "Something seems familiar here.",
        "Maybe we should focus on that option.",
        "I think the team is on the right track.",
        "Trust your instincts on this.",
        ...(hasContext ? ["That makes sense to me.", "I had a similar thought.", "You might be onto something."] : [])
      ],
      suspect: [
        "That's an interesting theory.",
        "I'm not so sure about that choice.",
        "Maybe we're overthinking this.",
        "What if we consider other options?",
        "I have a different perspective.",
        ...(hasContext ? ["I disagree with that.", "That seems off to me.", "Are we sure about that?"] : [])
      ],
      judge: [
        "I'm listening to all viewpoints.",
        "Interesting discussion so far.",
        "I need to weigh these options carefully.",
        "The decision is challenging.",
        "Let me consider all angles.",
        ...(hasContext ? ["Valid points being made.", "I'm taking note of that.", "Keep the discussion going."] : [])
      ]
    };
    
    const roleMessages = messages[role as keyof typeof messages] || messages.detective;
    return roleMessages[Math.floor(Math.random() * roleMessages.length)];
  };

  // Try AI generation first, with immediate fallback on any error
  try {
    // Build chat context
    let chatContext = "";
    if (recentMessages.length > 0) {
      chatContext = "\n\nRECENT CHAT MESSAGES:\n" + 
        recentMessages.map(msg => `${msg.playerName}: "${msg.text}"`).join('\n') +
        "\n\nRespond to the conversation naturally while staying in character.";
    }

    const prompt = `You are ${botPlayer.name}, a bot player in a social deduction game called Witness. 

GAME CONTEXT:
- Your role: ${botPlayer.role}
- Current phase: ${phase}
- Location words: ${gameState.locationWords?.join(', ')}
- Weapon words: ${gameState.weaponWords?.join(', ')}

ROLE BEHAVIORS:
- Detective: Help team find correct answers using your clues (Location: "${botPlayer.locationClue}", Weapon: "${botPlayer.weaponClue}"). Share insights and analysis.
- Witness: Subtly guide team without being obvious you know the answers. Be helpful but not too direct.
- Suspect: Mislead the team while trying to identify the witness. Create doubt and confusion.
- Judge: Stay neutral and control game flow. Ask questions and guide discussion.

${chatContext}

Generate a natural, conversational message (1-2 sentences) that:
1. Fits your role and the current phase
2. ${recentMessages.length > 0 ? 'Responds appropriately to the recent conversation' : 'Starts or continues the discussion'}
3. Feels natural and human-like
4. Advances the game discussion

Return only the message text, no quotes or formatting.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 100,
          topP: 0.9
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    const generatedMessage = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (generatedMessage && generatedMessage.length > 5 && generatedMessage.length < 300) {
      // Clean up the message
      return generatedMessage.replace(/^["']|["']$/g, '').trim();
    } else {
      throw new Error('Invalid message length or content');
    }
  } catch (error) {
    console.error('AI message generation failed, using fallback:', error);
    return getFallbackMessage(botPlayer.role || 'detective', phase, recentMessages.length > 0);
  }
}

export async function generateBotDecision(
  gameState: any,
  botPlayer: any,
  decisionType: 'word' | 'suspect',
  options: string[]
): Promise<string> {
  if (botPlayer.role !== 'judge') return options[0];

  const prompt = `You are ${botPlayer.name}, the Judge in a Witness game. You need to make a ${decisionType} selection.

GAME STATE:
- Current options: ${options.join(', ')}
- Phase: ${gameState.phase}
${decisionType === 'word' ? `
- Correct answer: ${gameState.stage === 'location' ? gameState.correctLocation : gameState.correctWeapon}
- You know the correct answer but must appear to make logical decisions based on discussion.
` : `
- Players: ${gameState.players.filter((p: any) => p.role !== 'judge').map((p: any) => p.name).join(', ')}
- Select the player you think is most suspicious based on the discussion.
`}

Make a strategic decision. If selecting a word, pick the correct one most of the time (80% chance) but occasionally pick wrong to seem more human. If selecting a suspect, analyze who seems most suspicious.

Return only the option you choose, exactly as written in the options list.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    const decision = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    // Ensure the decision is in the options list
    const choice = options.find(opt => decision?.includes(opt)) || options[0];
    return choice;
  } catch (error) {
    console.error('Error generating bot decision:', error);
    return options[Math.floor(Math.random() * options.length)];
  }
} 