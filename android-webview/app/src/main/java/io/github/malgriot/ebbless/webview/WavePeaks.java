package io.github.malgriot.ebbless.webview;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.Process;

import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamExtractor;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * #727: a song's waveform on Android. NewPipe Extractor finds the song's smallest audio-only stream, it is downloaded
 * (never kept), decoded with the phone's own decoder at the lowest thread priority, and 64 peaks (0-255) go back to the
 * page. Two songs at a time at most; the audio itself is dropped as soon as the peaks are known.
 */
final class WavePeaks {
    interface Listener { void onPeaks(String videoId, int[] peaks); }

    static final int N = 64;
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0";
    private static boolean inited;

    private final ExecutorService pool = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(() -> { Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND); r.run(); }, "ebb-wave");
        t.setDaemon(true);
        return t;
    });
    private final java.util.Set<String> inFlight = java.util.Collections.synchronizedSet(new java.util.HashSet<>());
    private final Listener listener;

    WavePeaks(Listener l) { listener = l; }

    /** Starts one fetch; ignored when that song is already being worked on or the id is not a YouTube id. */
    void request(String videoId) {
        if (videoId == null || !ID.matcher(videoId).matches() || !inFlight.add(videoId)) return;
        pool.execute(() -> {
            try {
                int[] peaks = compute(videoId);
                if (peaks != null) listener.onPeaks(videoId, peaks);
            } catch (Throwable ignored) {
                // flat bars stay; the page also records while playing
            } finally {
                inFlight.remove(videoId);
            }
        });
    }

    private static synchronized void init() {
        if (inited) return;
        NewPipe.init(new Dl());
        inited = true;
    }

    private int[] compute(String videoId) throws Exception {
        init();
        StreamExtractor ex = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=" + videoId);
        ex.fetchPage();
        AudioStream best = null;
        List<AudioStream> all = ex.getAudioStreams();
        for (AudioStream a : all) {
            if (a == null || !a.isUrl() || a.getAverageBitrate() <= 0) continue;
            if (best == null || a.getAverageBitrate() < best.getAverageBitrate()) best = a;
        }
        if (best == null) return null;
        File f = File.createTempFile("wave", ".bin", appCache());
        try {
            download(best.getContent(), f);
            return decode(f);
        } finally {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    private static File cacheDir;
    static void setCacheDir(File d) { cacheDir = d; }
    private static File appCache() { return cacheDir; }

    private static void download(String url, File out) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", UA);
        c.setRequestProperty("Range", "bytes=0-");
        try (InputStream in = c.getInputStream(); FileOutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[32 * 1024];
            int n, total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_BYTES) throw new IOException("too large");
                o.write(buf, 0, n);
            }
        } finally {
            c.disconnect();
        }
    }

    /** Decodes the file and keeps the loudest sample of each of the song's 64 slices (scaled 0-255, then normalised). */
    private static int[] decode(File f) throws IOException {
        MediaExtractor mx = new MediaExtractor();
        MediaCodec codec = null;
        try {
            mx.setDataSource(f.getAbsolutePath());
            int track = -1;
            MediaFormat fmt = null;
            for (int i = 0; i < mx.getTrackCount(); i++) {
                MediaFormat tf = mx.getTrackFormat(i);
                String mime = tf.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) { track = i; fmt = tf; break; }
            }
            if (track < 0 || fmt == null || !fmt.containsKey(MediaFormat.KEY_DURATION)) return null;
            long durUs = fmt.getLong(MediaFormat.KEY_DURATION);
            if (durUs <= 0) return null;
            mx.selectTrack(track);
            codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
            codec.configure(fmt, null, null, 0);
            codec.start();
            float[] peaks = new float[N];
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inDone = false, outDone = false;
            while (!outDone) {
                if (!inDone) {
                    int ii = codec.dequeueInputBuffer(10000);
                    if (ii >= 0) {
                        ByteBuffer ib = codec.getInputBuffer(ii);
                        int sz = ib == null ? -1 : mx.readSampleData(ib, 0);
                        if (sz < 0) { codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true; }
                        else { codec.queueInputBuffer(ii, 0, sz, mx.getSampleTime(), 0); mx.advance(); }
                    }
                }
                int oi = codec.dequeueOutputBuffer(info, 10000);
                if (oi >= 0) {
                    ByteBuffer ob = codec.getOutputBuffer(oi);
                    if (ob != null && info.size > 0) {
                        int slot = (int) Math.min(N - 1, Math.max(0, info.presentationTimeUs * N / durUs));
                        ob.position(info.offset);
                        ob.limit(info.offset + info.size);
                        java.nio.ShortBuffer sb = ob.order(java.nio.ByteOrder.nativeOrder()).asShortBuffer();
                        float m = peaks[slot];
                        for (int i = 0; i < sb.remaining(); i += 8) { // every 8th sample is plenty for a peak, and cheaper
                            float v = Math.abs(sb.get(sb.position() + i)) / 32768f;
                            if (v > m) m = v;
                        }
                        peaks[slot] = m;
                    }
                    codec.releaseOutputBuffer(oi, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                }
            }
            float top = 0;
            for (float p : peaks) if (p > top) top = p;
            if (top <= 0) return null;
            int[] out = new int[N];
            for (int i = 0; i < N; i++) out[i] = Math.round(peaks[i] / top * 255f);
            return out;
        } finally {
            try { if (codec != null) { codec.stop(); codec.release(); } } catch (Exception ignored) { }
            mx.release();
        }
    }

    /** NewPipe Extractor's HTTP hook: plain HttpURLConnection, GET and POST. */
    private static final class Dl extends Downloader {
        @Override public Response execute(Request req) throws IOException, ReCaptchaException {
            HttpURLConnection c = (HttpURLConnection) new URL(req.url()).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestMethod(req.httpMethod());
            c.setRequestProperty("User-Agent", UA);
            for (Map.Entry<String, List<String>> h : req.headers().entrySet()) {
                c.setRequestProperty(h.getKey(), null);
                for (String v : h.getValue()) c.addRequestProperty(h.getKey(), v);
            }
            byte[] body = req.dataToSend();
            if (body != null) {
                c.setDoOutput(true);
                c.getOutputStream().write(body);
            }
            int code = c.getResponseCode();
            if (code == 429) throw new ReCaptchaException("rate limited", req.url());
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
            }
            Map<String, List<String>> heads = new java.util.HashMap<>();
            for (Map.Entry<String, List<String>> h : c.getHeaderFields().entrySet()) if (h.getKey() != null) heads.put(h.getKey(), h.getValue());   // the status line comes back under a null key
            return new Response(code, c.getResponseMessage(), heads, bo.toString("UTF-8"), c.getURL().toString());
        }
    }
}
