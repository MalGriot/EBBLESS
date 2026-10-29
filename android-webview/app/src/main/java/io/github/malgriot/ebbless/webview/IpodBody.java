package io.github.malgriot.ebbless.webview;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;

/**
 * The iPod's case, drawn ONCE into a cached bitmap per (size, color, screen position): a soft drop shadow, a glossy rounded-rect case
 * with light/dark edge bevels, and a recessed screen bezel. draw() only blits the bitmap. The bitmap is re-rendered in place (no new
 * allocation) when the color changes, which IpodPlayer does in at most 8 cross-fade steps per song.
 */
final class IpodBody extends Drawable {
    /** Room around the case for the drop shadow, in dp. */
    static final float SHADOW_DP = 12f;

    private final float dp;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint blit = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final RectF r = new RectF(), sr = new RectF(), bz = new RectF();
    private final Canvas cv = new Canvas();
    private Bitmap bmp;
    private int color = IpodColor.SILVER;
    private boolean haveScreen;

    IpodBody(float density) { dp = density; }

    void setColor(int c) {
        if (c == color) return;
        color = c;
        render();
        invalidateSelf();
    }

    /** Where the screen view sits inside this drawable (the bezel is cut around it). */
    void setScreen(int l, int t, int rr, int b) {
        if (haveScreen && sr.left == l && sr.top == t && sr.right == rr && sr.bottom == b) return;
        sr.set(l, t, rr, b);
        haveScreen = rr > l && b > t;
        render();
        invalidateSelf();
    }

    @Override protected void onBoundsChange(Rect b) {
        render();
    }

    @Override public void draw(Canvas c) {
        if (bmp != null) c.drawBitmap(bmp, getBounds().left, getBounds().top, blit);
    }

    private void fresh() {
        p.reset();
        p.setAntiAlias(true);
    }

    private void render() {
        Rect bd = getBounds();
        int w = bd.width(), h = bd.height();
        if (w <= 0 || h <= 0) return;
        if (bmp == null || bmp.getWidth() != w || bmp.getHeight() != h) {
            if (bmp != null) bmp.recycle();
            bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            cv.setBitmap(bmp);
        } else {
            bmp.eraseColor(0);
        }
        Canvas c = cv;
        float m = SHADOW_DP * dp, rad = 34 * dp;
        r.set(m, m, w - m, h - m);

        // drop shadow under the case, then the case itself with a top-to-bottom sheen
        fresh();
        p.setStyle(Paint.Style.FILL);
        p.setColor(color);
        p.setShadowLayer(9 * dp, 0, 3.5f * dp, 0xD0000000);
        c.drawRoundRect(r, rad, rad, p);
        fresh();
        p.setShader(new LinearGradient(0, r.top, 0, r.bottom, IpodColor.lighten(color, 0.12f), IpodColor.darken(color, 0.18f), Shader.TileMode.CLAMP));
        c.drawRoundRect(r, rad, rad, p);
        // gloss: a soft diagonal sheen from the top left corner
        fresh();
        p.setShader(new LinearGradient(r.left, r.top, r.right, r.bottom,
                new int[]{0x40FFFFFF, 0x0CFFFFFF, 0x00000000, 0x1C000000}, new float[]{0f, 0.36f, 0.5f, 1f}, Shader.TileMode.CLAMP));
        c.drawRoundRect(r, rad, rad, p);

        // edge bevels: light on the top left, dark on the bottom right, plus a thin dark outline
        fresh();
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2.5f * dp);
        p.setShader(new LinearGradient(r.left, r.top, r.right, r.bottom,
                new int[]{0xB8FFFFFF, 0x22FFFFFF, 0x00000000, 0x78000000}, new float[]{0f, 0.45f, 0.55f, 1f}, Shader.TileMode.CLAMP));
        r.inset(1.5f * dp, 1.5f * dp);
        c.drawRoundRect(r, rad - 1.5f * dp, rad - 1.5f * dp, p);
        r.inset(-1.5f * dp, -1.5f * dp);
        fresh();
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1f * dp);
        p.setColor(0x73000000);
        c.drawRoundRect(r, rad, rad, p);

        // recessed screen bezel
        if (haveScreen) {
            float e = 6 * dp, br = 16 * dp + e;
            bz.set(sr.left - e, sr.top - e, sr.right + e, sr.bottom + e);
            fresh();
            p.setStyle(Paint.Style.FILL);
            p.setColor(0x4DFFFFFF);   // the lower lip catching light
            bz.offset(0, 1.5f * dp);
            c.drawRoundRect(bz, br, br, p);
            bz.offset(0, -1.5f * dp);
            p.setColor(0xFF050506);
            c.drawRoundRect(bz, br, br, p);
            fresh();
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(2.5f * dp);
            p.setShader(new LinearGradient(0, bz.top, 0, bz.bottom, 0xFF000000, 0x22000000, Shader.TileMode.CLAMP));   // inner shadow from the top edge
            bz.inset(1.2f * dp, 1.2f * dp);
            c.drawRoundRect(bz, br - 1.2f * dp, br - 1.2f * dp, p);
        }
    }

    @Override public void setAlpha(int a) { }
    @Override public void setColorFilter(ColorFilter cf) { }
    @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
