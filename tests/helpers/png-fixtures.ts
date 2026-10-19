import { crc32, deflateSync } from "node:zlib";

export const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function pngChunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}
const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]);
const red = Buffer.from([0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0]);
const blue = Buffer.from([0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255]);
function frameControl(sequence: number) {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence);
  data.writeUInt32BE(2, 4);
  data.writeUInt32BE(2, 8);
  data.writeUInt16BE(1, 20);
  data.writeUInt16BE(10, 22);
  return pngChunk("fcTL", data);
}
export function animatedPng(): Buffer {
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(2);
  const sequence = Buffer.alloc(4);
  sequence.writeUInt32BE(2);
  return Buffer.concat([
    pngSignature, pngChunk("IHDR", header), pngChunk("acTL", animation),
    frameControl(0), pngChunk("IDAT", deflateSync(red)),
    frameControl(1), pngChunk("fdAT", Buffer.concat([sequence, deflateSync(blue)])), pngChunk("IEND"),
  ]);
}
export function staticPngWithMarker(): Buffer {
  const pixels = Buffer.from([0, 97, 99, 84, 76, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  // Uncompressed DEFLATE preserves the literal acTL bytes inside IDAT's payload.
  return Buffer.concat([pngSignature, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels, { level: 0 })), pngChunk("IEND")]);
}
