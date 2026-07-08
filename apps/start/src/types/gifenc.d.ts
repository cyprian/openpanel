declare module 'gifenc' {
  type GifColorFormat = 'rgb565' | 'rgb444' | 'rgba4444';
  type GifPalette = number[][];
  type GifRgbaData = Uint8Array | Uint8ClampedArray;

  type QuantizeOptions = {
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
    format?: GifColorFormat;
    oneBitAlpha?: boolean | number;
  };

  type GifEncoderOptions = {
    auto?: boolean;
    initialCapacity?: number;
  };

  type GifFrameOptions = {
    colorDepth?: number;
    delay?: number;
    dispose?: number;
    first?: boolean;
    palette?: GifPalette | null;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
  };

  type GifEncoder = {
    readonly buffer: ArrayBuffer;
    readonly stream: unknown;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    finish(): void;
    reset(): void;
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: GifFrameOptions
    ): void;
    writeHeader(): void;
  };

  export function GIFEncoder(options?: GifEncoderOptions): GifEncoder;
  export function applyPalette(
    rgba: GifRgbaData,
    palette: GifPalette,
    format?: GifColorFormat
  ): Uint8Array;
  export function quantize(
    rgba: GifRgbaData,
    maxColors: number,
    options?: QuantizeOptions
  ): GifPalette;
}
