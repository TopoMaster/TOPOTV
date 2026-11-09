package tv.topo.topotv;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.function.BooleanSupplier;

/**
 * Comprobación de enlaces del motor AceStream: abre el stream, espera el primer trozo de datos y lo cierra.
 * Se hace desde Java (no desde la web) para no depender de las cabeceras CORS del motor.
 */
final class LinkProbe {
    private LinkProbe() { }

    /** ¿Da datos este enlace antes de {@code timeoutMs}? */
    static boolean probe(String host, int port, String hash, int timeoutMs) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + host + ":" + port + "/ace/getstream?id=" + hash).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(timeoutMs);
            if (c.getResponseCode() != 200) return false;
            try (InputStream in = c.getInputStream()) {
                byte[] b = new byte[1024];
                return in.read(b) > 0;
            }
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) { try { c.disconnect(); } catch (Exception ignored) { } }
        }
    }

    /**
     * Prueba los enlaces de una grabación de uno en uno, deja primero el que funciona y anota
     * check = { at, tested, ok, pos } (pos = posición original del enlace que funcionó).
     * Devuelve null si no existe la grabación o se pidió parar.
     */
    static JSONObject preflight(Context c, String id, int timeoutMs, BooleanSupplier stop) {
        try {
            JSONObject rec = RecordingStore.find(c, id);
            if (rec == null) return null;
            JSONArray hashes = rec.optJSONArray("hashes");
            if (hashes == null || hashes.length() == 0) return null;
            String host = rec.optString("host", "127.0.0.1");
            int port = rec.optInt("port", 6878);
            int pos = -1;
            for (int i = 0; i < hashes.length(); i++) {
                if (stop != null && stop.getAsBoolean()) return null;
                if (probe(host, port, hashes.optString(i), timeoutMs)) { pos = i; break; }
            }
            JSONObject check = new JSONObject();
            check.put("at", System.currentTimeMillis());
            check.put("tested", pos < 0 ? hashes.length() : pos + 1);
            check.put("ok", pos >= 0);
            check.put("pos", pos);
            JSONObject patch = new JSONObject().put("check", check);
            if (pos > 0) {
                JSONArray reordered = new JSONArray().put(hashes.optString(pos));
                for (int i = 0; i < hashes.length(); i++) if (i != pos) reordered.put(hashes.optString(i));
                patch.put("hashes", reordered);
            }
            RecordingStore.update(c, id, patch);
            return check;
        } catch (Exception e) {
            return null;
        }
    }
}
