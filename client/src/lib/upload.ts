import { API_URL } from './config';

export async function uploadToCloudinary(file: File) {
  const sigRes = await fetch(`${API_URL}/upload/signature`, {
    credentials: 'include',
  });
  const { signature, timestamp, apiKey, cloudName, folder } = await sigRes.json();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp);
  formData.append('signature', signature);
  formData.append('folder', folder);

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await uploadRes.json();
  return { url: data.secure_url as string, publicId: data.public_id as string };
}