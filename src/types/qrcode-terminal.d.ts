// src/types/qrcode-terminal.d.ts

declare module 'qrcode-terminal' {
  interface QRCodeTerminal {
    /**
     * Gera o QR Code no terminal
     * @param input A string ou URL para gerar o QR
     * @param options Opções de exibição (ex: { small: true })
     */
    generate(input: string, options?: { small: boolean }): void;
  }

  const qrcode: QRCodeTerminal;
  export = qrcode;
}