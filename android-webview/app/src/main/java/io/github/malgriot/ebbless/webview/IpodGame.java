package io.github.malgriot.ebbless.webview;

import android.graphics.Canvas;
import android.graphics.RectF;

/**
 * Contract between the iPod player (FullScreenPlayerActivity's iPod mode) and a game drawn on the iPod screen.
 * The host calls update(dt) then draw() at no more than ~30 fps, and only while the game is visible with the screen on.
 */
interface IpodGame {
    /** Directions for arrows (controls) mode, see onDirection. */
    int DIR_UP = 0, DIR_RIGHT = 1, DIR_DOWN = 2, DIR_LEFT = 3;

    /**
     * Arrows mode (the wheel turns into an arrow pad while a game runs): one press of an arrow. Games should override
     * this with real 4-way controls (snake: absolute heading, tetris: left/right/rotate/soft drop, match: cursor
     * up/down/left/right). The default maps left/up to a counter-clockwise step and right/down to a clockwise step so a
     * game that only knows the wheel still works.
     */
    default void onDirection(int dir) { onRotate(dir == DIR_LEFT || dir == DIR_UP ? -1 : 1); }

    /** The host hands the game its celebration hook before start(). Games call fx.achievement(...) when something good happens. */
    default void setFx(IpodFx fx) { }

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
