package tv.topo.topotv;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.content.SharedPreferences;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.regex.Pattern;

/**
 * Grabación programada de eventos en Android. Las alarmas usan setAlarmClock (exacta, sin permisos
 * especiales y con permiso para iniciar el servicio en segundo plano); la grabación la hace RecorderService.
 */
@CapacitorPlugin(name = "Recorder")
public class RecorderPlugin extends Plugin {
    private static final Pattern HASH = Pattern.compile("^[0-9a-fA-F]{40}$");
    private static final long MAX_MS = 8L * 3600 * 1000;

    /* ── alarmas ────────────────────────────────────────────────── */
    private static PendingIntent alarmIntent(Context c, String id) {
        Intent i = new Intent(c, RecorderReceiver.class).setAction(RecorderReceiver.ACTION_START).putExtra("id", id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void arm(Context c, JSONObject rec) {
        String id = rec.optString("id");
        long start = rec.optLong("start");
        if (start <= System.currentTimeMillis()) { RecorderReceiver.startRecording(c, id); return; }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent show = PendingIntent.getActivity(c, 0, open == null ? new Intent() : open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        am.setAlarmClock(new AlarmManager.AlarmClockInfo(start, show), alarmIntent(c, id));
    }

    private static void disarm(Context c, String id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(c, id));
    }

    static void rearmAll(Context c) {
        JSONArray list = RecordingStore.all(c);
        long now = System.currentTimeMillis();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null && "scheduled".equals(r.optString("status")) && r.optLong("end") > now) arm(c, r);
        }
    }

    /* ── estado coherente al listar ─────────────────────────────── */
    private JSONObject pub(JSONObject r) throws Exception {
        JSONObject o = new JSONObject();
        o.put("id", r.optString("id")); o.put("key", r.optString("key")); o.put("title", r.optString("title")); o.put("sport", r.optString("sport"));
        o.put("start", r.optLong("start")); o.put("end", r.optLong("end")); o.put("status", r.optString("status"));
        o.put("file", r.optString("name")); o.put("bytes", r.optLong("bytes")); o.put("error", r.optString("error"));
        JSONArray h = r.optJSONArray("hashes"); o.put("linkCount", h == null ? 0 : h.length());
        JSONObject check = r.optJSONObject("check"); if (check != null) o.put("check", check);
        return o;
    }

    private void normalize(Context c) {
        JSONArray list = RecordingStore.all(c);
        long now = System.currentTimeMillis();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) continue;
            String id = r.optString("id"), st = r.optString("status");
            try {
                JSONObject p = new JSONObject();
                if ("scheduled".equals(st) && now >= r.optLong("end")) {
                    p.put("status", "missed"); p.put("error", "El móvil estaba apagado o Android no dejó iniciar la grabación a la hora del evento.");
                } else if ("recording".equals(st) && !RecorderService.isRunning(id)) {
                    p.put("status", r.optLong("bytes") > 0 ? "done" : "failed");   // el proceso murió a medias
                } else continue;
                RecordingStore.update(c, id, p);
            } catch (Exception ignored) { }
        }
    }

    private static void deleteFile(Context c, JSONObject rec) {
        String uri = rec.optString("uri");
        if (uri.isEmpty()) return;
        try {
            Uri u = Uri.parse(uri);
            if (ContentResolver.SCHEME_CONTENT.equals(u.getScheme())) c.getContentResolver().delete(u, null, null);
            else if (u.getPath() != null) new File(u.getPath()).delete();
        } catch (Exception ignored) { }
    }

    private static SharedPreferences settings(Context c) { return c.getApplicationContext().getSharedPreferences("topotv_rec_settings", Context.MODE_PRIVATE); }

    /** Borra las grabaciones terminadas más viejas que los días elegidos (0 = nunca). */
    private static void prune(Context c) {
        int days = settings(c).getInt("retentionDays", 0);
        if (days <= 0) return;
        long limit = System.currentTimeMillis() - days * 86400000L;
        JSONArray list = RecordingStore.all(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null || r.optLong("end") >= limit) continue;
            String st = r.optString("status");
            if ("done".equals(st) || "failed".equals(st) || "cancelled".equals(st) || "missed".equals(st)) {
                deleteFile(c, r);
                RecordingStore.remove(c, r.optString("id"));
            }
        }
    }

    /* ── API para la web ────────────────────────────────────────── */
    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("freeBytes", RecorderService.freeBytes());
        ret.put("retentionDays", settings(getContext()).getInt("retentionDays", 0));
        call.resolve(ret);
    }

    @PluginMethod
    public void setRetention(PluginCall call) {
        int days = Math.max(0, Math.min(365, call.getInt("days", 0)));
        settings(getContext()).edit().putInt("retentionDays", days).apply();
        prune(getContext());
        JSObject ret = new JSObject();
        ret.put("retentionDays", days);
        call.resolve(ret);
    }

    /** Comprobación previa de los enlaces de una grabación programada (la app abierta, unos minutos antes). */
    @PluginMethod
    public void precheck(final PluginCall call) {
        final String id = call.getString("id", "");
        if (RecorderService.anyRunning()) { call.resolve(new JSObject().put("skipped", true)); return; }
        new Thread(() -> {
            JSONObject check = LinkProbe.preflight(getContext(), id, 25000, RecorderService::anyRunning);
            try { call.resolve(check == null ? new JSObject().put("skipped", true) : JSObject.fromJSONObject(check)); }
            catch (Exception e) { call.resolve(new JSObject().put("skipped", true)); }
        }, "topotv-precheck").start();
    }

    /** ¿Da datos este enlace? (para el comprobador de enlaces en segundo plano). */
    @PluginMethod
    public void probe(final PluginCall call) {
        final String host = call.getString("host", "127.0.0.1");
        final int port = call.getInt("port", 6878);
        final String hash = call.getString("hash", "");
        final int timeout = Math.max(3000, Math.min(60000, call.getInt("timeoutMs", 15000)));
        if (!HASH.matcher(hash).matches() || !("127.0.0.1".equals(host) || "localhost".equals(host))) { call.reject("Enlace no válido."); return; }
        new Thread(() -> {
            boolean ok = LinkProbe.probe(host, port, hash, timeout);
            call.resolve(new JSObject().put("ok", ok));
        }, "topotv-probe").start();
    }

    @PluginMethod
    public void list(PluginCall call) {
        try {
            Context c = getContext();
            normalize(c);
            prune(c);
            JSONArray src = RecordingStore.all(c);
            JSArray out = new JSArray();
            for (int i = src.length() - 1; i >= 0; i--) out.put(pub(src.getJSONObject(i)));
            JSObject ret = new JSObject();
            ret.put("recordings", out);
            ret.put("dir", "Películas/TOPOTV");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo leer la lista: " + e.getMessage());
        }
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            long start = call.getData().getLong("start"), end = call.getData().getLong("end");
            String host = call.getString("host", "127.0.0.1");
            if (!("127.0.0.1".equals(host) || "localhost".equals(host))) host = "127.0.0.1";
            JSArray in = call.getArray("hashes");
            JSONArray hashes = new JSONArray();
            for (int i = 0; in != null && i < in.length(); i++) { String h = in.optString(i); if (HASH.matcher(h).matches()) hashes.put(h.toLowerCase()); }
            if (hashes.length() == 0) { call.reject("El evento no tiene enlaces válidos."); return; }
            if (end <= start || end <= System.currentTimeMillis()) { call.reject("La hora de fin debe ser futura."); return; }
            if (end - start > MAX_MS) { call.reject("Máximo 8 horas por grabación."); return; }

            String id = Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 1295), 36);
            JSONObject rec = new JSONObject();
            rec.put("id", id); rec.put("key", call.getString("key", "")); rec.put("title", call.getString("title", "Evento")); rec.put("sport", call.getString("sport", ""));
            rec.put("start", start); rec.put("end", end); rec.put("hashes", hashes); rec.put("host", host); rec.put("port", call.getInt("port", 6878));
            rec.put("status", "scheduled"); rec.put("bytes", 0); rec.put("error", ""); rec.put("name", ""); rec.put("uri", "");
            RecordingStore.add(getContext(), rec);
            arm(getContext(), rec);
            call.resolve(JSObject.fromJSONObject(pub(rec)));
        } catch (Exception e) {
            call.reject("No se pudo programar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            String id = call.getString("id", "");
            JSONObject rec = RecordingStore.find(getContext(), id);
            if (rec == null) { call.reject("No existe esa grabación."); return; }
            if (RecorderService.isRunning(id)) RecorderService.requestStop(getContext(), id);
            else if ("scheduled".equals(rec.optString("status"))) {
                disarm(getContext(), id);
                RecordingStore.update(getContext(), id, new JSONObject().put("status", "cancelled"));
            }
            call.resolve(JSObject.fromJSONObject(pub(RecordingStore.find(getContext(), id))));
        } catch (Exception e) {
            call.reject("No se pudo cancelar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            Context c = getContext();
            String id = call.getString("id", "");
            JSONObject rec = RecordingStore.find(c, id);
            if (rec == null) { call.resolve(); return; }
            if (RecorderService.isRunning(id)) RecorderService.requestStop(c, id);
            disarm(c, id);
            deleteFile(c, rec);
            RecordingStore.remove(c, id);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo borrar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void open(PluginCall call) {
        try {
            Context c = getContext();
            JSONObject rec = RecordingStore.find(c, call.getString("id", ""));
            if (rec == null || rec.optString("uri").isEmpty()) { call.reject("El archivo ya no existe."); return; }
            Uri u = Uri.parse(rec.optString("uri"));
            if ("file".equals(u.getScheme()) && u.getPath() != null) u = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", new File(u.getPath()));
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(u, "video/*").putExtra("title", rec.optString("title"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                c.startActivity(new Intent(view).setPackage("org.videolan.vlc"));
            } catch (ActivityNotFoundException noVlc) {
                Intent pick = Intent.createChooser(view, "Ver grabación con");
                pick.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(pick);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo abrir la grabación: " + e.getMessage());
        }
    }
}
