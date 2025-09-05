
export const b64toBlob = (b64Data: string, contentType: string = 'application/pdf', sliceSize: number = 512): Blob => {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
};

export const b64toArrayBuffer = (b64Data: string): ArrayBuffer => {
  const byteCharacters = atob(b64Data);
  const byteArray = new Uint8Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  return byteArray.buffer;
};

export const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert Blob to ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
};

export type PDFSourceType = 'url' | 'base64' | 'blob' | 'arrayBuffer';

export const detectPDFSourceType = (source: any): PDFSourceType => {
  if (typeof source === 'string') {
    if (source.startsWith('http') || source.startsWith('/') || source.startsWith('./')) {
      return 'url';
    } else {
      return 'base64';
    }
  } else if (source instanceof Blob) {
    return 'blob';
  } else if (source instanceof ArrayBuffer) {
    return 'arrayBuffer';
  } else {
    throw new Error('Unsupported PDF source type');
  }
};

export const normalizePDFSource = async (source: string | ArrayBuffer | Blob): Promise<ArrayBuffer> => {
  const sourceType = detectPDFSourceType(source);

  switch (sourceType) {
    case 'url':
      const response = await fetch(source as string);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF from URL: ${response.statusText}`);
      }
      return await response.arrayBuffer();

    case 'base64':
      const base64Data = (source as string).replace(/^data:application\/pdf;base64,/, '');
      return b64toArrayBuffer(base64Data);

    case 'blob':
      return await blobToArrayBuffer(source as Blob);

    case 'arrayBuffer':
      return source as ArrayBuffer;

    default:
      throw new Error(`Unsupported PDF source type: ${sourceType}`);
  }
};

export const validateBase64PDF = (base64String: string): boolean => {
  try {
    const cleanBase64 = base64String.replace(/^data:application\/pdf;base64,/, '');
    
    const decoded = atob(cleanBase64);
    
    return decoded.startsWith('%PDF');
  } catch (error) {
    return false;
  }
};

export const extractPDFMetadata = (base64String: string): { size: number; version?: string } => {
  try {
    const cleanBase64 = base64String.replace(/^data:application\/pdf;base64,/, '');
    const decoded = atob(cleanBase64);
    
    const versionMatch = decoded.match(/%PDF-(\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : undefined;
    
    return {
      size: decoded.length,
      version
    };
  } catch (error) {
    throw new Error('Failed to extract PDF metadata from base64 string');
  }
};

export const createPDFDataURL = (base64Data: string): string => {
  const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '');
  return `data:application/pdf;base64,${cleanBase64}`;
};

export const processBase64InChunks = (
  base64Data: string,
  chunkSize: number = 8192,
  processor: (chunk: Uint8Array) => void
): void => {
  const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '');
  
  for (let i = 0; i < cleanBase64.length; i += chunkSize) {
    const chunk = cleanBase64.slice(i, i + chunkSize);
    const binaryChunk = atob(chunk);
    const uint8Array = new Uint8Array(binaryChunk.length);
    
    for (let j = 0; j < binaryChunk.length; j++) {
      uint8Array[j] = binaryChunk.charCodeAt(j);
    }
    
    processor(uint8Array);
  }
};