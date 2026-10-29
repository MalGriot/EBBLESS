package io.github.malgriot.ebbless.webview;

import android.graphics.Bitmap;
import android.graphics.Color;

/** Color helpers for the iPod: a body color from the cover, and tints that stay readable against it. Nothing here runs per frame. */
final class IpodColor {
    static final int SILVER = 0xFFC8CBD0;

    private IpodColor() { }

    /**
     * A pleasing dominant color of the cover, or 0 when there is none. The cover is shrunk to 24x24, every pixel votes in one of 12 hue
     * buckets with a weight of saturation squared times brightness (so a big flat vivid area beats grey or near-black filler), the
     * heaviest bucket wins and its average is pulled into a range that keeps text readable on and around it.
     */
    static int dominant(Bitmap src) {
        if (src == null || src.isRecycled()) return 0;
        try {
            Bitmap s = Bitmap.createScaledBitmap(src, 24, 24, true);
            int[] px = new int[24 * 24];
            s.getPixels(px, 0, 24, 0, 0, 24, 24);
            if (s != src) s.recycle();
            float[] hsv = new float[3];
            float[] ws = new float[12], rs = new float[12], gs = new float[12], bs = new float[12];
            float ar = 0, ag = 0, ab = 0;
            int n = 0;
            for (int i = 0; i < px.length; i++) {
                int c = px[i];
                if ((c >>> 24) < 128) continue;
                int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
                ar += r; ag += g; ab += b; n++;
                Color.colorToHSV(c, hsv);
                float w = hsv[1] * hsv[1] * (0.25f + hsv[2]);
                if (hsv[1] < 0.18f || hsv[2] < 0.18f) w *= 0.05f;
                int k = ((int) (hsv[0] / 30f)) % 12;
                ws[k] += w; rs[k] += r * w; gs[k] += g * w; bs[k] += b * w;
            }
            if (n == 0) return 0;
            int best = 0;
            for (int k = 1; k < 12; k++) if (ws[k] > ws[best]) best = k;
            int col;
            if (ws[best] < 0.6f) col = Color.rgb(Math.round(ar / n), Math.round(ag / n), Math.round(ab / n));   // a grey or near-black cover: use its average
            else col = Color.rgb(Math.round(rs[best] / ws[best]), Math.round(gs[best] / ws[best]), Math.round(bs[best] / ws[best]));
            Color.colorToHSV(col, hsv);
            if (hsv[1] > 0.18f) hsv[1] = Math.max(0.32f, Math.min(0.88f, hsv[1]));
            hsv[2] = Math.max(0.42f, Math.min(0.86f, hsv[2]));
            return Color.HSVToColor(hsv);
        } catch (Throwable t) {
            return 0;
        }
    }

    static int lerp(int a, int b, float t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        return 0xFF000000 | (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
    }

    static int lighten(int c, float t) { return lerp(c, 0xFFFFFFFF, t); }
    static int darken(int c, float t) { return lerp(c, 0xFF000000, t); }

    static float lum(int c) {
        float[] l = new float[3];
        int[] ch = {(c >> 16) & 255, (c >> 8) & 255, c & 255};
        for (int i = 0; i < 3; i++) { float v = ch[i] / 255f; l[i] = v <= 0.03928f ? v / 12.92f : (float) Math.pow((v + 0.055f) / 1.055f, 2.4f); }
        return 0.2126f * l[0] + 0.7152f * l[1] + 0.0722f * l[2];
    }

    static boolean isLight(int c) { return lum(c) > 0.34f; }

    /** Dark ink on a light color, white on a dark one. */
    static int onColor(int c) { return isLight(c) ? 0xFF1A1A1D : 0xFFF6F6F8; }

    /** The click wheel ring for a body color: clearly darker on a light body, clearly lighter on a dark one. */
    static int ringFor(int body) { return isLight(body) ? darken(body, 0.40f) : lighten(body, 0.34f); }
}
