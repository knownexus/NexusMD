package com.knownexus.nexus;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

/** Open planner tasks. */
public class TasksWidgetProvider extends NexusWidgetProvider {
    @Override String kind() { return "tasks"; }
    @Override String title(Context context) { return "Tasks"; }

    @Override
    Content content(JSONObject snapshot) throws Exception {
        Content c = new Content();
        JSONObject tasks = snapshot.optJSONObject("tasks");
        if (tasks == null) return c;
        int open = tasks.optInt("open", 0);
        c.count = open == 1 ? "1 open" : open + " open";
        c.empty = "Nothing to do.";
        JSONArray items = array(tasks, "items");
        for (int i = 0; i < items.length(); i++) c.add("• " + items.getJSONObject(i).optString("title"), null);
        return c;
    }
}
