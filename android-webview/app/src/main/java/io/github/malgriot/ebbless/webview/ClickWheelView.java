package io.github.malgriot.ebbless.webview;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;

/**
 * iPod-style click wheel. Drag a finger around the ring to rotate (one step per ~22 degrees, a soft haptic tick on each step);
 * tap the center for select, the top for Menu, left for previous, right for next, bottom for play/pause.
 * Controls mode (a game is running): the ring becomes four arrow keys (up, right, down, left) that fire onDirection on touch-down and
 * repeat while held; the center button still selects. Menu is then a separate button (IpodPlayer's game bar).
 * Draws only on touch and on state changes (no animation, no frame loop).
 */
final class ClickWheelView extends View {
    interface Listener {
        void onStep(int dir);   // +1 clockwise, -1 counter-clockwise
        void onCenter();
        void onMenu();
        void onPrev();
        void onNext();
        void onPlayPause();
        void onDirection(int dir);   // controls mode: 0 up, 1 right, 2 down, 3 left (IpodGame.DIR_*)
    }

    static final float STEP_DEG = 22f;
    private static final float DRAG_START_DEG = 9f;   // less than this and a touch is still a tap

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint press = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final RectF oval = new RectF(), outerRect = new RectF(), innerRect = new RectF();
    private final Canvas cv = new Canvas();
    private Bitmap cache;
    private Listener listener;
    private int accent;
    private int ring = 0xFF2B2B2F, hub = 0xFF1B1B1E, mark = 0xFFF6F6F8;
    private static final long REPEAT_FIRST_MS = 340, REPEAT_MS = 110;
    private boolean haptics = true, playing, controls;
    private float cx, cy, outerR, innerR;
    private final float slop;

    // gesture state
    private boolean tracking, inCenter, dragged, canceled, centerPressed;
    private float lastAngle, totalDeg, stepAccum, downX, downY;
    private int zone = -1;   // 0 top, 1 right, 2 bottom, 3 left, -1 none (pressed ring segment, for the highlight)

    ClickWheelView(Context c, int accent) {
        super(c);
        this.accent = accent;
        slop = ViewConfiguration.get(c).getScaledTouchSlop();
        setContentDescription("Click wheel");
    }

    void setListener(Listener l) { listener = l; }
    void setAccent(int a) { accent = a; }
    /** The body color (from the cover): the ring, the center button and the markings are derived from it so they always contrast. */
    void setTheme(int body) {
        ring = IpodColor.ringFor(body);
        hub = IpodColor.isLight(ring) ? IpodColor.darken(ring, 0.16f) : IpodColor.lighten(ring, 0.10f);
        mark = IpodColor.onColor(ring);
        rebuild();
        invalidate();
    }
    void setHaptics(boolean on) { haptics = on; }
    boolean isControls() { return controls; }
    void setControls(boolean on) { if (on != controls) { controls = on; stopRepeat(); tracking = false; zone = -1; centerPressed = false; rebuild(); invalidate(); } }

    private final Runnable repeat = new Runnable() {
        @Override public void run() {
            if (!tracking || !controls || zone < 0) return;
            tick();
            if (listener != null) listener.onDirection(zone);
            postDelayed(this, REPEAT_MS);
        }
    };
    private void stopRepeat() { removeCallbacks(repeat); }
    @Override protected void onDetachedFromWindow() { stopRepeat(); super.onDetachedFromWindow(); }

    void setPlaying(boolean on) { if (on != playing) { playing = on; invalidate(); } }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        cx = w / 2f; cy = h / 2f;
        outerR = Math.min(w, h) / 2f - 7 * getResources().getDisplayMetrics().density;   // room for the drop shadow
        innerR = outerR * 0.36f;
        outerRect.set(cx - outerR, cy - outerR, cx + outerR, cy + outerR);
        innerRect.set(cx - innerR - 1, cy - innerR - 1, cx + innerR + 1, cy + innerR + 1);
        rebuild();
    }

    private void tick() {
        if (haptics) performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
    }

    private float angleOf(float x, float y) { return (float) Math.toDegrees(Math.atan2(y - cy, x - cx)); }   // screen coords: grows clockwise

    @Override public boolean onTouchEvent(MotionEvent e) {
        float x = e.getX(), y = e.getY();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                float d = (float) Math.hypot(x - cx, y - cy);
                if (d > outerR * 1.04f) return false;
                getParent().requestDisallowInterceptTouchEvent(true);
                tracking = true; dragged = false; canceled = false; totalDeg = 0; stepAccum = 0;
                downX = x; downY = y; lastAngle = angleOf(x, y);
                inCenter = d < innerR;
                centerPressed = inCenter;
                zone = inCenter ? -1 : zoneOf(lastAngle);
                invalidate();
                if (controls && zone >= 0) {   // an arrow key fires at once and repeats while it is held
                    tick();
                    if (listener != null) listener.onDirection(zone);
                    postDelayed(repeat, REPEAT_FIRST_MS);
                }
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                if (!tracking) return false;
                if (inCenter) {   // a press that slides away from the button is not a press
                    if (Math.hypot(x - downX, y - downY) > slop * 2) { canceled = true; centerPressed = false; invalidate(); }
                    return true;
                }
                if (controls) return true;   // arrows do not rotate
                float a = angleOf(x, y);
                float d = a - lastAngle;
                if (d > 180) d -= 360; else if (d < -180) d += 360;
                lastAngle = a;
                if (Math.hypot(x - cx, y - cy) < innerR * 0.5f) return true;   // too close to the middle: the angle is noise
                totalDeg += Math.abs(d);
                if (!dragged && totalDeg >= DRAG_START_DEG) { dragged = true; zone = -1; invalidate(); }
                if (dragged) {
                    stepAccum += d;
                    while (stepAccum >= STEP_DEG) { stepAccum -= STEP_DEG; emitStep(1); }
                    while (stepAccum <= -STEP_DEG) { stepAccum += STEP_DEG; emitStep(-1); }
                }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (!tracking) return false;
                tracking = false;
                stopRepeat();
                boolean wasCenter = inCenter, ok = !dragged && !canceled;
                int z = controls ? -1 : zone;
                centerPressed = false; zone = -1;
                invalidate();
                if (ok && listener != null) {
                    tick();
                    if (wasCenter) listener.onCenter();
                    else switch (z) {
                        case 0: listener.onMenu(); break;
                        case 1: listener.onNext(); break;
                        case 2: listener.onPlayPause(); break;
                        case 3: listener.onPrev(); break;
                        default: break;
                    }
                }
                return true;
            }
            case MotionEvent.ACTION_CANCEL:
                stopRepeat();
                tracking = false; centerPressed = false; zone = -1; invalidate();
                return true;
            default:
                return true;
        }
    }

    private void emitStep(int dir) {
        tick();
        if (listener != null) listener.onStep(dir);
    }

    /** Top 45 degrees either side is Menu, then right, bottom, left. */
    private static int zoneOf(float deg) {
        if (deg >= -135 && deg < -45) return 0;
        if (deg >= -45 && deg < 45) return 1;
        if (deg >= 45 && deg < 135) return 2;
        return 3;
    }

    /** Pre-renders the whole wheel (shadow, raised ring with bevels, recessed hub, convex center button, markings) once per size / color / mode. */
    private void rebuild() {
        int w = getWidth(), h = getHeight();
        if (w <= 0 || h <= 0) return;
        if (cache == null || cache.getWidth() != w || cache.getHeight() != h) {
            if (cache != null) cache.recycle();
            cache = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            cv.setBitmap(cache);
        } else {
            cache.eraseColor(0);
        }
        Canvas c = cv;
        float dp = getResources().getDisplayMetrics().density;

        // ring body with a drop shadow, then a top-to-bottom sheen
        fresh();
        p.setColor(ring);
        p.setShadowLayer(5 * dp, 0, 2 * dp, 0xB0000000);
        c.drawCircle(cx, cy, outerR, p);
        fresh();
        p.setShader(new LinearGradient(0, cy - outerR, 0, cy + outerR, IpodColor.lighten(ring, 0.10f), IpodColor.darken(ring, 0.14f), Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, outerR, p);
        // raised outer edge: light on the top left, dark on the bottom right
        fresh();
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2.2f * dp);
        p.setShader(new LinearGradient(cx - outerR, cy - outerR, cx + outerR, cy + outerR,
                new int[]{0xA0FFFFFF, 0x10FFFFFF, 0x00000000, 0x70000000}, new float[]{0f, 0.45f, 0.55f, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, outerR - 1.1f * dp, p);

        // inner shadow where the center button sits
        fresh();
        float sh = innerR * 1.22f;
        p.setShader(new RadialGradient(cx, cy, sh, new int[]{0x8C000000, 0x8C000000, 0x00000000}, new float[]{0f, innerR / sh, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, sh, p);

        // convex center button with a specular highlight
        fresh();
        p.setShader(new RadialGradient(cx - innerR * 0.35f, cy - innerR * 0.45f, innerR * 1.6f,
                new int[]{IpodColor.lighten(hub, 0.26f), hub, IpodColor.darken(hub, 0.22f)}, new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, innerR, p);
        fresh();
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1.2f * dp);
        p.setColor(0x59000000);
        c.drawCircle(cx, cy, innerR, p);
        c.save();
        path.reset();
        path.addCircle(cx, cy, innerR - dp, Path.Direction.CW);
        c.clipPath(path);
        fresh();
        p.setShader(new LinearGradient(0, cy - innerR, 0, cy - innerR * 0.05f, 0x70FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
        oval.set(cx - innerR * 0.7f, cy - innerR * 0.98f, cx + innerR * 0.7f, cy - innerR * 0.12f);
        c.drawOval(oval, p);
        c.restore();

        // markings
        float mid = (outerR + innerR) / 2f, g = outerR * 0.075f;
        fresh();
        p.setColor(mark);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        p.setTextSize(outerR * 0.12f);
        if (controls) { drawArrows(c, mid, g); return; }
        c.drawText("MENU", cx, cy - mid + p.getTextSize() * 0.36f, p);
        // previous: bar + two triangles pointing left
        float lx = cx - mid;
        path.reset();
        path.moveTo(lx + g, cy - g); path.lineTo(lx - g * 0.2f, cy); path.lineTo(lx + g, cy + g); path.close();
        path.moveTo(lx + g * 2.2f, cy - g); path.lineTo(lx + g, cy); path.lineTo(lx + g * 2.2f, cy + g); path.close();
        c.drawPath(path, p);
        c.drawRect(lx - g * 0.7f, cy - g, lx - g * 0.2f, cy + g, p);
        // next: mirror
        float rx = cx + mid;
        path.reset();
        path.moveTo(rx - g, cy - g); path.lineTo(rx + g * 0.2f, cy); path.lineTo(rx - g, cy + g); path.close();
        path.moveTo(rx - g * 2.2f, cy - g); path.lineTo(rx - g, cy); path.lineTo(rx - g * 2.2f, cy + g); path.close();
        c.drawPath(path, p);
        c.drawRect(rx + g * 0.2f, cy - g, rx + g * 0.7f, cy + g, p);
        // play / pause at the bottom
        float by = cy + mid;
        path.reset();
        path.moveTo(cx - g * 2.2f, by - g); path.lineTo(cx - g * 0.8f, by); path.lineTo(cx - g * 2.2f, by + g); path.close();
        c.drawPath(path, p);
        c.drawRect(cx + g * 0.2f, by - g, cx + g * 0.7f, by + g, p);
        c.drawRect(cx + g * 1.1f, by - g, cx + g * 1.6f, by + g, p);
    }

    private void fresh() {
        p.reset();
        p.setAntiAlias(true);
        p.setStyle(Paint.Style.FILL);
    }

    /** Only blits the cached wheel; a pressed key adds one flat darkening on top (no gradients are created while drawing). */
    @Override protected void onDraw(Canvas c) {
        if (cache == null) return;
        c.drawBitmap(cache, 0, 0, null);
        if (zone >= 0) {
            float start = -135f + zone * 90f;
            path.reset();
            path.arcTo(outerRect, start, 90f, false);
            path.arcTo(innerRect, start + 90f, -90f, false);
            path.close();
            press.setColor(0x38000000);
            c.drawPath(path, press);
        }
        if (centerPressed) {
            press.setStyle(Paint.Style.FILL);
            press.setColor(0x33000000);
            c.drawCircle(cx, cy, innerR, press);
            press.setStyle(Paint.Style.STROKE);
            press.setStrokeWidth(innerR * 0.09f);
            press.setColor(0x59000000);   // inner shadow along the pressed button's edge
            c.drawCircle(cx, cy, innerR - innerR * 0.045f, press);
            press.setStyle(Paint.Style.FILL);
        }
    }

    /** Controls mode: four triangles pointing up, right, down, left. */
    private void drawArrows(Canvas c, float mid, float g) {
        float a = g * 1.5f;
        for (int k = 0; k < 4; k++) {
            float ax = cx + (k == 1 ? mid : k == 3 ? -mid : 0), ay = cy + (k == 0 ? -mid : k == 2 ? mid : 0);
            path.reset();
            if (k == 0) { path.moveTo(ax, ay - a); path.lineTo(ax - a, ay + a * 0.7f); path.lineTo(ax + a, ay + a * 0.7f); }
            else if (k == 1) { path.moveTo(ax + a, ay); path.lineTo(ax - a * 0.7f, ay - a); path.lineTo(ax - a * 0.7f, ay + a); }
            else if (k == 2) { path.moveTo(ax, ay + a); path.lineTo(ax - a, ay - a * 0.7f); path.lineTo(ax + a, ay - a * 0.7f); }
            else { path.moveTo(ax - a, ay); path.lineTo(ax + a * 0.7f, ay - a); path.lineTo(ax + a * 0.7f, ay + a); }
            path.close();
            c.drawPath(path, p);
        }
    }
}
