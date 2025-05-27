import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Upload a base64 image to Firebase Storage and return the download URL
 */
export async function uploadImageToStorage(base64Data: string, gameId: string, itemIndex: number): Promise<string> {
  try {
    // Remove the data:image/png;base64, prefix
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Convert base64 to blob
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    // Create a reference to Firebase Storage
    const timestamp = Date.now();
    const imageRef = ref(storage, `game-images/${gameId}/item-${itemIndex}-${timestamp}.png`);
    
    // Upload the file
    console.log(`📤 [STORAGE] Uploading image for game ${gameId}, item ${itemIndex}...`);
    const snapshot = await uploadBytes(imageRef, blob);
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log(`✅ [STORAGE] Image uploaded successfully: ${downloadURL}`);
    
    return downloadURL;
  } catch (error) {
    console.error(`❌ [STORAGE] Failed to upload image for game ${gameId}, item ${itemIndex}:`, error);
    throw error;
  }
} 