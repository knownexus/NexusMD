package com.knownexus.nexus;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

/**
 * Settings for one home-screen widget: theme, background opacity, text size, how many rows, and the header. Shown when a
 * widget is added and again from the launcher's widget settings (the widgets are "reconfigurable"). Built in code so it
 * needs no layout of its own.
 */
public class WidgetConfigActivity extends Activity {

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private WidgetConfig config;
    private TextView opacityLabel;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setResult(RESULT_CANCELED); // backing out leaves a newly added widget unplaced
        Intent intent = getIntent();
        if (intent != null && intent.getExtras() != null) {
            widgetId = intent.getExtras().getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        config = WidgetConfig.load(this, widgetId);
        setTitle("Widget settings");

        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);

        root.addView(heading("Theme"));
        root.addView(radios(new String[] { "Follow system", "Light", "Dark" },
            new String[] { WidgetConfig.THEME_SYSTEM, WidgetConfig.THEME_LIGHT, WidgetConfig.THEME_DARK },
            config.theme, v -> config.theme = (String) v));

        opacityLabel = heading("");
        root.addView(opacityLabel);
        SeekBar opacity = new SeekBar(this);
        opacity.setMax(80); // 20..100 %
        opacity.setProgress(config.opacity - 20);
        showOpacity();
        opacity.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) { config.opacity = p + 20; showOpacity(); }
            @Override public void onStartTrackingTouch(SeekBar s) { }
            @Override public void onStopTrackingTouch(SeekBar s) { }
        });
        root.addView(opacity);

        root.addView(heading("Text size"));
        root.addView(radios(new String[] { "Small", "Medium", "Large" },
            new Integer[] { WidgetConfig.TEXT_SMALL, WidgetConfig.TEXT_MEDIUM, WidgetConfig.TEXT_LARGE },
            config.textSize, v -> config.textSize = (Integer) v));

        root.addView(heading("Rows shown"));
        root.addView(radios(new String[] { "As many as fit", "3", "5", "8" },
            new Integer[] { 0, 3, 5, 8 }, config.maxRows, v -> config.maxRows = (Integer) v));

        Switch header = new Switch(this);
        header.setText("Show title and count");
        header.setChecked(config.showHeader);
        header.setOnCheckedChangeListener((CompoundButton b, boolean on) -> config.showHeader = on);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hp.topMargin = pad;
        root.addView(header, hp);

        Button done = new Button(this);
        done.setText("Done");
        done.setOnClickListener(v -> finishWithResult());
        LinearLayout.LayoutParams dp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        dp.gravity = Gravity.END;
        dp.topMargin = pad;
        root.addView(done, dp);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
    }

    private void showOpacity() { opacityLabel.setText("Background opacity: " + config.opacity + "%"); }

    private TextView heading(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(14f);
        t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setPadding(0, (int) (14 * getResources().getDisplayMetrics().density), 0, 4);
        return t;
    }

    private interface Pick { void on(Object value); }

    private RadioGroup radios(String[] labels, Object[] values, Object current, Pick pick) {
        RadioGroup g = new RadioGroup(this);
        g.setOrientation(RadioGroup.VERTICAL);
        for (int i = 0; i < labels.length; i++) {
            RadioButton b = new RadioButton(this);
            b.setText(labels[i]);
            b.setId(View.generateViewId());
            final Object value = values[i];
            b.setOnClickListener(v -> pick.on(value));
            g.addView(b);
            if (value.equals(current)) g.check(b.getId());
        }
        return g;
    }

    private void finishWithResult() {
        config.save(this, widgetId);
        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(widgetId);
        if (info != null) {
            Intent update = new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            update.setComponent(info.provider);
            update.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[] { widgetId });
            sendBroadcast(update);
        }
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, result);
        finish();
    }
}
