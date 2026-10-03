import {createFoundationTexture} from './foundation-texture.js';

self.onmessage = ({data}) => {
  try {
    const {width, height, carrier, seed} = data;
    const tones = createFoundationTexture(width, height, carrier, seed);
    self.postMessage({id: data.id, result: {width, height, carrier, seed, yOffset: 0, rows: height, tones}}, [tones.buffer]);
  } catch (error) {
    self.postMessage({id: data.id, error: error.message});
  }
};
