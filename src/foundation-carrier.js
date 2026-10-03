// Prepared samples retain full-frame coordinates even when a CPU worker owns
// only a stripe. No image pixels or temporal history are stored here.
export function foundationCarrierKey({width, height, carrier = 'pink', seed = 173}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > 2048 || height > 2048 || width * height > 2097152
      || !['binary', 'white', 'pink'].includes(carrier)
      || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('Invalid prepared foundation carrier');
  }
  return `${width}/${height}/${carrier}/${seed}`;
}

export function validatePreparedCarrier(prepared) {
  const key = foundationCarrierKey(prepared);
  const {width, height, yOffset, rows, tones} = prepared;
  if (!['binary', 'white', 'pink'].includes(prepared.carrier) || !Number.isInteger(prepared.seed)
      || !Number.isInteger(yOffset) || !Number.isInteger(rows) || yOffset < 0 || rows < 1
      || yOffset + rows > height || !(tones instanceof Uint8Array) || tones.length !== width * rows) {
    throw new Error('Invalid prepared foundation carrier rows');
  }
  return key;
}

export function slicePreparedCarrier(prepared, yOffset, rows) {
  validatePreparedCarrier(prepared);
  if (yOffset < prepared.yOffset || yOffset + rows > prepared.yOffset + prepared.rows) {
    throw new Error('Prepared foundation carrier does not cover requested rows');
  }
  const start = (yOffset - prepared.yOffset) * prepared.width;
  const stripe = {...prepared, yOffset, rows, tones: prepared.tones.slice(start, start + rows * prepared.width)};
  validatePreparedCarrier(stripe);
  return stripe;
}
