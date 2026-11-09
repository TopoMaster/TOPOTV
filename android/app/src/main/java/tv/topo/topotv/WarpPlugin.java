package tv.topo.topotv;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.VpnService;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.wireguard.android.backend.GoBackend;
import com.wireguard.android.backend.Tunnel;
import com.wireguard.config.Config;
import com.wireguard.config.Interface;
import com.wireguard.config.Peer;
import com.wireguard.crypto.KeyPair;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Cloudflare WARP dentro de la app: túnel WireGuard (GoBackend) con una cuenta WARP gratuita registrada
 * en el primer uso. Es un VPN "por aplicación": solo el tráfico de TOPOTV pasa por él, así que el motor
 * AceStream, VLC y el resto del móvil no se ven afectados. TOPOTV lo conecta al actualizar la agenda
 * y lo desconecta al terminar.
 */
@CapacitorPlugin(name = "Warp")
public class WarpPlugin extends Plugin {
    private static final String PREFS = "topotv_warp";
    private static final String REG_URL = "https://api.cloudflareclient.com/v0a2158/reg";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private GoBackend backend;
    private final Tunnel tunnel = new Tunnel() {
        @Override public String getName() { return "topotvwarp"; }
        @Override public void onStateChange(Tunnel.State newState) { /* el estado se consulta con status() */ }
    };

    private GoBackend backend() {
        if (backend == null) backend = new GoBackend(getContext().getApplicationContext());
        return backend;
    }

    /* ── Registro de la cuenta WARP (una vez) ───────────────────── */
    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void ensureAccount() throws Exception {
        SharedPreferences p = prefs();
        if (p.contains("private_key") && p.contains("peer_public_key")) return;

        KeyPair keys = new KeyPair();
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        JSONObject body = new JSONObject();
        body.put("key", keys.getPublicKey().toBase64());
        body.put("install_id", "");
        body.put("fcm_token", "");
        body.put("tos", iso.format(new Date()));
        body.put("type", "Android");
        body.put("model", "TOPOTV");
        body.put("locale", "es_ES");

        HttpURLConnection c = (HttpURLConnection) new URL(REG_URL).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("User-Agent", "okhttp/3.12.1");
        c.setRequestProperty("CF-Client-Version", "a-6.3-2015");
        try (OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        if (c.getResponseCode() / 100 != 2) throw new Exception("Cloudflare respondió HTTP " + c.getResponseCode() + " al registrar WARP.");
        StringBuilder sb = new StringBuilder();
        try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
            String line; while ((line = r.readLine()) != null) sb.append(line);
        }
        JSONObject cfg = new JSONObject(sb.toString()).getJSONObject("config");
        JSONObject addr = cfg.getJSONObject("interface").getJSONObject("addresses");
        JSONObject peer = cfg.getJSONArray("peers").getJSONObject(0);
        p.edit()
            .putString("private_key", keys.getPrivateKey().toBase64())
            .putString("address_v4", addr.getString("v4"))
            .putString("address_v6", addr.optString("v6", ""))
            .putString("peer_public_key", peer.getString("public_key"))
            .putString("endpoint", peer.getJSONObject("endpoint").optString("host", "engage.cloudflareclient.com:2408"))
            .apply();
    }

    private Config buildConfig() throws Exception {
        SharedPreferences p = prefs();
        String addresses = p.getString("address_v4", "") + "/32";
        String v6 = p.getString("address_v6", "");
        if (!v6.isEmpty()) addresses += "," + v6 + "/128";
        Interface iface = new Interface.Builder()
            .parsePrivateKey(p.getString("private_key", ""))
            .parseAddresses(addresses)
            .parseDnsServers("1.1.1.1, 1.0.0.1")
            .parseMtu("1280")
            .includeApplication(getContext().getPackageName())   // solo el tráfico de TOPOTV
            .build();
        Peer peer = new Peer.Builder()
            .parsePublicKey(p.getString("peer_public_key", ""))
            .parseAllowedIPs("0.0.0.0/0, ::/0")
            .parseEndpoint(p.getString("endpoint", "engage.cloudflareclient.com:2408"))
            .build();
        return new Config.Builder().setInterface(iface).addPeer(peer).build();
    }

    /* ── API para la web ────────────────────────────────────────── */
    @PluginMethod
    public void connect(PluginCall call) {
        Intent permission = VpnService.prepare(getContext());
        if (permission != null) {
            startActivityForResult(call, permission, "vpnPermissionResult");   // diálogo del sistema (solo la primera vez)
            return;
        }
        doConnect(call);
    }

    @ActivityCallback
    private void vpnPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK) doConnect(call);
        else call.reject("VPN_DENIED");
    }

    private void doConnect(final PluginCall call) {
        io.execute(() -> {
            try {
                ensureAccount();
                backend().setState(tunnel, Tunnel.State.UP, buildConfig());
                JSObject ret = new JSObject();
                ret.put("connected", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("No se pudo conectar WARP: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void disconnect(final PluginCall call) {
        io.execute(() -> {
            try {
                backend().setState(tunnel, Tunnel.State.DOWN, null);
                JSObject ret = new JSObject();
                ret.put("connected", false);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("No se pudo desconectar WARP: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void status(final PluginCall call) {
        io.execute(() -> {
            JSObject ret = new JSObject();
            try { ret.put("connected", backend().getState(tunnel) == Tunnel.State.UP); }
            catch (Exception e) { ret.put("connected", false); }
            ret.put("registered", prefs().contains("private_key"));
            call.resolve(ret);
        });
    }
}
