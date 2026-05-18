function normalizeImageInput(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeImageInput(item);
      if (normalized) return normalized;
    }
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
}

export async function execute(_node, inputs, _apiConfig, sendProgress) {
  const image1 = normalizeImageInput(inputs.image1);
  const image2 = normalizeImageInput(inputs.image2);

  if (!image1) {
    throw new Error('Image compare node missing required input: image1');
  }
  if (!image2) {
    throw new Error('Image compare node missing required input: image2');
  }

  sendProgress?.('Preparing image comparison...');
  return {
    image1,
    image2,
  };
}
