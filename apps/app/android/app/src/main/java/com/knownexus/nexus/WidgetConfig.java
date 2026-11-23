package com.knownexus.nexus;

import android.content.Context;
import android.content.SharedPreferences;

/** One widget's look, chosen in WidgetConfigActivity and kept per widget id. */
final class WidgetConfig {
    static final String PREFS = "nexus_widget_config";
    static final String THEME_SYSTEM = "system", THEME_LIGHT = "light", THEME_DARK = "dark";
    static final int TEXT_SMALL = 0, TEXT_MEDIUM = 1, TEXT_LARGE = 2;

    String theme = THEME_SYSTEM;
    int opacity = 100;       // background opacity, 20..100 (%)
    int textSize = TEXT_MEDIUM;
    int maxRows = 0;         // 0 = as many as fit
    boolean showHeader = true;

    static WidgetConfig load(Context context, int id) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        WidgetConfig c = new WidgetConfig();
        String t = p.getString(id + ".theme", THEME_SYSTEM);
        c.theme = THEME_LIGHT.equals(t) || THEME_DARK.equals(t) ? t : THEME_SYSTEM;
        c.opacity = Math.max(20, Math.min(100, p.getInt(id + ".opacity", 100)));
        c.textSize = Math.max(TEXT_SMALL, Math.min(TEXT_LARGE, p.getInt(id + ".text", TEXT_MEDIUM)));
        c.maxRows = Math.max(0, Math.min(NexusWidgetProvider.ROWS, p.getInt(id + ".rows", 0)));
        c.showHeader = p.getBoolean(id + ".header", true);
        return c;
    }

    void save(Context context, int id) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(id + ".theme", theme).putInt(id + ".opacity", opacity).putInt(id + ".text", textSize)
            .putInt(id + ".rows", maxRows).putBoolean(id + ".header", showHeader).apply();
    }

    static void delete(Context context, int id) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(id + ".theme").remove(id + ".opacity").remove(id + ".text").remove(id + ".rows").remove(id + ".header").apply();
    }

    /** Row text size in sp. */
    float rowSp() { return textSize == TEXT_SMALL ? 11f : textSize == TEXT_LARGE ? 16f : 13f; }
}
