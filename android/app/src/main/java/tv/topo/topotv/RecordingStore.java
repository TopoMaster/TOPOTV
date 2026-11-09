package tv.topo.topotv;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

/** Lista de grabaciones (programadas, en curso y terminadas) guardada en SharedPreferences como JSON. */
final class RecordingStore {
    private static final String PREFS = "topotv_rec";

    private RecordingStore() { }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized JSONArray all(Context c) {
        try { return new JSONArray(prefs(c).getString("list", "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    private static void save(Context c, JSONArray list) {
        prefs(c).edit().putString("list", list.toString()).apply();
    }

    static synchronized JSONObject find(Context c, String id) {
        JSONArray list = all(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    static synchronized void add(Context c, JSONObject rec) {
        JSONArray list = all(c);
        list.put(rec);
        save(c, list);
    }

    /** Mezcla los campos de patch en la grabación indicada. */
    static synchronized void update(Context c, String id, JSONObject patch) {
        JSONArray list = all(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null || !id.equals(o.optString("id"))) continue;
            try {
                Iterator<String> keys = patch.keys();
                while (keys.hasNext()) { String k = keys.next(); o.put(k, patch.get(k)); }
            } catch (Exception ignored) { }
            break;
        }
        save(c, list);
    }

    static synchronized void remove(Context c, String id) {
        JSONArray list = all(c);
        JSONArray out = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) out.put(o);
        }
        save(c, out);
    }
}
