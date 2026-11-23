package com.knownexus.nexus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Base of the home-screen widgets. Each one is a title, a count line and up to ROWS rows, drawn from the snapshot the page
 * last pushed (HomeWidgetsPlugin). A tap opens nexusmd://widget/<kind> in the app; a row of the Links widget opens
 * nexusmd://widget/link?id=<Home widget id>. The page turns those addresses back into navigation (routeWidgetLink).
 */
public abstract class NexusWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "nexus_widgets";
    static final String KEY_SNAPSHOT = "snapshot";
    static final int ROWS = 5;
    private static final int[] ROW_IDS = {
        R.id.widget_row0, R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4 };

    /** The path after nexusmd://widget/: tasks, notes, git or link. */
    abstract String kind();
    abstract String title(Context context);
    /** Fills the count line and rows from the snapshot (which may be an empty object). */
    abstract Content content(JSONObject snapshot) throws Exception;

    static final class Content {
        String count = "";
        String empty = "";
        final String[] rows = new String[ROWS];
        final String[] rowLinks = new String[ROWS]; // per-row address, or null to use the widget's own
        int used = 0;

        void add(String text, String link) {
            if (used < ROWS && text != null && !text.isEmpty()) {
                rows[used] = text;
                rowLinks[used] = link;
                used++;
            }
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_list);
        Content c = new Content();
        try {
            String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null);
            if (raw != null) c = content(new JSONObject(raw));
        } catch (Exception e) {
            c = new Content(); // a snapshot that does not parse draws as empty rather than crashing the launcher
        }
        views.setTextViewText(R.id.widget_title, title(context));
        views.setTextViewText(R.id.widget_count, c.count);
        views.setViewVisibility(R.id.widget_count, c.count.isEmpty() ? View.GONE : View.VISIBLE);
        boolean none = c.used == 0;
        views.setTextViewText(R.id.widget_empty, c.empty.isEmpty() ? "Open NexusMD to load this." : c.empty);
        views.setViewVisibility(R.id.widget_empty, none ? View.VISIBLE : View.GONE);
        for (int i = 0; i < ROWS; i++) {
            if (i < c.used) {
                views.setTextViewText(ROW_IDS[i], c.rows[i]);
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
                views.setOnClickPendingIntent(ROW_IDS[i], tap(context, c.rowLinks[i] != null ? c.rowLinks[i] : kind(), 10 + i));
            } else {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
            }
        }
        views.setOnClickPendingIntent(R.id.widget_root, tap(context, kind(), 0));
        return views;
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
