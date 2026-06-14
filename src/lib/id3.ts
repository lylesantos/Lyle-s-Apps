interface ID3Tags {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
}

/**
 * Decode content of a text frame according to ID3v2 specifications.
 */
function decodeTextFrame(bytes: Uint8Array): string {
  if (bytes.length <= 1) return "";
  const encoding = bytes[0];
  const stringBytes = bytes.subarray(1);

  try {
    if (encoding === 0x00) {
      // Latin1 / ISO-8859-1
      const decoder = new TextDecoder("windows-1252");
      let text = decoder.decode(stringBytes);
      const nullIdx = text.indexOf("\0");
      if (nullIdx !== -1) text = text.substring(0, nullIdx);
      return text.trim();
    } else if (encoding === 0x01) {
      // UTF-16 with BOM (Byte Order Mark)
      const decoder = new TextDecoder("utf-16");
      let text = decoder.decode(stringBytes);
      const nullIdx = text.indexOf("\0");
      if (nullIdx !== -1) text = text.substring(0, nullIdx);
      return text.trim();
    } else if (encoding === 0x02) {
      // UTF-16BE without BOM
      const decoder = new TextDecoder("utf-16be");
      let text = decoder.decode(stringBytes);
      const nullIdx = text.indexOf("\0");
      if (nullIdx !== -1) text = text.substring(0, nullIdx);
      return text.trim();
    } else if (encoding === 0x03) {
      // UTF-8
      const decoder = new TextDecoder("utf-8");
      let text = decoder.decode(stringBytes);
      const nullIdx = text.indexOf("\0");
      if (nullIdx !== -1) text = text.substring(0, nullIdx);
      return text.trim();
    }
  } catch (err) {
    console.error("Text decoding error:", err);
  }

  // Pure ASCII fallback
  let str = "";
  for (let i = 0; i < stringBytes.length; i++) {
    if (stringBytes[i] === 0) break;
    str += String.fromCharCode(stringBytes[i]);
  }
  return str.trim();
}

/**
 * Decode an APIC (Attached Picture) frame to a Base64 data URL.
 */
function decodePictureFrame(bytes: Uint8Array): string | null {
  if (bytes.length < 5) return null;
  const encoding = bytes[0];

  // 1. Find the end of the MIME Type string
  let mimeEnd = 1;
  while (mimeEnd < bytes.length && bytes[mimeEnd] !== 0) {
    mimeEnd++;
  }
  if (mimeEnd >= bytes.length) return null;
  
  const mimeType = new TextDecoder("ascii").decode(bytes.subarray(1, mimeEnd)).toLowerCase();

  // 2. Picture Type is 1 byte after MIME end
  const picTypeOffset = mimeEnd + 1;
  if (picTypeOffset >= bytes.length) return null;

  // 3. Find the end of the Description string
  let descEnd = picTypeOffset + 1;
  if (encoding === 0x00 || encoding === 0x03) {
    // 1-byte null separator
    while (descEnd < bytes.length && bytes[descEnd] !== 0) {
      descEnd++;
    }
    descEnd += 1;
  } else {
    // 2-byte null separator for UTF-16
    while (descEnd < bytes.length - 1 && !(bytes[descEnd] === 0 && bytes[descEnd + 1] === 0)) {
      descEnd++;
    }
    descEnd += 2;
  }

  if (descEnd >= bytes.length) return null;

  const imgBytes = bytes.subarray(descEnd);
  if (imgBytes.length === 0) return null;

  try {
    let binary = "";
    const len = imgBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(imgBytes[i]);
    }
    const base64 = btoa(binary);
    return `data:${mimeType || "image/jpeg"};base64,${base64}`;
  } catch (err) {
    console.error("Failed to convert image to base64:", err);
    return null;
  }
}

/**
 * Parses ID3v2.3 and ID3v2.4 tags from a File or Blob.
 */
export async function readID3(blob: Blob): Promise<ID3Tags> {
  const tags: ID3Tags = {};
  
  try {
    // We only need the first 2-5 MBs to scan standard ID3 headers 
    const sliceLimit = Math.min(blob.size, 5 * 1024 * 1024);
    const arrayBuffer = await blob.slice(0, sliceLimit).arrayBuffer();
    const view = new DataView(arrayBuffer);

    // Verify 'ID3' header
    if (
      arrayBuffer.byteLength >= 10 &&
      view.getUint8(0) === 0x49 &&
      view.getUint8(1) === 0x44 &&
      view.getUint8(2) === 0x33
    ) {
      const majorVersion = view.getUint8(3);
      const flags = view.getUint8(5);
      
      // Read 4-byte synchsafe integer representing the total Tag Size
      const s0 = view.getUint8(6);
      const s1 = view.getUint8(7);
      const s2 = view.getUint8(8);
      const s3 = view.getUint8(9);
      const tagSize = (s0 << 21) | (s1 << 14) | (s2 << 7) | s3;

      let offset = 10;
      const endOffset = Math.min(10 + tagSize, arrayBuffer.byteLength);

      while (offset < endOffset && offset + 10 < arrayBuffer.byteLength) {
        const frameID = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );

        // Continuous zeros mean padding started
        if (view.getUint8(offset) === 0) {
          break;
        }

        let frameSize = 0;
        if (majorVersion === 4) {
          // Synchsafe size inside ID3v2.4 frames
          const f0 = view.getUint8(offset + 4);
          const f1 = view.getUint8(offset + 5);
          const f2 = view.getUint8(offset + 6);
          const f3 = view.getUint8(offset + 7);
          frameSize = (f0 << 21) | (f1 << 14) | (f2 << 7) | f3;
        } else {
          // Regular big-endian 32-bit int in ID3v2.3
          frameSize = view.getUint32(offset + 4, false);
        }

        const contentOffset = offset + 10;
        if (contentOffset + frameSize > arrayBuffer.byteLength) {
          break;
        }

        const frameBytes = new Uint8Array(arrayBuffer, contentOffset, frameSize);

        if (frameID === "TIT2") {
          tags.title = decodeTextFrame(frameBytes);
        } else if (frameID === "TPE1") {
          tags.artist = decodeTextFrame(frameBytes);
        } else if (frameID === "TALB") {
          tags.album = decodeTextFrame(frameBytes);
        } else if (frameID === "APIC") {
          const cover = decodePictureFrame(frameBytes);
          if (cover) {
            tags.coverUrl = cover;
          }
        }

        offset += 10 + frameSize;
      }
    }
  } catch (err) {
    console.error("Error reading ID3 tags:", err);
  }

  return tags;
}

/**
 * Encodes a text string into an ID3v2 Frame block (UTF-8 encoding 0x03).
 */
function encodeTextFrame(frameId: string, text: string): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  const content = new Uint8Array(1 + textBytes.length);
  content[0] = 0x03; // Specifies UTF-8 encoding
  content.set(textBytes, 1);

  const frameSize = content.length;
  const frame = new Uint8Array(10 + frameSize);

  // Set Frame ID text (e.g. TIT2)
  for (let i = 0; i < 4; i++) {
    frame[i] = frameId.charCodeAt(i);
  }

  // Set Frame Size (big-endian 32-bit)
  frame[4] = (frameSize >> 24) & 0xff;
  frame[5] = (frameSize >> 16) & 0xff;
  frame[6] = (frameSize >> 8) & 0xff;
  frame[7] = frameSize & 0xff;

  // Set flags to 0x0000
  frame[8] = 0x00;
  frame[9] = 0x00;

  frame.set(content, 10);
  return frame;
}

/**
 * Encodes a Base64 cover URL back into a spec-compliant APIC picture frame.
 */
function encodePictureFrame(base64Url: string): Uint8Array | null {
  if (!base64Url.startsWith("data:")) return null;
  
  try {
    const parts = base64Url.split(",");
    if (parts.length < 2) return null;
    
    const mimePart = parts[0].split(";")[0];
    const mimeType = mimePart.substring(5) || "image/jpeg";
    const base64Data = parts[1];

    const binaryString = atob(base64Data);
    const imgBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      imgBytes[i] = binaryString.charCodeAt(i);
    }

    const mimeBytes = new TextEncoder().encode(mimeType);
    
    // Size check
    const contentSize = 1 + mimeBytes.length + 1 + 1 + 1 + imgBytes.length;
    const content = new Uint8Array(contentSize);

    let o = 0;
    content[o++] = 0x00; // ISO-8859-1 for mime/empty metadata description
    content.set(mimeBytes, o);
    o += mimeBytes.length;
    content[o++] = 0x00; // MIME null terminator
    content[o++] = 0x03; // Picture Type: Cover (front)
    content[o++] = 0x00; // Description null terminator
    content.set(imgBytes, o);

    const frame = new Uint8Array(10 + contentSize);
    
    // Frame ID: APIC
    frame[0] = 65; // A
    frame[1] = 80; // P
    frame[2] = 73; // I
    frame[3] = 67; // C

    // Set Frame Size (big-endian)
    frame[4] = (contentSize >> 24) & 0xff;
    frame[5] = (contentSize >> 16) & 0xff;
    frame[6] = (contentSize >> 8) & 0xff;
    frame[7] = contentSize & 0xff;

    // Flags
    frame[8] = 0x00;
    frame[9] = 0x00;

    frame.set(content, 10);
    return frame;
  } catch (err) {
    console.error("Failed to encode picture frame:", err);
    return null;
  }
}

/**
 * Prepends a new ID3v2.3 tag containing updated metadata to the MP3 file Blob.
 * If the Blob already contains an ID3v2 tag, it slices it off before prepending the new tag.
 */
export async function writeID3(
  blob: Blob,
  tags: { title: string; artist: string; album: string; coverUrl?: string }
): Promise<Blob> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    let audioStartOffset = 0;

    // Check if the file already has an ID3v2 tag
    if (
      arrayBuffer.byteLength >= 10 &&
      view.getUint8(0) === 0x49 &&
      view.getUint8(1) === 0x44 &&
      view.getUint8(2) === 0x33
    ) {
      // Exist tag detected; locate where original raw audio streams begin
      const s0 = view.getUint8(6);
      const s1 = view.getUint8(7);
      const s2 = view.getUint8(8);
      const s3 = view.getUint8(9);
      const oldTagSize = (s0 << 21) | (s1 << 14) | (s2 << 7) | s3;
      audioStartOffset = 10 + oldTagSize;
    }

    // Isolate original body bytes (raw compressed MP3 frames)
    const audioContent = new Uint8Array(arrayBuffer, audioStartOffset);

    // Encode text tags
    const tit2Frame = encodeTextFrame("TIT2", tags.title);
    const tpe1Frame = encodeTextFrame("TPE1", tags.artist);
    const talbFrame = encodeTextFrame("TALB", tags.album);
    
    // Add custom cover artwork frame if base64Url exists
    let apicFrame: Uint8Array | null = null;
    if (tags.coverUrl) {
      apicFrame = encodePictureFrame(tags.coverUrl);
    }

    // Compute total combined frame byte length
    let totalFramesSize = tit2Frame.length + tpe1Frame.length + talbFrame.length;
    if (apicFrame) {
      totalFramesSize += apicFrame.length;
    }

    // Create complete ID3v2 Header (10 bytes) + Frames Buffer
    const id3Tag = new Uint8Array(10 + totalFramesSize);

    // Header ID "ID3"
    id3Tag[0] = 0x49; // I
    id3Tag[1] = 0x44; // D
    id3Tag[2] = 0x33; // 3

    // Version ID3v2.3
    id3Tag[3] = 0x03;
    id3Tag[4] = 0x00;

    // Flags: 0x00
    id3Tag[5] = 0x00;

    // Write Synchsafe Tag Size (28-bit)
    id3Tag[6] = (totalFramesSize >> 21) & 0x7f;
    id3Tag[7] = (totalFramesSize >> 14) & 0x7f;
    id3Tag[8] = (totalFramesSize >> 7) & 0x7f;
    id3Tag[9] = totalFramesSize & 0x7f;

    // Write packed frames
    let pointer = 10;
    id3Tag.set(tit2Frame, pointer);
    pointer += tit2Frame.length;

    id3Tag.set(tpe1Frame, pointer);
    pointer += tpe1Frame.length;

    id3Tag.set(talbFrame, pointer);
    pointer += talbFrame.length;

    if (apicFrame) {
      id3Tag.set(apicFrame, pointer);
    }

    // Assemble new final file blob
    return new Blob([id3Tag, audioContent], { type: blob.type || "audio/mpeg" });
  } catch (err) {
    console.error("Error writing ID3 tags:", err);
    return blob; // fallback to original file on error
  }
}
