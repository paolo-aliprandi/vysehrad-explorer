import { maxPhotoBytes } from '../../api/reporting/src/report';

export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024)
    throw new Error('Choose a photo smaller than 20 MB.');
  const image = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  try {
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the photo.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const photo = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (!photo) throw new Error('This browser could not encode the photo.');
      if (photo.size <= maxPhotoBytes) return photo;
    }
    throw new Error('Please crop this photo or choose a simpler image.');
  } finally {
    image.close();
  }
}
