package tv.topo.topotv;

import androidx.appcompat.app.AppCompatActivity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.cast.CastPlayer;
import androidx.media3.cast.SessionAvailabilityListener;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.mediarouter.app.MediaRouteButton;
import com.google.android.gms.cast.framework.CastButtonFactory;
import com.google.android.gms.cast.framework.CastContext;
import androidx.media3.common.Player;
import androidx.media3.common.C;
import androidx.media3.common.Timeline;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Reproductor integrado de TOPOTV (Media3 / ExoPlayer): pantalla completa, imagen en imagen, selector de audio y
 * subtítulos (engranaje), reanudar por posición y aviso real de error para que la app salte al siguiente enlace.
 * Al cerrarse devuelve {position, duration, ended, error}.
 */
public class PlayerActivity extends AppCompatActivity {
    static final String EXTRA_URL = "url", EXTRA_TITLE = "title", EXTRA_POS = "position", EXTRA_SUBS = "subs", EXTRA_MIME = "mime", EXTRA_RECONNECT = "reconnect";

    private ExoPlayer player;
    private CastPlayer castPlayer;       // Chromecast (null si el móvil no tiene Google Play Services)
    private MediaItem exoItem, castItem;
    private PlayerView view;
    private LinearLayout topBar;
    private boolean ended = false;
    private String error = "";
    private boolean resultSent = false;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int sleepIdx = 0;
    private Runnable sleepRun;
    private static final int[] SLEEP_MIN = { 0, 15, 30, 60 };
    /* Cortes: si el canal ya se estaba viendo, se reconecta solo durante «reconnectSec» (antes se cerraba al primer
       error y la app saltaba a otro enlace). Solo se cambia de enlace si no llega a arrancar. */
    private boolean started = false, wantNext = false;
    private long cutSince = 0;
    private int retries = 0, reconnectSec = 180;
    private LinearLayout cutBox;
    private TextView cutText;
    private Runnable retryRun, cutTick, watchRun;
    private long lastAbs = 0;
    private boolean hasLast = false;
    private int frozenTicks = 0;
    private final Timeline.Window tw = new Timeline.Window();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setKeepScreenOn(true);
        view.setShowNextButton(false);        // es un solo vídeo: sin «siguiente» ni «anterior»
        view.setShowPreviousButton(false);
        root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(0x99000000);
        int pad = dp(14);
        topBar.setPadding(pad, dp(10) + statusBarPad(), pad, dp(10));
        TextView back = label("‹  Volver");
        back.setOnClickListener(v -> finish());
        TextView title = label(getIntent().getStringExtra(EXTRA_TITLE));
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tp.setMargins(dp(14), 0, dp(14), 0);
        topBar.addView(back);
        topBar.addView(title, tp);
        TextView sleep = label("Dormir");
        sleep.setOnClickListener(v -> cycleSleep((TextView) v));
        topBar.addView(sleep);
        if (pipSupported()) {
            TextView pip = label("PiP");
            pip.setOnClickListener(v -> enterPip());
            topBar.addView(pip);
        }
        root.addView(topBar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        cutBox = new LinearLayout(this);
        cutBox.setOrientation(LinearLayout.VERTICAL);
        cutBox.setGravity(Gravity.CENTER_HORIZONTAL);
        cutBox.setBackgroundColor(0xCC000000);
        cutBox.setPadding(dp(18), dp(14), dp(18), dp(14));
        cutText = label("Se ha cortado. Reconectando…");
        cutText.setGravity(Gravity.CENTER);
        TextView other = label("Probar otro enlace");
        other.setBackgroundColor(0x33FFFFFF);
        other.setOnClickListener(v -> { wantNext = true; finish(); });
        LinearLayout.LayoutParams op = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        op.setMargins(0, dp(10), 0, 0);
        // ancho propio: si no, se ajusta al del botón y se pierde «Reconectando… 0:42»
        cutBox.addView(cutText, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        cutBox.addView(other, op);
        cutBox.setVisibility(View.GONE);
        root.addView(cutBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) v -> topBar.setVisibility(v == View.VISIBLE ? View.VISIBLE : View.GONE));
        setContentView(root);
        start();
    }

    private TextView label(String text) {
        TextView t = new TextView(this);
        t.setText(text == null ? "" : text);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setPadding(dp(8), dp(6), dp(8), dp(6));
        t.setFocusable(true);
        return t;
    }

    private int dp(int v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private int statusBarPad() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) / 2 : 0;
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void start() {
        Intent in = getIntent();
        String url = in.getStringExtra(EXTRA_URL);
        if (url == null || url.isEmpty()) { error = "Sin dirección"; finish(); return; }
        reconnectSec = in.getIntExtra(EXTRA_RECONNECT, 180);
        MediaItem.Builder b = new MediaItem.Builder().setUri(Uri.parse(url))
            .setLiveConfiguration(new MediaItem.LiveConfiguration.Builder().setTargetOffsetMs(15_000).build());
        String mime = in.getStringExtra(EXTRA_MIME);
        if (mime != null && !mime.isEmpty()) b.setMimeType(mime);
        else if (url.contains("/ace/getstream")) b.setMimeType(MimeTypes.VIDEO_MP2T);   // el motor sirve MPEG-TS sin extensión
        List<MediaItem.SubtitleConfiguration> subs = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(in.getStringExtra(EXTRA_SUBS));
            for (int i = 0; i < arr.length() && i < 8; i++) {
                JSONObject o = arr.getJSONObject(i);
                String su = o.optString("url");
                if (!su.startsWith("http")) continue;
                String lower = su.toLowerCase(Locale.ROOT);
                String sm = lower.contains(".vtt") ? MimeTypes.TEXT_VTT : lower.contains(".ass") ? MimeTypes.TEXT_SSA : MimeTypes.APPLICATION_SUBRIP;
                subs.add(new MediaItem.SubtitleConfiguration.Builder(Uri.parse(su)).setMimeType(sm).setLanguage(o.optString("lang", null)).build());
            }
        } catch (Exception ignored) { /* sin subtítulos */ }
        if (!subs.isEmpty()) b.setSubtitleConfigurations(subs);
        exoItem = b.build();
        castItem = castItemFor(url, in.getStringExtra(EXTRA_TITLE));
        setupCast(url);

        DefaultLoadControl load = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(30_000, 60_000, 2_500, 8_000)   // tras un parón, espera 8 s de reserva antes de seguir
            .build();
        player = new ExoPlayer.Builder(this)
            .setLoadControl(load)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(this).setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(12)))
            .build();
        view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        view.setPlayer(player);
        player.setMediaItem(exoItem);
        long pos = in.getLongExtra(EXTRA_POS, 0);
        if (pos > 0) player.seekTo(pos);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                error = e.getErrorCodeName() + (e.getMessage() == null ? "" : ": " + e.getMessage());
                // se quedó atrás del directo: se vuelve al directo sin más
                if (e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) { player.seekToDefaultPosition(); player.prepare(); return; }
                // no llegó a arrancar (o el usuario prefiere cambiar): la app prueba el siguiente enlace
                if (!started || reconnectSec <= 0) { finish(); return; }
                // se cortó mientras se veía: se reconecta solo, cada vez con algo más de espera
                if (cutSince == 0) { cutSince = System.currentTimeMillis(); startCutTick(); }
                if (System.currentTimeMillis() - cutSince >= reconnectSec * 1000L) { finish(); return; }
                long delay = Math.min(10_000L, 2_000L * (1 + retries++));
                if (retryRun != null) handler.removeCallbacks(retryRun);
                // se sigue desde donde iba (sin volver a ver lo ya visto); si mientras tanto el directo ha avanzado
                // demasiado, llega ERROR_CODE_BEHIND_LIVE_WINDOW y se salta al directo
                retryRun = () -> { if (player != null) { player.prepare(); player.setPlayWhenReady(true); } };
                handler.postDelayed(retryRun, delay);
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) { started = true; if (!player.isCurrentMediaItemLive()) clearCut(); }   // en directo lo quita el vigilante al ver que avanza
                if (state == Player.STATE_ENDED) { ended = true; finish(); }
            }
        });
        player.prepare();
        player.setPlayWhenReady(true);
        startWatch();
    }

    /** Aviso «Se ha cortado. Reconectando… 0:42» mientras dura el corte */
    private void startCutTick() {
        cutBox.setVisibility(View.VISIBLE);
        if (cutTick != null) handler.removeCallbacks(cutTick);
        cutTick = new Runnable() {
            @Override public void run() {
                if (cutSince == 0) return;
                long s = (System.currentTimeMillis() - cutSince) / 1000;
                cutText.setText(String.format(Locale.ROOT, "Se ha cortado. Reconectando… %d:%02d", s / 60, s % 60));
                if (s >= reconnectSec) { if (error.isEmpty()) error = "ERROR_CODE_TIMEOUT: sin señal"; finish(); return; }
                handler.postDelayed(this, 1000);
            }
        };
        handler.post(cutTick);
    }
    /** Vigilante del directo (cada 2 s): mira si la imagen avanza de verdad. A veces el reproductor dice «listo» o
     *  «cargando» pero se queda congelado en la última imagen sin pedir más vídeo.
     *  - 12 s sin avanzar: aviso «Se ha cortado. Reconectando…».
     *  - Sin avanzar y con vídeo nuevo por delante (el motor ya vuelve a dar señal): salta al directo.
     *  Mientras el motor no da nada nuevo no se mueve de sitio (así no se repiten los últimos segundos). */
    private void startWatch() {
        watchRun = new Runnable() {
            @Override public void run() {
                handler.postDelayed(this, 2000);
                if (player == null || !started || reconnectSec <= 0 || !player.getPlayWhenReady() || !player.isCurrentMediaItemLive()) { frozenTicks = 0; hasLast = false; return; }
                Timeline t = player.getCurrentTimeline();
                if (t.isEmpty()) return;
                t.getWindow(player.getCurrentMediaItemIndex(), tw);
                long start = tw.getPositionInFirstPeriodMs();
                long abs = start + player.getCurrentPosition();
                long end = tw.durationUs == C.TIME_UNSET ? abs : start + tw.getDurationMs();
                boolean first = !hasLast, moving = hasLast && abs - lastAbs >= 500;
                lastAbs = abs; hasLast = true;                if (moving) { frozenTicks = 0; if (cutSince != 0 && player.getPlaybackState() == Player.STATE_READY) clearCut(); return; }
                if (first) return;
                frozenTicks++;
                if (frozenTicks >= 6 && cutSince == 0) { cutSince = System.currentTimeMillis(); startCutTick(); }
                if (frozenTicks >= 4 && end - abs > 4000 && !player.isLoading()) {
                    int st = player.getPlaybackState();
                    player.seekToDefaultPosition();
                    if (st == Player.STATE_IDLE) player.prepare();
                    player.setPlayWhenReady(true);
                    frozenTicks = 0; hasLast = false;
                }
            }
        };
        handler.postDelayed(watchRun, 2000);
    }
    private void clearCut() {
        cutSince = 0; retries = 0; error = "";
        if (cutTick != null) handler.removeCallbacks(cutTick);
        if (retryRun != null) handler.removeCallbacks(retryRun);
        if (cutBox != null) cutBox.setVisibility(View.GONE);
    }

    /** Temporizador de apagado: cada pulsación pasa a 15, 30, 60 min o lo quita; al cumplirse pausa y cierra. */
    private void cycleSleep(TextView label) {
        if (sleepRun != null) handler.removeCallbacks(sleepRun);
        sleepIdx = (sleepIdx + 1) % SLEEP_MIN.length;
        int min = SLEEP_MIN[sleepIdx];
        label.setText(min == 0 ? "Dormir" : "Dormir " + min + " min");
        if (min > 0) {
            sleepRun = () -> { if (player != null) player.pause(); finish(); };
            handler.postDelayed(sleepRun, min * 60_000L);
        }
    }

    private static boolean isLocalUrl(String url) {
        try { String h = Uri.parse(url).getHost(); return h == null || h.equals("localhost") || h.startsWith("127.") || h.equals("0.0.0.0"); }
        catch (Exception e) { return true; }
    }

    /** El receptor de Chromecast necesita saber el tipo de contenido. */
    private MediaItem castItemFor(String url, String title) {
        String lower = url.toLowerCase(Locale.ROOT);
        String mime = lower.contains(".m3u8") ? MimeTypes.APPLICATION_M3U8 : lower.contains(".webm") ? MimeTypes.VIDEO_WEBM : lower.contains(".ts") ? MimeTypes.VIDEO_MP2T : MimeTypes.VIDEO_MP4;
        return new MediaItem.Builder().setUri(Uri.parse(url)).setMimeType(mime)
            .setMediaMetadata(new MediaMetadata.Builder().setTitle(title == null ? "TOPOTV" : title).build()).build();
    }

    /**
     * Botón de Chromecast. Solo para enlaces de internet: la tele no puede abrir una dirección que solo existe en este móvil
     * (p. ej. el motor AceStream en 127.0.0.1). Si no hay Google Play Services, simplemente no aparece.
     */
    private void setupCast(String url) {
        if (isLocalUrl(url)) return;
        try {
            CastContext ctx = CastContext.getSharedInstance(this);
            MediaRouteButton btn = new MediaRouteButton(this);
            CastButtonFactory.setUpMediaRouteButton(this, btn);
            topBar.addView(btn, new LinearLayout.LayoutParams(dp(40), dp(40)));
            castPlayer = new CastPlayer(ctx);
            castPlayer.setSessionAvailabilityListener(new SessionAvailabilityListener() {
                @Override public void onCastSessionAvailable() { moveTo(castPlayer, castItem); }
                @Override public void onCastSessionUnavailable() { moveTo(player, exoItem); }
            });
        } catch (Throwable t) {
            castPlayer = null;   // sin Cast: el reproductor sigue funcionando igual
        }
    }

    /** Pasa la reproducción entre el móvil y la tele, conservando la posición. */
    private void moveTo(androidx.media3.common.Player target, MediaItem item) {
        androidx.media3.common.Player from = view.getPlayer();
        if (target == null || from == target) return;
        long pos = from == null ? 0 : Math.max(0, from.getCurrentPosition());
        boolean play = from == null || from.getPlayWhenReady();
        if (from != null) from.stop();
        view.setPlayer(target);
        target.setMediaItem(item, pos);
        target.prepare();
        target.setPlayWhenReady(play);
    }

    private boolean pipSupported() {
        return Build.VERSION.SDK_INT >= 26 && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private void enterPip() {
        if (!pipSupported()) return;
        try { enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build()); }
        catch (Exception ignored) { /* el sistema no lo permite ahora */ }
    }

    @Override protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (player != null && player.isPlaying()) enterPip();   // al pulsar Inicio, el vídeo sigue en una ventana pequeña
    }

    @Override public void onPictureInPictureModeChanged(boolean inPip, Configuration cfg) {
        super.onPictureInPictureModeChanged(inPip, cfg);
        view.setUseController(!inPip);
        if (inPip) topBar.setVisibility(View.GONE);
    }

    @Override protected void onStop() {
        super.onStop();
        // fuera de la imagen en imagen, al salir de la pantalla se pausa; en PiP sigue
        boolean pip = Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode();
        if (player != null && !pip) player.pause();
    }

    @Override public void finish() {
        if (!resultSent) {
            resultSent = true;
            Intent r = new Intent();
            androidx.media3.common.Player active = view != null && view.getPlayer() != null ? view.getPlayer() : player;
            long d = active == null ? 0 : active.getDuration();
            r.putExtra("position", active == null ? 0L : active.getCurrentPosition());
            r.putExtra("duration", d < 0 ? 0L : d);
            r.putExtra("ended", ended);
            r.putExtra("error", error);
            r.putExtra("started", started);
            r.putExtra("next", wantNext);
            setResult(RESULT_OK, r);
        }
        super.finish();
    }

    @Override protected void onDestroy() {
        if (sleepRun != null) handler.removeCallbacks(sleepRun);
        if (cutTick != null) handler.removeCallbacks(cutTick);
        if (retryRun != null) handler.removeCallbacks(retryRun);
        if (watchRun != null) handler.removeCallbacks(watchRun);
        if (castPlayer != null) { castPlayer.setSessionAvailabilityListener(null); castPlayer.release(); castPlayer = null; }
        if (player != null) { player.release(); player = null; }
        super.onDestroy();
    }
}
