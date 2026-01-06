import '@jest/globals';
import fetch, { Response } from 'node-fetch';
import crypto from 'node:crypto';

global.fetch = fetch;
global.Response = Response;
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => crypto.randomUUID()
  }
});

// Mock Touch and TouchEvent for JSDOM
class Touch {
  constructor({ identifier, target, clientX, clientY }) {
    this.identifier = identifier;
    this.target = target;
    this.clientX = clientX;
    this.clientY = clientY;
    this.pageX = clientX;
    this.pageY = clientY;
    this.screenX = clientX;
    this.screenY = clientY;
    this.radiusX = 0;
    this.radiusY = 0;
    this.rotationAngle = 0;
    this.force = 1;
  }
}

class TouchEvent extends Event {
  constructor(type, { touches = [], cancelable = false } = {}) {
    super(type, { cancelable });
    this.touches = touches;
    this.targetTouches = touches;
    this.changedTouches = touches;
  }
}

global.Touch = Touch;
global.TouchEvent = TouchEvent;
