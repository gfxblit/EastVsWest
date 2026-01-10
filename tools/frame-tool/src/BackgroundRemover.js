export class BackgroundRemover {
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    static process(imageData, keyColorHex, threshold) {
        const keyColor = this.hexToRgb(keyColorHex);
        if (!keyColor) return;

        const data = imageData.data;
        const { r: kr, g: kg, b: kb } = keyColor;
        // Compare squared distance to avoid sqrt in loop for performance (if we squared threshold)
        // But for clarity let's match the mental model of distance <= threshold
        const threshSq = threshold * threshold;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const dr = r - kr;
            const dg = g - kg;
            const db = b - kb;
            
            const distSq = dr * dr + dg * dg + db * db;
            
            if (distSq <= threshSq) {
                data[i + 3] = 0; // Set alpha to 0
            }
        }
    }

    static erode(imageData, amount) {
        if (amount <= 0) return;

        const { width, height, data } = imageData;
        const originalData = new Uint8ClampedArray(data);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                // Only process opaque pixels
                if (originalData[idx + 3] === 0) continue;

                let shouldErode = false;
                for (let dy = -amount; dy <= amount; dy++) {
                    for (let dx = -amount; dx <= amount; dx++) {
                        if (dx === 0 && dy === 0) continue;

                        const nx = x + dx;
                        const ny = y + dy;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = (ny * width + nx) * 4;
                            if (originalData[nIdx + 3] === 0) {
                                shouldErode = true;
                                break;
                            }
                        }
                    }
                    if (shouldErode) break;
                }

                if (shouldErode) {
                    data[idx + 3] = 0;
                }
            }
        }
    }
}
