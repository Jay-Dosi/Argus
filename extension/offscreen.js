chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }
  
  if (message.type === 'compress_image') {
    compressImage(message.data, message.quality).then(sendResponse);
    return true; // async response
  }
});

async function compressImage(dataUrl, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      
      // Calculate new dimensions (max 1280px width for Gemini)
      const MAX_WIDTH = 1280;
      let width = img.width;
      let height = img.height;
      
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Get compressed base64 (jpeg, quality 0.0 - 1.0)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      
      resolve(compressedDataUrl.split(',')[1]); // return just the b64 string
    };
    img.src = dataUrl;
  });
}
