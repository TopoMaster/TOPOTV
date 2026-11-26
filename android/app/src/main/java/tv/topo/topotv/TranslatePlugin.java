package tv.topo.topotv;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.nl.languageid.LanguageIdentification;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;

import java.util.HashMap;
import java.util.Map;

/**
 * Traducción dentro del móvil con Google ML Kit (los mismos paquetes sin conexión que la app Google Traductor).
 * Gratis y sin cuenta: la primera vez que hace falta un idioma se descarga su paquete (~30 MB) y después
 * traduce sin internet. Si no se indica el idioma de origen, se detecta.
 */
@CapacitorPlugin(name = "Translate")
public class TranslatePlugin extends Plugin {
    private final Map<String, Translator> translators = new HashMap<>();

    @PluginMethod
    public void translate(PluginCall call) {
        String text = call.getString("text", "");
        String to = call.getString("to", "es");
        String from = call.getString("from");
        if (text == null || text.trim().isEmpty()) { done(call, text, from); return; }
        if (from != null && !from.isEmpty()) { run(call, text, from, to); return; }
        LanguageIdentification.getClient().identifyLanguage(text)
            .addOnSuccessListener(code -> {
                if (code == null || "und".equals(code)) done(call, text, null);
                else run(call, text, code, to);
            })
            .addOnFailureListener(e -> done(call, text, null));
    }

    private void run(PluginCall call, String text, String from, String to) {
        String src = TranslateLanguage.fromLanguageTag(from);
        String tgt = TranslateLanguage.fromLanguageTag(to);
        if (src == null || tgt == null || src.equals(tgt)) { done(call, text, from); return; }
        String key = src + ">" + tgt;
        Translator t;
        synchronized (translators) {
            t = translators.get(key);
            if (t == null) {
                t = Translation.getClient(new TranslatorOptions.Builder().setSourceLanguage(src).setTargetLanguage(tgt).build());
                translators.put(key, t);
            }
        }
        final Translator tr = t;
        tr.downloadModelIfNeeded(new DownloadConditions.Builder().build())
            .addOnSuccessListener(v -> tr.translate(text)
                .addOnSuccessListener(out -> done(call, out, src))
                .addOnFailureListener(e -> done(call, text, src)))
            .addOnFailureListener(e -> call.reject("No se pudo descargar el idioma: " + e.getMessage()));
    }

    private void done(PluginCall call, String text, String from) {
        JSObject r = new JSObject();
        r.put("text", text);
        if (from != null) r.put("from", from);
        call.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (translators) { for (Translator t : translators.values()) t.close(); translators.clear(); }
    }
}
