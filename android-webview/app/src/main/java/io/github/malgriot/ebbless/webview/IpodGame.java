package io.github.malgriot.ebbless.webview;

import android.graphics.Canvas;
import android.graphics.RectF;

/**
 * Contract between the iPod player (FullScreenPlayerActivity's iPod mode) and a game drawn on the iPod screen.
 * The host calls update(dt) then draw() at no more than ~30 fps, and only while the game is visible with the screen on.
 */
interface IpodGame {
    void start();
    void stop();
    /** Advance the game by dtMs milliseconds (the host clamps long gaps). */
    void update(long dtMs);
    /** Draw into the iPod screen rectangle (canvas coordinates of the screen view). */
    void draw(Canvas c, RectF screen);
    /** Click wheel turned: +1 per step clockwise, -1 counter-clockwise. */
    void onRotate(int steps);
    /** Center button. */
    void onCenter();
    /** Menu pressed. Return true if the game consumed it (e.g. pause), false to exit to the games list. */
    boolean onMenu();
    String title();
    int score();
}
