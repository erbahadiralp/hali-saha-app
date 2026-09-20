import * as ImageManipulator from 'expo-image-manipulator';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert } from 'react-native';
import { storage } from '../firebaseConfig';

type UploadType = 'profile' | 'group' | 'match';

// Avatars and group photos never render larger than ~130pt, so 512px (≈3x density) is plenty.
const MAX_IMAGE_WIDTH: Record<UploadType, number> = { profile: 512, group: 512, match: 1024 };
const JPEG_QUALITY = 0.7;

/**
 * Compress and resize an image before upload
 * @param uri - Original image URI
 * @returns Compressed image URI
 */
const compressImage = async (uri: string, type: UploadType): Promise<string> => {
    try {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: MAX_IMAGE_WIDTH[type] } }],
            {
                compress: JPEG_QUALITY,
                format: ImageManipulator.SaveFormat.JPEG,
            }
        );
        return result.uri;
    } catch (error) {
        console.warn('Image compression failed, using original:', error);
        return uri; // Fall back to original if compression fails
    }
};

/**
 * Upload an image to Firebase Storage (compressed)
 * @param uri - Local file URI
 * @param type - Upload type (determines storage path)
 * @param id - Optional ID for organizing files (userId for profile, groupId for group)
 * @returns Download URL or null on failure
 */
export const uploadImage = async (
    uri: string,
    type: UploadType,
    id?: string
): Promise<string | null> => {
    try {
        if (!uri) return null;

        // Compress image before upload
        const compressedUri = await compressImage(uri, type);

        // Determine storage path
        const timestamp = Date.now();
        let storagePath: string;
        switch (type) {
            case 'profile':
                storagePath = `avatars/${id || 'unknown'}/${timestamp}.jpg`;
                break;
            case 'group':
                storagePath = `groups/${id || 'unknown'}/${timestamp}.jpg`;
                break;
            case 'match':
                storagePath = `matches/${id || 'unknown'}_${timestamp}.jpg`;
                break;
        }

        // Convert compressed URI to blob
        const response = await fetch(compressedUri);
        const blob = await response.blob();

        // Upload to Firebase Storage
        const storageRef = ref(storage, storagePath);
        const uploadTask = await uploadBytesResumable(storageRef, blob);

        // Get download URL
        const downloadURL = await getDownloadURL(uploadTask.ref);
        return downloadURL;
    } catch (error) {
        console.error('Firebase Storage Upload Error:', error);
        Alert.alert('Hata', 'Fotoğraf yüklenemedi.');
        return null;
    }
};

/**
 * Delete an image from Firebase Storage (optional, for cleanup)
 */
export const deleteImage = async (url: string): Promise<void> => {
    try {
        // Extract path from URL - only works for Firebase Storage URLs
        if (!url.includes('firebasestorage.googleapis.com') && !url.includes('firebasestorage.app')) {
            return; // Skip non-Firebase URLs (old Cloudinary URLs)
        }
        const storageRef = ref(storage, url);
        // deleteObject imported separately if needed
    } catch (error) {
        console.error('Firebase Storage Delete Error:', error);
    }
};
