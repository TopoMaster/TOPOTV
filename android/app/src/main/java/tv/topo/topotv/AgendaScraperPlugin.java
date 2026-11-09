package tv.topo.topotv;

import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lee una página que se dibuja con JavaScript (la agenda de Ciriaco) igual que hace Electron en Windows:
 * carga la URL en un WebView oculto, espera a que exista un elemento y ejecuta un script que devuelve el resultado.
 */
@CapacitorPlugin(name = "AgendaScraper")
public class AgendaScraperPlugin extends Plugin {

    @PluginMethod
    public void scrape(final PluginCall call) {
        final String url = call.getString("url");
        final String script = call.getString("script");
        final String ready = call.getString("readySelector", "body");
        final int timeoutMs = call.getInt("timeoutMs", 45000);
        if (url == null || script == null) {
            call.reject("Faltan la URL o el script.");
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                final Handler handler = new Handler(Looper.getMainLooper());
                final WebView web = new WebView(getContext());
                final boolean[] finished = { false };
                final boolean[] polling = { false };
                final long started = System.currentTimeMillis();

                WebSettings settings = web.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setLoadsImagesAutomatically(false);

                final Runnable[] poll = new Runnable[1];

                // Cierra el WebView y responde una sola vez
                final java.util.function.Consumer<String> done = new java.util.function.Consumer<String>() {
                    @Override
                    public void accept(String error) {
                        if (finished[0]) return;
                        finished[0] = true;
                        handler.removeCallbacksAndMessages(null);
                        web.stopLoading();
                        web.destroy();
                        if (error != null) call.reject(error);
                    }
                };

                poll[0] = new Runnable() {
                    @Override
                    public void run() {
                        if (finished[0]) return;
                        if (System.currentTimeMillis() - started > timeoutMs) {
                            done.accept("TIMEOUT");
                            return;
                        }
                        web.evaluateJavascript("!!document.querySelector('" + ready.replace("'", "\\'") + "')", value -> {
                            if (finished[0]) return;
                            if ("true".equals(value)) {
                                web.evaluateJavascript(script, result -> {
                                    if (finished[0]) return;
                                    String data = result;
                                    done.accept(null);
                                    if (data == null || "null".equals(data)) {
                                        call.reject("La página no devolvió datos.");
                                    } else {
                                        JSObject ret = new JSObject();
                                        ret.put("data", data);
                                        call.resolve(ret);
                                    }
                                });
                            } else {
                                handler.postDelayed(poll[0], 500);
                            }
                        });
                    }
                };

                web.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String loadedUrl) {
                        if (!polling[0]) {
                            polling[0] = true;
                            handler.post(poll[0]);
                        }
                    }

                    @Override
                    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                        if (request.isForMainFrame()) {
                            done.accept("NETWORK:" + error.getDescription());
                        }
                    }
                });

                handler.postDelayed(new Runnable() {
                    @Override
                    public void run() { done.accept("TIMEOUT"); }
                }, timeoutMs + 2000);

                web.loadUrl(url);
            }
        });
    }
}
