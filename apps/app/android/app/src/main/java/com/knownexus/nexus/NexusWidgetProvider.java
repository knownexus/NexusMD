package com.knownexus.nexus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.Date;

/**
 * Base of the home-screen widgets. What one shows depends on its size (read from the launcher, redrawn when it is resized):
 *   compact (short or narrow): a big number and the title;
 *   list: title, count and as many rows as fit;
 *   large (tall and wide): the list plus a right-hand detail on each row and an "Updated" line.
 * Look (theme, opacity, text size, rows, header) comes from the widget's WidgetConfig.
 * Data is the snapshot the page last pushed (HomeWidgetsPlugin). A tap opens nexusmd://widget/<kind>; a row of the Links
 * widget opens nexusmd://widget/link?id=<Home widget id>, which routeWidgetLink() turns back into navigation.
 */
public abstract class NexusWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "nexus_widgets";
    static final String KEY_SNAPSHOT = "snapshot";
    static final int ROWS = 8;
    private static final int[] ROW = {
        R.id.widget_row0, R.id.widget_row1, R.id.widget_row2, R.id.widget_row3,
        R.id.widget_row4, R.id.widget_row5, R.id.widget_row6, R.id.widget_row7 };
    private static final int[] ROW_T = {
        R.id.widget_row0_t, R.id.widget_row1_t, R.id.widget_row2_t, R.id.widget_row3_t,
        R.id.widget_row4_t, R.id.widget_row5_t, R.id.widget_row6_t, R.id.widget_row7_t };
    private static final int[] ROW_M = {
        R.id.widget_row0_m, R.id.widget_row1_m, R.id.widget_row2_m, R.id.widget_row3_m,
        R.id.widget_row4_m, R.id.widget_row5_m, R.id.widget_row6_m, R.id.widget_row7_m };

    /** The path after nexusmd://widget/: tasks, notes, git or link. */
    abstract String kind();
    abstract String title(Context context);
    /** Fills the content from the snapshot (which may be an empty object). */
    abstract Content content(JSONObject snapshot) throws Exception;

    static final class Content {
        String big = "";        // the compact tile's number
        String count = "";      // the list header's right-hand text
        String empty = "";
        final String[] rows = new String[ROWS];
        final String[] meta = new String[ROWS];      // right-hand detail, shown when large
        final String[] rowLinks = new String[ROWS];  // per-row address, or null to use the widget's own
        int used = 0;

        void add(String text, String meta, String link) {
            if (used < ROWS && text != null && !text.isEmpty()) {
                rows[used] = text;
                this.meta[used] = meta == null ? "" : meta;
                rowLinks[used] = link;
                used++;
            }
        }
    }

    private enum Tier { COMPACT, LIST, LARGE }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) draw(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, id); // resized: pick the layout for the new size
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        for (int id : ids) WidgetConfig.delete(context, id);
    }

    private void draw(Context context, AppWidgetManager manager, int id) {
        Bundle o = manager.getAppWidgetOptions(id);
        // The smaller of the two reported sizes is what is certainly available in either orientation.
        int w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        manager.updateAppWidget(id, build(context, WidgetConfig.load(context, id), w, h));
    }

    private static Tier tierFor(int w, int h) {
        if (w <= 0 || h <= 0) return Tier.LIST; // size unknown (older launchers): the default list
        if (h < 100 || w < 130) return Tier.COMPACT;
        return h >= 220 && w >= 220 ? Tier.LARGE : Tier.LIST;
    }

    private static boolean dark(Context context, WidgetConfig c) {
        if (WidgetConfig.THEME_DARK.equals(c.theme)) return true;
        if (WidgetConfig.THEME_LIGHT.equals(c.theme)) return false;
        return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private RemoteViews build(Context context, WidgetConfig cfg, int w, int h) {
        Content c = new Content();
        try {
            String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null);
            if (raw != null) c = content(new JSONObject(raw));
        } catch (Exception e) {
            c = new Content(); // a snapshot that does not parse draws as empty rather than crashing the launcher
        }
        boolean night = dark(context, cfg);
        int bg = night ? 0x1E2228 : 0xFFFFFF;
        int text = night ? 0xE8ECF1 : 0x1B1F24;
        int muted = night ? 0x9AA5B4 : 0x5F6B7A;
        int alpha = Math.round(255 * cfg.opacity / 100f);

        Tier tier = tierFor(w, h);
        RemoteViews v = new RemoteViews(context.getPackageName(), tier == Tier.COMPACT ? R.layout.widget_compact : R.layout.widget_list);
        v.setInt(R.id.widget_bg, "setColorFilter", Color.argb(alpha, Color.red(bg), Color.green(bg), Color.blue(bg)));
        v.setTextViewText(R.id.widget_title, title(context));
        v.setTextColor(R.id.widget_title, text);
        float sp = cfg.rowSp();
        v.setOnClickPendingIntent(R.id.widget_root, tap(context, kind(), 0));

        if (tier == Tier.COMPACT) {
            v.setTextViewText(R.id.widget_big, c.big.isEmpty() ? "–" : c.big);
            v.setTextColor(R.id.widget_big, text);
            v.setTextViewTextSize(R.id.widget_big, TypedValue.COMPLEX_UNIT_SP, sp * 2.4f);
            v.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, sp);
            v.setTextColor(R.id.widget_title, muted);
            return v;
        }

        v.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP, sp + 2);
        v.setTextViewText(R.id.widget_count, c.count);
        v.setTextColor(R.id.widget_count, muted);
        v.setTextViewTextSize(R.id.widget_count, TypedValue.COMPLEX_UNIT_SP, sp - 1);
        v.setViewVisibility(R.id.widget_header, cfg.showHeader ? View.VISIBLE : View.GONE);

        // How many rows fit: the height less the padding and header, over a row's height (its text plus its gap).
        float rowDp = sp * 1.25f + 5;
        float headerDp = cfg.showHeader ? sp + 2 + 6 : 0;
        float footerDp = tier == Tier.LARGE ? sp + 8 : 0;
        int fit = h <= 0 ? 5 : Math.max(1, (int) ((h - 24 - headerDp - footerDp) / rowDp));
        int show = Math.min(Math.min(fit, ROWS), cfg.maxRows > 0 ? cfg.maxRows : ROWS);
        show = Math.min(show, c.used);

        v.setTextViewText(R.id.widget_empty, c.empty.isEmpty() ? "Open NexusMD to load this." : c.empty);
        v.setTextColor(R.id.widget_empty, muted);
        v.setTextViewTextSize(R.id.widget_empty, TypedValue.COMPLEX_UNIT_SP, sp);
        v.setViewVisibility(R.id.widget_empty, c.used == 0 ? View.VISIBLE : View.GONE);

        for (int i = 0; i < ROWS; i++) {
            if (i < show) {
                v.setTextViewText(ROW_T[i], c.rows[i]);
                v.setTextColor(ROW_T[i], text);
                v.setTextViewTextSize(ROW_T[i], TypedValue.COMPLEX_UNIT_SP, sp);
                boolean detail = tier == Tier.LARGE && !c.meta[i].isEmpty();
                v.setTextViewText(ROW_M[i], c.meta[i]);
                v.setTextColor(ROW_M[i], muted);
                v.setTextViewTextSize(ROW_M[i], TypedValue.COMPLEX_UNIT_SP, sp - 2);
                v.setViewVisibility(ROW_M[i], detail ? View.VISIBLE : View.GONE);
                v.setViewVisibility(ROW[i], View.VISIBLE);
                v.setOnClickPendingIntent(ROW[i], tap(context, c.rowLinks[i] != null ? c.rowLinks[i] : kind(), 10 + i));
            } else {
                v.setViewVisibility(ROW[i], View.GONE);
            }
        }

        boolean footer = tier == Tier.LARGE;
        v.setViewVisibility(R.id.widget_footer, footer ? View.VISIBLE : View.GONE);
        if (footer) {
            long at = updatedAt(context);
            v.setTextViewText(R.id.widget_footer, at > 0 ? "Updated " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(at)) : "");
            v.setTextColor(R.id.widget_footer, muted);
            v.setTextViewTextSize(R.id.widget_footer, TypedValue.COMPLEX_UNIT_SP, sp - 3);
        }
        return v;
    }

    private static long updatedAt(Context context) {
        try {
            String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null);
            return raw == null ? 0 : new JSONObject(raw).optLong("updatedAt", 0);
        } catch (Exception e) {
            return 0;
        }
    }

    private PendingIntent tap(Context context, String path, int slot) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("nexusmd://widget/" + path));
        intent.setClass(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // One request code per kind and slot, so the system does not hand one widget another's intent.
        int code = (kind().hashCode() & 0xffff) * 16 + slot;
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Redraws every placed widget of every kind. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        Class<?>[] kinds = { TasksWidgetProvider.class, NotesWidgetProvider.class, GitWidgetProvider.class, LinksWidgetProvider.class };
        for (Class<?> k : kinds) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, k));
            if (ids.length == 0) continue;
            Intent update = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            update.setClass(context, k);
            update.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            context.sendBroadcast(update);
        }
    }

    static JSONArray array(JSONObject o, String key) {
        JSONArray a = o == null ? null : o.optJSONArray(key);
        return a == null ? new JSONArray() : a;
    }
}
