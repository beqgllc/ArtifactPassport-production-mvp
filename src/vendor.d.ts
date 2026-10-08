declare module 'fflate' {
  export function unzipSync(data: Uint8Array): Record<string, Uint8Array>;
}
declare module 'qrcode' {
  export interface QRCodeOptions { width?: number; margin?: number; errorCorrectionLevel?: 'L'|'M'|'Q'|'H'; }
  const QRCode: { toCanvas(canvas: HTMLCanvasElement, text: string, options?: QRCodeOptions): Promise<HTMLCanvasElement>; };
  export default QRCode;
}
