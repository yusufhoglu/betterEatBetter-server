import sharp from 'sharp';

jest.mock('../../../shared/queue/queueConnection', () => ({
  createWorker: jest.fn(() => ({ close: jest.fn(), on: jest.fn() })),
}));

jest.mock('../../../shared/observability/logger', () => ({
  createModuleLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { standardizeImage } from './standardizeAndCopyJob';

describe('standardizeImage', () => {
  it('normalizes EXIF orientation into upright pixel data before encoding', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 120, g: 160, b: 220 },
      },
    })
      .jpeg({ quality: 80 })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const inputMetadata = await sharp(inputBuffer).metadata();
    expect(inputMetadata.width).toBe(400);
    expect(inputMetadata.height).toBe(300);
    expect(inputMetadata.orientation).toBe(6);

    const outputBuffer = await standardizeImage(inputBuffer);
    const outputMetadata = await sharp(outputBuffer).metadata();

    // The stored output must be visually upright even if EXIF is ignored.
    expect(outputMetadata.width).toBe(300);
    expect(outputMetadata.height).toBe(400);
    expect(outputMetadata.orientation === undefined || outputMetadata.orientation === 1).toBe(true);
  });
});
