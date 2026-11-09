package tv.topo.topotv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Graba en segundo plano el stream HTTP del motor AceStream (/ace/getstream?id=HASH) a un .ts en Películas/TOPOTV.
 * Si un enlace no da datos o se corta, prueba el siguiente mientras dure la ventana de grabación.
 */
public class RecorderService extends Service {
    static final String EXTRA_ID = "id";
    static final String ACTION_STOP = "tv.topo.topotv.REC_STOP";
    private static final String CHANNEL = "topotv_recording";
    private static final int NOTIF_ID = 4107;
    private static final int FIRST_DATA_MS = 60000;
    private static final int PROBE_MS = 25000;                    // espera de datos de cada enlace al comprobarlo
    private static final long RECHECK_MS = 5 * 60 * 1000L;       // una comprobación más vieja se repite al empezar
    private static final long MIN_FREE = 400L * 1024 * 1024;      // con menos espacio libre se para para no llenar el móvil
    private static final Map<String, Worker> RUNNING = new ConcurrentHashMap<>();

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String id = intent == null ? null : intent.getStringExtra(EXTRA_ID);
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            Worker w = id == null ? null : RUNNING.get(id);
            if (w != null) w.stopNow(true);
            if (RUNNING.isEmpty()) stopSelf();
            return START_NOT_STICKY;
        }
        JSONObject rec = id == null ? null : RecordingStore.find(this, id);
        startForegroundCompat(rec == null ? "TOPOTV" : rec.optString("title", "TOPOTV"));
        if (rec == null || RUNNING.containsKey(id)) {
            if (RUNNING.isEmpty()) stopSelf();
            return START_NOT_STICKY;
        }
        Worker w = new Worker(id);
        RUNNING.put(id, w);
        w.start();
        return START_NOT_STICKY;
    }

    private void startForegroundCompat(String title) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Grabaciones", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setContentTitle("Grabando: " + title).setContentText("TOPOTV está guardando el evento").setSmallIcon(android.R.drawable.ic_media_play).setOngoing(true);
        if (pi != null) b.setContentIntent(pi);
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIF_ID, n);
    }

    static boolean isRunning(String id) { return RUNNING.containsKey(id); }

    static boolean anyRunning() { return !RUNNING.isEmpty(); }

    /** Espacio libre del almacenamiento (bytes; -1 si no se sabe). */
    static long freeBytes() {
        try { return new android.os.StatFs(Environment.getExternalStorageDirectory().getPath()).getAvailableBytes(); }
        catch (Exception e) { return -1; }
    }

    static void requestStop(Context c, String id) {
        Worker w = RUNNING.get(id);
        if (w != null) w.stopNow(true);
    }

    private static String safeName(String s) {
        String t = (s == null ? "evento" : s).replaceAll("[^A-Za-z0-9 _-]+", " ").replaceAll("\\s+", " ").trim();
        if (t.isEmpty()) t = "evento";
        return t.length() > 60 ? t.substring(0, 60) : t;
    }

    private class Worker extends Thread {
        private final String id;
        private volatile boolean stopped = false;
        private volatile boolean byUser = false;
        private volatile HttpURLConnection conn;

        Worker(String id) { this.id = id; setName("topotv-rec-" + id); }

        void stopNow(boolean user) {
            stopped = true;
            if (user) byUser = true;
            try { HttpURLConnection c = conn; if (c != null) c.disconnect(); } catch (Exception ignored) { }
        }

        @Override
        public void run() {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            PowerManager.WakeLock lock = pm == null ? null : pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "topotv:rec");
            if (lock != null) lock.acquire(9 * 3600 * 1000L);
            Uri uri = null;
            File file = null;
            OutputStream out = null;
            long bytes = 0;
            String error = "";
            try {
                JSONObject rec = RecordingStore.find(RecorderService.this, id);
                if (rec == null) return;
                long end = rec.optLong("end");
                String host = rec.optString("host", "127.0.0.1");
                int port = rec.optInt("port", 6878);
                JSONArray hashes = rec.optJSONArray("hashes");
                if (hashes == null || hashes.length() == 0) { error = "El evento no tiene enlaces."; return; }

                // antes de grabar: se elige el enlace que funciona (si no hay comprobación, es vieja o no encontró ninguno, se repite)
                JSONObject chk = rec.optJSONObject("check");
                if (chk == null || !chk.optBoolean("ok") || System.currentTimeMillis() - chk.optLong("at") > RECHECK_MS) {
                    LinkProbe.preflight(RecorderService.this, id, PROBE_MS, () -> stopped);
                    JSONObject fresh = RecordingStore.find(RecorderService.this, id);
                    if (fresh != null && fresh.optJSONArray("hashes") != null) hashes = fresh.optJSONArray("hashes");
                }
                if (stopped) return;

                String name = safeName(rec.optString("title")) + " " + new SimpleDateFormat("yyyy-MM-dd HHmm", Locale.US).format(new Date(rec.optLong("start"))) + ".ts";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "video/mp2t");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/TOPOTV");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    uri = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) { error = "No se pudo crear el archivo en Películas."; return; }
                    out = getContentResolver().openOutputStream(uri);
                } else {
                    File dir = new File(getExternalFilesDir(Environment.DIRECTORY_MOVIES), "TOPOTV");
                    dir.mkdirs();
                    file = new File(dir, name);
                    out = new FileOutputStream(file, true);
                    uri = Uri.fromFile(file);
                }
                if (out == null) { error = "No se pudo abrir el archivo de destino."; return; }
                JSONObject patch = new JSONObject();
                patch.put("status", "recording"); patch.put("uri", uri.toString()); patch.put("name", name); patch.put("bytes", 0); patch.put("error", "");
                RecordingStore.update(RecorderService.this, id, patch);

                byte[] buf = new byte[64 * 1024];
                int hashIdx = 0, emptyRounds = 0;
                long lastSave = 0, lastDisk = 0;
                while (!stopped && System.currentTimeMillis() < end) {
                    long before = bytes;
                    String hash = hashes.optString(hashIdx % hashes.length());
                    HttpURLConnection c = null;
                    try {
                        c = (HttpURLConnection) new URL("http://" + host + ":" + port + "/ace/getstream?id=" + hash).openConnection();
                        conn = c;
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(FIRST_DATA_MS);
                        if (c.getResponseCode() == 200) {
                            InputStream in = c.getInputStream();
                            int n;
                            while (!stopped && System.currentTimeMillis() < end && (n = in.read(buf)) > 0) {
                                out.write(buf, 0, n);
                                bytes += n;
                                c.setReadTimeout(30000);
                                long now = System.currentTimeMillis();
                                if (now - lastDisk > 10000) {
                                    lastDisk = now;
                                    long free = freeBytes();
                                    if (free >= 0 && free < MIN_FREE) { error = "Almacenamiento casi lleno: grabación detenida para no llenar el móvil."; stopped = true; break; }
                                }
                                if (now - lastSave > 3000) {
                                    lastSave = now;
                                    JSONObject p = new JSONObject(); p.put("bytes", bytes);
                                    RecordingStore.update(RecorderService.this, id, p);
                                }
                            }
                        }
                    } catch (Exception ignored) {
                        // sin datos o corte: se pasa al siguiente enlace
                    } finally {
                        conn = null;
                        if (c != null) { try { c.disconnect(); } catch (Exception ignored) { } }
                    }
                    if (stopped || System.currentTimeMillis() >= end) break;
                    if (bytes == before) { hashIdx++; emptyRounds++; } else emptyRounds = 0;
                    try { Thread.sleep(emptyRounds > hashes.length() ? 15000 : 3000); } catch (InterruptedException e) { break; }
                }
            } catch (Exception e) {
                error = e.getMessage() == null ? "Error al grabar." : e.getMessage();
            } finally {
                try { if (out != null) out.close(); } catch (Exception ignored) { }
                try {
                    JSONObject p = new JSONObject();
                    p.put("bytes", bytes);
                    if (bytes > 0) {
                        p.put("status", "done");
                        if (!error.isEmpty()) p.put("error", error);
                        if (uri != null && Build.VERSION.SDK_INT >= 29) {
                            ContentValues v = new ContentValues(); v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                            getContentResolver().update(uri, v, null, null);
                        }
                    } else {
                        p.put("status", byUser ? "cancelled" : "failed");
                        p.put("error", byUser ? "" : (error.isEmpty() ? "No llegaron datos del motor AceStream (¿está encendido y el canal emite?)." : error));
                        p.put("uri", "");
                        if (uri != null) {
                            if (Build.VERSION.SDK_INT >= 29) getContentResolver().delete(uri, null, null);
                            else if (file != null) file.delete();
                        }
                    }
                    RecordingStore.update(RecorderService.this, id, p);
                } catch (Exception ignored) { }
                if (lock != null && lock.isHeld()) lock.release();
                RUNNING.remove(id);
                if (RUNNING.isEmpty()) {
                    stopForeground(true);
                    stopSelf();
                }
            }
        }
    }
}
